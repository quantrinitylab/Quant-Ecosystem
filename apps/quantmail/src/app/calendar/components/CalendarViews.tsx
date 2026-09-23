'use client';

import React from 'react';
import { Skeleton, ErrorState } from '@quant/shared-ui';
import { showToast } from '../../../components/InboxToast';
import {
  IconCalendar,
  IconCake,
  IconFlag,
  IconFlower,
  IconMapPin,
} from '../../../components/icons';
import type { CalendarEventLike, EntryType, DayMarkFlags } from '../types';
import { WEEKDAYS_SHORT, MONTH_NAMES, DAY_MARKS, dayMarkLabel } from '../types';
import type { Holiday } from '../../../lib/holidays';
import { dayKey, startOf, endOf, hhmm } from '../lib/calendar-geometry';

function DayMarks({ flags, onBrand }: { flags: DayMarkFlags; onBrand: boolean }) {
  const marks = DAY_MARKS.filter((mark) => flags[mark.key]).slice(0, 3);
  if (marks.length === 0) return null;

  return (
    <span
      className="pointer-events-none absolute inset-x-0 bottom-[3px] flex items-center justify-center gap-[3px]"
      aria-hidden="true"
    >
      {marks.map((mark) => (
        <span
          key={mark.key}
          className="size-[3px] rounded-full"
          style={{ backgroundColor: onBrand ? '#111111' : mark.color }}
        />
      ))}
    </span>
  );
}

export interface CalendarViewsProps {
  // Date picker props
  currentHeight: number;
  isDragging: boolean;
  isMonthExpanded: boolean;
  currentWeekDays: Array<{
    date: Date;
    dayLetter: string;
    dayNum: number;
    isSelected: boolean;
    isToday: boolean;
    key: string;
    hasHoliday: boolean;
    hasEvents: boolean;
    hasPeriod: boolean;
    hasTask: boolean;
    hasUrgentTask: boolean;
    hasBirthday: boolean;
    hasPlainEvent: boolean;
    holidayName?: string;
  }>;
  monthWeeks: Array<
    Array<{
      date: Date;
      dayNum: number;
      isCurrentMonth: boolean;
      isSelected: boolean;
      isToday: boolean;
      key: string;
      hasHolidays: boolean;
      hasEvents: boolean;
      hasPeriod: boolean;
      hasTask: boolean;
      hasUrgentTask: boolean;
      hasBirthday: boolean;
      hasPlainEvent: boolean;
      holidayName?: string;
    }>
  >;
  selectDate: (date: Date) => void;
  handlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handlePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;

  // Agenda stream props
  scrollHostRef: React.RefObject<HTMLDivElement | null>;
  handleScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  isLoadingPast: boolean;
  isLoadingFuture: boolean;
  isInitialLoading: boolean;
  error: Error | null;
  refetch: () => void;
  visibleAgendaDays: Array<{
    date: Date;
    key: string;
    dayNum: number;
    weekdayName: string;
    monthShort: string;
    monthBreak: string | null;
    isToday: boolean;
    isTomorrow: boolean;
    events: CalendarEventLike[];
    holidays: Holiday[];
  }>;
  searchFilter: string;
  selectedDate: Date;
  dateItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  openDedicatedSheet: (type: EntryType, date?: Date) => void;
  setSelectedEvent: (ev: CalendarEventLike) => void;
  handleDeleteEvent: (id: string, e?: React.MouseEvent) => void;
}

export function CalendarViews({
  currentHeight,
  isDragging,
  isMonthExpanded,
  currentWeekDays,
  monthWeeks,
  selectDate,
  handlePointerDown,
  handlePointerMove,
  handlePointerUp,
  scrollHostRef,
  handleScroll,
  isLoadingPast,
  isLoadingFuture,
  isInitialLoading,
  error,
  refetch,
  visibleAgendaDays,
  searchFilter,
  selectedDate,
  dateItemRefs,
  openDedicatedSheet,
  setSelectedEvent,
  handleDeleteEvent,
}: CalendarViewsProps) {
  return (
    <>
      {/* Date picker: drag the handle at the bottom to swap the week strip for the month grid. */}
      <div
        className="border-b border-[#282C35]/80 bg-[#101014] select-none overflow-hidden relative"
        style={{
          height: `${currentHeight}px`,
          transition: isDragging ? 'none' : 'height 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
          touchAction: 'none',
        }}
      >
        <div className="flex flex-col h-full justify-between px-3 pt-2 pb-1">
          <div className="grid grid-cols-7 text-center py-1">
            {WEEKDAYS_SHORT.map((d, i) => (
              <div key={i} className="text-[11px] font-bold text-[#A1A4AC]">
                {d}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-hidden">
            {!isMonthExpanded ? (
              <div className="grid grid-cols-7 text-center h-[46px] [@media(pointer:coarse)]:h-[52px] items-center">
                {currentWeekDays.map((d) => {
                  let sphereClass = 'text-[#F5F5F5] hover:bg-[#16181D]';

                  if (d.isSelected) {
                    sphereClass = 'bg-[#FF8C42] text-[#111111] font-bold shadow-sm';
                  } else if (d.hasPeriod) {
                    sphereClass =
                      'text-rose-300 bg-rose-950/40 border border-rose-800/60 font-semibold';
                  } else if (d.hasUrgentTask) {
                    sphereClass =
                      'text-[#FF8C42] bg-[#FF8C42]/12 border border-[#FF8C42]/35 shadow-[0_0_10px_rgba(255,140,66,0.12)] font-semibold';
                  } else if (d.hasBirthday) {
                    sphereClass =
                      'text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 font-semibold';
                  } else if (d.isToday) {
                    sphereClass = 'border-2 border-[#FF8C42] text-[#FF8C42] font-semibold';
                  }

                  return (
                    <div key={d.key} className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => selectDate(d.date)}
                        className={`relative size-9 [@media(pointer:coarse)]:size-11 rounded-full flex flex-col items-center justify-center text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101014] ${sphereClass}`}
                        aria-label={`${d.dayNum} ${MONTH_NAMES[d.date.getMonth()]}${d.holidayName ? `, ${d.holidayName}` : ''}${dayMarkLabel(d)}`}
                        title={d.holidayName}
                      >
                        <span>{d.dayNum}</span>
                        <DayMarks flags={d} onBrand={d.isSelected} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-0.5 pt-0.5">
                {monthWeeks.map((week, weekIdx) => (
                  <div
                    key={`month-week-${weekIdx}`}
                    className="grid grid-cols-7 text-center h-[38px] [@media(pointer:coarse)]:h-11 items-center"
                  >
                    {week.map((d) => {
                      let sphereClass = d.isCurrentMonth
                        ? 'text-[#A1A4AC] hover:bg-[#16181D]'
                        : 'text-[#A1A4AC]/50';

                      if (d.isSelected) {
                        sphereClass = 'bg-[#FF8C42] text-[#111111] font-bold shadow-sm';
                      } else if (d.hasPeriod) {
                        sphereClass =
                          'text-rose-300 bg-rose-950/40 border border-rose-800/60 font-semibold';
                      } else if (d.hasUrgentTask) {
                        sphereClass =
                          'text-[#FF8C42] bg-[#FF8C42]/12 border border-[#FF8C42]/35 shadow-[0_0_10px_rgba(255,140,66,0.12)] font-semibold';
                      } else if (d.hasBirthday) {
                        sphereClass =
                          'text-emerald-300 bg-emerald-950/40 border border-emerald-800/60 font-semibold';
                      } else if (d.isToday) {
                        sphereClass = 'border border-[#FF8C42] text-[#FF8C42] font-semibold';
                      }

                      const marks: DayMarkFlags = {
                        hasHoliday: d.hasHolidays,
                        hasPeriod: d.hasPeriod,
                        hasBirthday: d.hasBirthday,
                        hasTask: d.hasTask,
                        hasPlainEvent: d.hasPlainEvent,
                      };

                      return (
                        <div key={d.key} className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => selectDate(d.date)}
                            className={`relative size-8 [@media(pointer:coarse)]:size-11 rounded-full flex flex-col items-center justify-center text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#101014] ${sphereClass}`}
                            aria-label={`${d.dayNum} ${MONTH_NAMES[d.date.getMonth()]}${d.holidayName ? `, ${d.holidayName}` : ''}${dayMarkLabel(marks)}`}
                            title={d.holidayName}
                          >
                            <span>{d.dayNum}</span>
                            <DayMarks flags={marks} onBrand={d.isSelected} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="w-full flex flex-col items-center justify-center py-1.5 cursor-grab active:cursor-grabbing group select-none touch-none"
            style={{ touchAction: 'none' }}
            title="Drag up or down to expand/collapse calendar"
          >
            <div
              className={`w-12 h-1.5 rounded-full transition-all ${
                isDragging
                  ? 'bg-[#FF8C42] scale-110 shadow-[0_0_0_3px_rgba(255,140,66,0.22)]'
                  : 'bg-[#3A404D] group-hover:bg-[#6B6E76]'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Continuous Agenda Feed with Vivid Distinct 3D Liquid Watercolor Cards */}
      <div
        ref={scrollHostRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 space-y-6 pb-28 md:pb-6"
      >
        {isLoadingPast && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs font-bold text-[#FF8C42] animate-pulse">
            <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading earlier dates…</span>
          </div>
        )}

        {isInitialLoading && (
          <div className="space-y-4 py-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rect" width="100%" height="80px" />
            ))}
          </div>
        )}

        {error && (
          <div className="py-8">
            <ErrorState message={error.message} onRetry={() => void refetch()} />
          </div>
        )}

        {!isInitialLoading && !error && (
          <div className="divide-y divide-[#282C35]/60">
            {visibleAgendaDays.length === 0 && (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-[#F5F5F5]">
                  {searchFilter.trim() ? 'No matches in this range' : 'Nothing scheduled'}
                </p>
                <p className="mt-1 text-xs text-[#A1A4AC]">
                  {searchFilter.trim()
                    ? `Nothing here matches “${searchFilter.trim()}”.`
                    : 'This range is clear.'}
                </p>
              </div>
            )}

            {visibleAgendaDays.map((item) => {
              const isSelected = dayKey(item.date) === dayKey(selectedDate);
              const hasEvents = item.events.length > 0;
              const hasHolidays = item.holidays.length > 0;

              const monthBand = item.monthBreak && (
                <div className="flex items-center gap-3 pb-1.5 pt-3 first:pt-0">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#A1A4AC]">
                    {item.monthBreak}
                  </span>
                  <span className="h-px flex-1 bg-[#282C35]/60" />
                </div>
              );

              if (!hasEvents && !hasHolidays) {
                return (
                  <div key={item.key}>
                    {monthBand}
                    <button
                      type="button"
                      ref={(el) => {
                        if (el) dateItemRefs.current.set(item.key, el);
                        else dateItemRefs.current.delete(item.key);
                      }}
                      onClick={() => openDedicatedSheet('event', item.date)}
                      aria-label={`No events on ${item.dayNum} ${item.monthShort}. Add an entry.`}
                      className={`group flex w-full min-h-[32px] items-center gap-2.5 rounded-lg px-2 text-left transition-colors [@media(pointer:coarse)]:min-h-touch ${
                        isSelected ? 'bg-[#16181D]' : 'hover:bg-[#111318]'
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]`}
                    >
                      <span
                        className={`w-[52px] shrink-0 text-xs tabular-nums ${
                          item.isToday
                            ? 'font-semibold text-[#FF8C42]'
                            : isSelected
                              ? 'font-medium text-[#F5F5F5]'
                              : 'text-[#A1A4AC]'
                        }`}
                      >
                        {item.dayNum} {item.monthShort}
                      </span>
                      <span className="text-[#6B6E76]">·</span>
                      <span className="flex-1 truncate text-[11px] text-[#A1A4AC]">
                        {item.isToday ? 'Nothing left today' : 'No events'}
                      </span>
                      <span className="shrink-0 pr-1 text-[11px] font-medium text-[#FF8C42] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(pointer:coarse)]:opacity-100">
                        + Add
                      </span>
                    </button>
                  </div>
                );
              }

              return (
                <div key={item.key}>
                  {monthBand}
                  <div
                    ref={(el) => {
                      if (el) dateItemRefs.current.set(item.key, el);
                      else dateItemRefs.current.delete(item.key);
                    }}
                    className={`rounded-xl py-3 transition-all px-3 ${
                      isSelected
                        ? 'bg-[#181B22] ring-1 ring-white/10 shadow-sm'
                        : 'hover:bg-[#13151A]/60'
                    }`}
                  >
                    <div className="mb-2.5 flex items-baseline gap-2.5">
                      <span
                        className={`text-sm font-semibold tabular-nums tracking-tight ${
                          item.isToday ? 'text-[#FF8C42]' : 'text-[#F5F5F5]'
                        }`}
                      >
                        {item.dayNum} {item.monthShort}
                      </span>
                      <span className="text-[11px] text-[#A1A4AC]">{item.weekdayName}</span>

                      {item.isToday && (
                        <span className="rounded-full border border-[#FF8C42]/35 bg-[#FF8C42]/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#FF8C42] shadow-[0_0_8px_rgba(255,140,66,0.1)]">
                          Today
                        </span>
                      )}
                      {item.isTomorrow && (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-[#A1A4AC]">
                          Tomorrow
                        </span>
                      )}
                    </div>

                    <div className="space-y-3">
                      {/* Holiday Warm Amber Glass Card */}
                      {item.holidays.map((h, hi) => (
                        <div
                          key={hi}
                          className="relative flex items-center justify-between px-4 py-3 rounded-2xl border border-[#FF8C42]/30 bg-[#1E1610]/80 shadow-[0_4px_16px_rgba(0,0,0,0.6)] text-xs overflow-hidden"
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-8 rounded-full bg-[#FF8C42]/15 border border-[#FF8C42]/40 flex items-center justify-center text-[#FFB875] shrink-0">
                              <IconFlag size={15} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm text-[#FFE3C8] tracking-wide">
                                  {h.name}
                                </span>
                                <span className="size-2 rounded-full bg-[#FF8C42]" />
                              </div>
                              {h.description && (
                                <p className="text-[11px] text-[#A1A4AC] mt-0.5">{h.description}</p>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] uppercase font-bold px-2.5 py-1 rounded-full bg-[#FF8C42]/20 text-[#FFB875] border border-[#FF8C42]/40 shadow-sm">
                            Holiday
                          </span>
                        </div>
                      ))}

                      {/* 3D Liquid Glass Watercolor Cards */}
                      {item.events.map((ev) => {
                        const isTask = ev.type === 'task';
                        const isBirthday = ev.type === 'birthday';
                        const isPeriod = ev.type === 'period';

                        let cardBackground = '';
                        let cardBorder = 'border-white/10';
                        let categoryColor = '#FF8C42';
                        let categoryLabel = 'Event';
                        let urgencyColor = '#fbbf24';
                        let urgencyLabel = 'Standard';

                        if (isPeriod) {
                          categoryColor = '#f43f5e';
                          categoryLabel = 'Period';
                          urgencyColor =
                            ev.flowIntensity === 'super_heavy'
                              ? '#be123c'
                              : ev.flowIntensity === 'heavy'
                                ? '#e11d48'
                                : ev.flowIntensity === 'light'
                                  ? '#fda4af'
                                  : '#f43f5e';
                          urgencyLabel = ev.flowIntensity
                            ? `${ev.flowIntensity.replace('_', ' ')}`
                            : 'Cycle Log';
                          cardBorder = 'border-rose-500/60';
                          cardBackground =
                            'radial-gradient(circle at 12% 20%, rgba(244,63,94,0.45) 0%, transparent 60%), radial-gradient(circle at 88% 80%, rgba(225,29,72,0.3) 0%, transparent 60%), linear-gradient(135deg, rgba(38,14,24,0.94) 0%, rgba(20,8,14,0.98) 100%)';
                        } else if (isTask) {
                          categoryColor = '#f59e0b';
                          categoryLabel = 'Task';
                          if (ev.priority === 'urgent') {
                            urgencyColor = '#ef4444';
                            urgencyLabel = 'Urgent';
                            cardBorder = 'border-red-500/60';
                            cardBackground =
                              'radial-gradient(circle at 15% 25%, rgba(239,68,68,0.45) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(255, 140, 66,0.35) 0%, transparent 55%), linear-gradient(135deg, rgba(36,14,14,0.94) 0%, rgba(20,10,10,0.98) 100%)';
                          } else if (ev.priority === 'low') {
                            urgencyColor = '#10b981';
                            urgencyLabel = 'Low';
                            cardBorder = 'border-[#FF8C42]/40';
                            cardBackground =
                              'radial-gradient(circle at 15% 25%, rgba(245,158,11,0.35) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(16,185,129,0.25) 0%, transparent 55%), linear-gradient(135deg, rgba(28,22,14,0.94) 0%, rgba(16,12,10,0.98) 100%)';
                          } else {
                            urgencyColor = '#fbbf24';
                            urgencyLabel = 'Medium';
                            cardBorder = 'border-[#FF8C42]/50';
                            cardBackground =
                              'radial-gradient(circle at 15% 25%, rgba(245,158,11,0.4) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(251,191,36,0.25) 0%, transparent 55%), linear-gradient(135deg, rgba(32,22,12,0.94) 0%, rgba(18,12,8,0.98) 100%)';
                          }
                        } else if (isBirthday) {
                          categoryColor = '#10b981';
                          categoryLabel = 'Birthday';
                          urgencyColor = '#84cc16';
                          urgencyLabel = 'Annual';
                          cardBorder = 'border-emerald-500/50';
                          cardBackground =
                            'radial-gradient(circle at 15% 25%, rgba(16,185,129,0.4) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(132,204,22,0.25) 0%, transparent 55%), linear-gradient(135deg, rgba(14,30,20,0.94) 0%, rgba(10,18,14,0.98) 100%)';
                        } else {
                          categoryColor = '#FF8C42';
                          categoryLabel = 'Event';
                          if (ev.location?.includes('meet')) {
                            urgencyColor = '#a855f7';
                            urgencyLabel = 'Video Meet';
                            cardBorder = 'border-purple-500/50';
                            cardBackground =
                              'radial-gradient(circle at 15% 25%, rgba(255, 140, 66,0.35) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(168,85,247,0.3) 0%, transparent 55%), linear-gradient(135deg, rgba(28,18,28,0.94) 0%, rgba(16,10,18,0.98) 100%)';
                          } else {
                            urgencyColor = '#fbbf24';
                            urgencyLabel = 'Standard';
                            cardBorder = 'border-[#FF8C42]/50';
                            cardBackground =
                              'radial-gradient(circle at 15% 25%, rgba(255, 140, 66,0.35) 0%, transparent 55%), radial-gradient(circle at 85% 75%, rgba(251,191,36,0.25) 0%, transparent 55%), linear-gradient(135deg, rgba(30,20,12,0.94) 0%, rgba(16,10,8,0.98) 100%)';
                          }
                        }

                        return (
                          <div
                            key={ev.id}
                            onClick={() => setSelectedEvent(ev)}
                            style={{
                              background: cardBackground,
                              boxShadow:
                                '0 12px 32px 0 rgba(0,0,0,0.6), inset 0 1px 0 0 rgba(255,255,255,0.08)',
                            }}
                            className={`relative flex items-center justify-between p-3.5 rounded-3xl border ${cardBorder} backdrop-blur-2xl transition-all cursor-pointer overflow-hidden group hover:scale-[1.01] hover:brightness-105 active:scale-[0.99]`}
                          >
                            <div className="absolute left-0 top-0 bottom-0 w-2 flex flex-col">
                              <div className="flex-1" style={{ backgroundColor: categoryColor }} />
                              <div className="flex-1" style={{ backgroundColor: urgencyColor }} />
                            </div>

                            <div className="flex items-start gap-3 pl-2.5 flex-1 min-w-0 pr-2">
                              <div
                                style={{
                                  background: `radial-gradient(circle at 30% 30%, ${categoryColor}66 0%, ${urgencyColor}44 100%)`,
                                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14)',
                                }}
                                className="size-9 rounded-2xl border border-white/25 flex items-center justify-center shrink-0 mt-0.5"
                              >
                                {isTask ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      showToast({
                                        text: `Task "${ev.title}" completed`,
                                        type: 'success',
                                      });
                                    }}
                                    className="text-xs font-black text-[#FFB875] hover:text-white flex items-center justify-center"
                                  >
                                    <svg
                                      className="size-3.5"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="3"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </button>
                                ) : isBirthday ? (
                                  <IconCake className="size-4 text-emerald-300" />
                                ) : isPeriod ? (
                                  <IconFlower className="size-4 text-rose-300" />
                                ) : (
                                  <IconCalendar className="size-4 text-[#FF8C42]" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h5 className="text-sm font-black text-white tracking-wide truncate">
                                    {ev.title}
                                  </h5>

                                  <div
                                    style={{
                                      boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
                                    }}
                                    className="inline-flex items-center rounded-full overflow-hidden text-[10px] font-black border border-white/20 bg-black/50 backdrop-blur-md shrink-0"
                                  >
                                    <span
                                      className="px-2 py-0.5 uppercase tracking-wider"
                                      style={{
                                        backgroundColor: `${categoryColor}44`,
                                        color: categoryColor,
                                      }}
                                    >
                                      {categoryLabel}
                                    </span>
                                    <span
                                      className="px-2 py-0.5 uppercase tracking-wider border-l border-white/15"
                                      style={{
                                        backgroundColor: `${urgencyColor}55`,
                                        color: urgencyColor,
                                      }}
                                    >
                                      {urgencyLabel}
                                    </span>
                                  </div>
                                </div>

                                <p className="text-[11px] text-[#A1A4AC]/90 mt-1 flex items-center gap-1.5 flex-wrap">
                                  <span className="font-semibold text-white">
                                    {ev.allDay
                                      ? 'All Day'
                                      : `${hhmm(startOf(ev))} – ${hhmm(endOf(ev))}`}
                                  </span>
                                  {ev.location && (
                                    <span className="text-[#A1A4AC] flex items-center gap-1">
                                      · <IconMapPin className="size-3 text-[#A1A4AC] inline" />{' '}
                                      {ev.location}
                                    </span>
                                  )}
                                  {ev.description && (
                                    <span className="text-[#A1A4AC]">· {ev.description}</span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {ev.location?.includes('meet.quantrinity.in') && (
                                <a
                                  href={ev.location}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="px-2.5 py-1 rounded-lg bg-[#FF8C42]/12 text-[#FF8C42] border border-[#FF8C42]/35 shadow-[0_0_10px_rgba(255,140,66,0.1)] text-[11px] font-semibold flex items-center gap-1.5 hover:bg-[#FF8C42]/20 transition-all"
                                >
                                  <svg
                                    className="w-3 h-3"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <span>Join Video</span>
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={(e) => handleDeleteEvent(ev.id, e)}
                                className="p-1.5 rounded-lg text-[#6B6E76] hover:text-[#F87171] hover:bg-[#2A1215] text-xs transition-colors"
                                title="Delete"
                              >
                                <svg
                                  className="w-3.5 h-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.8}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {isLoadingFuture && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs font-bold text-[#FF8C42] animate-pulse">
            <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span>Loading upcoming dates…</span>
          </div>
        )}
      </div>
    </>
  );
}
