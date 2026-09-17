'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  IconActivity,
  IconBan,
  IconBell,
  IconBrain,
  IconCake,
  IconCalendar,
  IconCircle,
  IconClock,
  IconDot,
  IconDroplet,
  IconFlame,
  IconFlower,
  IconGlobe,
  IconMapPin,
  IconPaperclip,
  IconRefresh,
  IconScale,
  IconSettings,
  IconShield,
  IconTarget,
  IconThermometer,
  IconUsers,
  IconX,
} from '../../../components/icons';
import type { EntryType, FormState } from '../types';
import {
  TIMEZONES,
  CLUE_COLLECTION_METHODS,
  CLUE_FEELINGS,
  CLUE_PAIN,
  CLUE_INTIMATE,
  CLUE_HOT_FLASHES,
  CLUE_SLEEP,
  CLUE_SEX_LIFE,
  CLUE_ENERGY,
} from '../types';
import { toDateInput } from '../lib/calendar-geometry';

export interface CalendarEventFormProps {
  activeSheetType: EntryType | null;
  closeSheet: () => void;
  sheetRef: React.RefObject<HTMLDivElement | null>;
  editingEventId: string | null;
  isSheetDragging: boolean;
  sheetDragY: number;
  handleSheetPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleSheetPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  handleSheetPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  isSaving: boolean;
  handleSaveEntry: () => Promise<void> | void;
  periodSubTab: 'track' | 'cycle' | 'insights';
  setPeriodSubTab: (tab: 'track' | 'cycle' | 'insights') => void;
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  currentUserEmail?: string;
  setIsTimezoneModalOpen: (open: boolean) => void;
  setIsRecurrenceModalOpen: (open: boolean) => void;
  setIsNotificationSliderOpen: (open: boolean) => void;
  setIsPeriodCustomizeOpen: (open: boolean) => void;
  currentWeekDays: Array<{
    key: string;
    date: Date;
    dayLetter: string;
    dayNum: number;
    hasHoliday: boolean;
  }>;
}

export function CalendarEventForm({
  activeSheetType,
  closeSheet,
  sheetRef,
  editingEventId,
  isSheetDragging,
  sheetDragY,
  handleSheetPointerDown,
  handleSheetPointerMove,
  handleSheetPointerUp,
  isSaving,
  handleSaveEntry,
  periodSubTab,
  setPeriodSubTab,
  formState,
  setFormState,
  currentUserEmail = '',
  setIsTimezoneModalOpen,
  setIsRecurrenceModalOpen,
  setIsNotificationSliderOpen,
  setIsPeriodCustomizeOpen,
  currentWeekDays,
}: CalendarEventFormProps) {
  const handleAddAttendee = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = formState.attendeeInput.trim().replace(',', '');
      if (val && !formState.attendees.includes(val)) {
        setFormState((prev) => ({
          ...prev,
          attendees: [...prev.attendees, val],
          attendeeInput: '',
        }));
      }
    }
  };

  const removeAttendee = (email: string) => {
    setFormState((prev) => ({
      ...prev,
      attendees: prev.attendees.filter((a) => a !== email),
    }));
  };

  const removeNotificationReminder = (index: number) => {
    setFormState((prev) => ({
      ...prev,
      notifications: prev.notifications.filter((_, i) => i !== index),
    }));
  };

  const toggleFeeling = (feelingLabel: string) => {
    setFormState((prev) => ({
      ...prev,
      feelings: prev.feelings.includes(feelingLabel)
        ? prev.feelings.filter((f) => f !== feelingLabel)
        : [...prev.feelings, feelingLabel],
    }));
  };

  const togglePain = (painLabel: string) => {
    setFormState((prev) => ({
      ...prev,
      pain: prev.pain.includes(painLabel)
        ? prev.pain.filter((p) => p !== painLabel)
        : [...prev.pain, painLabel],
    }));
  };

  const handleAddCustomTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && formState.customTagInput.trim()) {
      e.preventDefault();
      const tag = formState.customTagInput.trim().startsWith('#')
        ? formState.customTagInput.trim()
        : `#${formState.customTagInput.trim()}`;
      if (!formState.customTags.includes(tag)) {
        setFormState((prev) => ({
          ...prev,
          customTags: [...prev.customTags, tag],
          customTagInput: '',
        }));
      }
    }
  };

  const removeCustomTag = (tag: string) => {
    setFormState((prev) => ({
      ...prev,
      customTags: prev.customTags.filter((t) => t !== tag),
    }));
  };

  const handleAddSubtask = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && formState.subtaskInput.trim()) {
      e.preventDefault();
      setFormState((prev) => ({
        ...prev,
        subtasks: [...prev.subtasks, { text: prev.subtaskInput.trim(), done: false }],
        subtaskInput: '',
      }));
    }
  };

  const toggleSubtask = (idx: number) => {
    setFormState((prev) => ({
      ...prev,
      subtasks: prev.subtasks.map((st, i) => (i === idx ? { ...st, done: !st.done } : st)),
    }));
  };

  return (
    <AnimatePresence>
      {activeSheetType && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeSheet}
            className="absolute inset-0 bg-black/75 backdrop-blur-md"
          />

          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={
              activeSheetType === 'period'
                ? 'Cycle tracker'
                : `${editingEventId ? 'Edit' : 'New'} ${activeSheetType}`
            }
            initial={{ y: '100%' }}
            animate={{ y: isSheetDragging ? Math.max(0, sheetDragY) : 0 }}
            exit={{ y: '100%' }}
            transition={
              isSheetDragging ? { duration: 0 } : { type: 'spring', damping: 28, stiffness: 300 }
            }
            className="relative w-full max-w-lg bg-[#121216] border-t md:border border-[#3A404D]/60 rounded-t-3xl md:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-10 flex flex-col transition-all overflow-hidden h-[86vh] max-h-[86vh] mt-12 md:mt-0"
          >
            {/* Drag Handle & Sticky Top Header */}
            <div
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              onPointerCancel={handleSheetPointerUp}
              className="pt-3 pb-1 px-4 flex flex-col cursor-grab active:cursor-grabbing select-none touch-none bg-[#121216] border-b border-[#282C35]/80 shrink-0"
              style={{ touchAction: 'none' }}
            >
              <div
                className={`w-14 h-1.5 rounded-full mx-auto mb-2 transition-all ${
                  isSheetDragging
                    ? 'bg-[#FF8C42] scale-110 shadow-[0_0_0_3px_rgba(255,140,66,0.22)]'
                    : 'bg-[#6B6E76] hover:bg-[#A1A4AC]'
                }`}
              />

              {/* Header Bar: close on the left, title centred, save on the right */}
              <div className="flex items-center justify-between pb-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeSheet}
                    className="size-9 min-h-[44px] min-w-[44px] rounded-full hover:bg-[#282C35] text-[#A1A4AC] hover:text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    aria-label="Close"
                  >
                    <IconX className="size-4" />
                  </button>
                  <span className="text-sm font-black text-white flex items-center gap-1.5">
                    {activeSheetType === 'event' && (
                      <span className="flex items-center gap-1.5 text-[#FF8C42]">
                        <IconCalendar className="size-4 text-[#FF8C42]" />{' '}
                        {editingEventId ? 'Edit Event' : 'New Event'}
                      </span>
                    )}
                    {activeSheetType === 'task' && (
                      <span className="flex items-center gap-1.5 text-[#FF8C42]">
                        <IconTarget className="size-4 text-[#FF8C42]" />{' '}
                        {editingEventId ? 'Edit Task' : 'New Task'}
                      </span>
                    )}
                    {activeSheetType === 'birthday' && (
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <IconCake className="size-4 text-emerald-400" />{' '}
                        {editingEventId ? 'Edit Birthday' : 'New Birthday'}
                      </span>
                    )}
                    {activeSheetType === 'period' && (
                      <span className="flex items-center gap-1.5 text-rose-300">
                        <IconFlower className="size-4 text-rose-400" />
                        Today:{' '}
                        {new Date(formState.startDate).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveEntry()}
                  className="px-5 py-1.5 min-h-[44px] sm:min-h-0 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111] font-semibold text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  {isSaving ? (
                    <>
                      <svg className="animate-spin size-3.5" viewBox="0 0 24 24" fill="none">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v8H4z"
                        />
                      </svg>
                      <span>{editingEventId ? 'Updating…' : 'Saving…'}</span>
                    </>
                  ) : (
                    <span>{editingEventId ? 'Update' : 'Save'}</span>
                  )}
                </button>
              </div>

              {/* Period Tracker Sub-tabs */}
              {activeSheetType === 'period' && (
                <div className="flex items-center justify-around pt-1 pb-1 text-xs">
                  {(
                    [
                      { key: 'track', label: 'Track' },
                      { key: 'cycle', label: 'Cycle Dial' },
                      { key: 'insights', label: 'Insights' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setPeriodSubTab(tab.key)}
                      className={`flex min-h-11 items-center justify-center gap-1.5 border-b-2 px-3 pb-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                        periodSubTab === tab.key
                          ? 'border-rose-400 text-rose-300 font-bold'
                          : 'border-transparent text-[#A1A4AC] hover:text-[#F5F5F5]'
                      }`}
                    >
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Form Content Body */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-4 text-xs text-white pb-24">
              {/* Account Row */}
              <div className="flex items-center justify-between py-1 border-b border-[#282C35] text-[#A1A4AC]">
                <span className="text-xs text-[#A1A4AC]">Account</span>
                <span className="text-[11px] font-semibold text-[#FF8C42] bg-[#2B1A11] px-2.5 py-0.5 rounded-full border border-[#5C3016] flex items-center gap-1.5">
                  <svg
                    className="w-3 h-3 text-[#FF8C42]"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  <span>{formState.accountEmail || currentUserEmail}</span>
                </span>
              </div>

              {/* ----------------- 1. EVENT FORM ----------------- */}
              {activeSheetType === 'event' && (
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={formState.title}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      placeholder="Add event title"
                      className="w-full min-h-[44px] sm:min-h-0 bg-transparent text-xl font-bold text-white placeholder-[#A1A4AC] border-b border-[#3A404D]/80 pb-2 focus:outline-none focus:border-[#FF8C42]"
                      autoFocus
                      data-autofocus
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-[#282C35]/60">
                    <div className="flex items-center gap-2.5 text-[#A1A4AC]">
                      <IconClock className="size-4 text-[#FF8C42]" />
                      <span className="font-semibold">All-day</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formState.allDay}
                      aria-label="All-day"
                      onClick={() => setFormState({ ...formState, allDay: !formState.allDay })}
                      className={`relative w-11 h-6 flex items-center rounded-full p-1 transition-colors after:absolute after:inset-x-0 after:-inset-y-[10px] after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                        formState.allDay ? 'bg-[#FF8C42]' : 'bg-[#3A404D]'
                      }`}
                    >
                      <div
                        className={`bg-white size-4 rounded-full shadow-md transform transition-transform ${
                          formState.allDay ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="space-y-2 py-1">
                    <div className="flex items-center justify-between">
                      <input
                        type="date"
                        aria-label="Start date"
                        value={formState.startDate}
                        onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                        className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      {!formState.allDay && (
                        <input
                          type="time"
                          aria-label="Start time"
                          value={formState.startTime}
                          onChange={(e) =>
                            setFormState({ ...formState, startTime: e.target.value })
                          }
                          className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <input
                        type="date"
                        aria-label="End date"
                        value={formState.endDate}
                        onChange={(e) => setFormState({ ...formState, endDate: e.target.value })}
                        className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                      />
                      {!formState.allDay && (
                        <input
                          type="time"
                          aria-label="End time"
                          value={formState.endTime}
                          onChange={(e) => setFormState({ ...formState, endTime: e.target.value })}
                          className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                        />
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsTimezoneModalOpen(true)}
                    className="w-full min-h-[44px] sm:min-h-0 flex items-center justify-between text-left text-[#A1A4AC] hover:text-white py-2 border-b border-[#282C35]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    <div className="flex items-center gap-2.5">
                      <IconGlobe className="size-4 text-cyan-400" />
                      <span>
                        {TIMEZONES.find((tz) => tz.value === formState.timezone)?.label ||
                          'India Standard Time (IST)'}
                      </span>
                    </div>
                    <span className="text-[#6B6E76] text-xs">›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsRecurrenceModalOpen(true)}
                    className="w-full min-h-[44px] sm:min-h-0 flex items-center justify-between text-left text-[#A1A4AC] hover:text-white py-2 border-b border-[#282C35]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                  >
                    <div className="flex items-center gap-2.5">
                      <IconRefresh className="size-4 text-[#FF8C42]" />
                      <span>{formState.recurrence}</span>
                    </div>
                    <span className="text-[#6B6E76] text-xs">›</span>
                  </button>

                  <div className="py-2 border-b border-[#282C35]/60 space-y-2">
                    <div className="flex items-center gap-2.5 text-[#A1A4AC]">
                      <IconUsers className="size-4 text-indigo-400" />
                      <input
                        type="email"
                        placeholder="Add guests (type email & enter)"
                        value={formState.attendeeInput}
                        onChange={(e) =>
                          setFormState({ ...formState, attendeeInput: e.target.value })
                        }
                        onKeyDown={handleAddAttendee}
                        className="min-h-[44px] flex-1 bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                      />
                    </div>
                    {formState.attendees.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-7">
                        {formState.attendees.map((email) => (
                          <span
                            key={email}
                            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#282C35] text-[#F5F5F5] text-[11px]"
                          >
                            <span>{email}</span>
                            <button
                              type="button"
                              onClick={() => removeAttendee(email)}
                              className="relative inline-flex items-center justify-center size-4 rounded text-[#A1A4AC] hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] after:absolute after:-inset-y-[14px] after:-inset-x-[10px] after:content-['']"
                              aria-label={`Remove attendee ${email}`}
                            >
                              <IconX size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="py-2 border-b border-[#282C35]/60 space-y-1.5">
                    <div className="flex items-center gap-2.5 text-[#A1A4AC]">
                      <IconMapPin className="size-4 text-rose-400" />
                      <input
                        type="text"
                        placeholder="Add location or QuantChat room"
                        value={formState.location}
                        onChange={(e) => setFormState({ ...formState, location: e.target.value })}
                        className="min-h-[44px] flex-1 bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 pl-7">
                      {['QuantHQ Main', 'QuantChat Room', 'Remote / WFH'].map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setFormState({ ...formState, location: loc })}
                          className="inline-flex min-h-11 items-center rounded-md bg-[#282C35] px-2 py-0.5 text-[10px] text-[#A1A4AC] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0"
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="py-2 border-b border-[#282C35]/60 space-y-2">
                    <div className="flex items-center justify-between text-[#A1A4AC]">
                      <div className="flex items-center gap-2.5">
                        <IconBell className="size-4 text-[#FF8C42]" />
                        <span className="font-semibold">Notifications</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsNotificationSliderOpen(true)}
                        className="inline-flex min-h-[44px] items-center rounded-xl border border-[#FF8C42]/30 bg-[#FF8C42]/20 px-2.5 py-1 text-[11px] font-bold text-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0"
                      >
                        + Custom Time Slider
                      </button>
                    </div>
                    <div className="space-y-1.5 pl-7">
                      {formState.notifications.map((notif, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-[11px] text-[#A1A4AC]"
                        >
                          <span>{notif}</span>
                          <button
                            type="button"
                            onClick={() => removeNotificationReminder(idx)}
                            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] -my-3 rounded text-[#6B6E76] hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                            aria-label={`Remove reminder ${notif}`}
                          >
                            <IconX size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 py-2 border-b border-[#282C35]/60 text-[#A1A4AC]">
                    <span className="text-base mt-1">≡</span>
                    <textarea
                      rows={2}
                      placeholder="Add description, meeting agenda…"
                      value={formState.description}
                      onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                      className="min-h-[44px] flex-1 resize-none bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                    />
                  </div>

                  <div className="py-2 space-y-1.5 text-[#A1A4AC]">
                    <div className="flex items-center gap-2.5">
                      <IconPaperclip className="size-4 text-[#A1A4AC]" />
                      <input
                        type="text"
                        placeholder="Attach QuantDrive file URL or link"
                        value={formState.driveLink}
                        onChange={(e) => setFormState({ ...formState, driveLink: e.target.value })}
                        className="min-h-[44px] flex-1 bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------- 2. TASK FORM ----------------- */}
              {activeSheetType === 'task' && (
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={formState.title}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      placeholder="Add task title"
                      className="w-full min-h-[44px] sm:min-h-0 bg-transparent text-xl font-bold text-white placeholder-[#A1A4AC] border-b border-[#3A404D]/80 pb-2 focus:outline-none focus:border-[#FF8C42]"
                      autoFocus
                      data-autofocus
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-[#282C35]/60">
                    <span className="text-[#A1A4AC] font-semibold">Priority</span>
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          {
                            key: 'low',
                            label: 'Low',
                            color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40',
                          },
                          {
                            key: 'medium',
                            label: 'Medium',
                            color: 'text-[#FF8C42] border-[#FF8C42]/40 bg-[#2B1A11]/40',
                          },
                          {
                            key: 'urgent',
                            label: 'Urgent',
                            color: 'text-rose-400 border-rose-500/50 bg-rose-950/50',
                          },
                        ] as const
                      ).map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setFormState({ ...formState, priority: p.key })}
                          className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 py-1 text-[11px] font-black transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                            formState.priority === p.key
                              ? `${p.color} ring-1 ring-white/20 scale-105 shadow-md`
                              : 'bg-[#111318] border-[#282C35] text-[#A1A4AC]'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-[#282C35]/60">
                    <div className="flex items-center gap-2 text-[#A1A4AC]">
                      <IconCalendar className="size-4 text-[#FF8C42]" />
                      <span className="font-semibold">Due Date</span>
                    </div>
                    <input
                      type="date"
                      aria-label="Due date"
                      value={formState.startDate}
                      onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                      className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-2 p-3 rounded-2xl bg-[#111318]/60 border border-[#282C35]">
                    <span className="font-bold text-[#A1A4AC]">Checklist & Subtasks</span>
                    <input
                      type="text"
                      placeholder="+ Add subtask (press Enter)"
                      value={formState.subtaskInput}
                      onChange={(e) => setFormState({ ...formState, subtaskInput: e.target.value })}
                      onKeyDown={handleAddSubtask}
                      className="w-full min-h-[44px] sm:min-h-0 bg-[#090A0C] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white placeholder-[#A1A4AC]"
                    />
                    {formState.subtasks.map((st, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleSubtask(idx)}
                        className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#090A0C] text-xs cursor-pointer hover:bg-[#282C35]"
                      >
                        <span className="flex items-center justify-center shrink-0">
                          {st.done ? (
                            <svg
                              className="size-3.5 text-emerald-400"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <span className="size-3 rounded border border-[#6B6E76] inline-block" />
                          )}
                        </span>
                        <span
                          className={st.done ? 'line-through text-[#A1A4AC]' : 'text-[#F5F5F5]'}
                        >
                          {st.text}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2.5 py-2 border-b border-[#282C35]/60 text-[#A1A4AC]">
                    <span className="text-base mt-1">≡</span>
                    <textarea
                      rows={2}
                      placeholder="Add task notes or instructions…"
                      value={formState.description}
                      onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                      className="min-h-[44px] flex-1 resize-none bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                    />
                  </div>
                </div>
              )}

              {/* ----------------- 3. BIRTHDAY FORM ----------------- */}
              {activeSheetType === 'birthday' && (
                <div className="space-y-4">
                  <div>
                    <input
                      type="text"
                      value={formState.title}
                      onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                      placeholder="Add person's name (e.g. Rahul's Birthday)"
                      className="w-full min-h-[44px] sm:min-h-0 bg-transparent text-xl font-bold text-white placeholder-[#A1A4AC] border-b border-[#3A404D]/80 pb-2 focus:outline-none focus:border-emerald-500"
                      autoFocus
                      data-autofocus
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-[#282C35]/60">
                    <div className="flex items-center gap-2 text-[#A1A4AC]">
                      <IconCake className="size-4 text-emerald-400" />
                      <span className="font-semibold">Birthday Date</span>
                    </div>
                    <input
                      type="date"
                      aria-label="Birthday date"
                      value={formState.startDate}
                      onChange={(e) => setFormState({ ...formState, startDate: e.target.value })}
                      className="min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-[#282C35]/60">
                    <div className="flex items-center gap-2 text-[#A1A4AC]">
                      <IconCalendar className="size-4 text-emerald-400" />
                      <span className="font-semibold">Birth Year (Optional)</span>
                    </div>
                    <input
                      type="number"
                      aria-label="Birth year"
                      placeholder="e.g. 1998"
                      value={formState.birthYear}
                      onChange={(e) => setFormState({ ...formState, birthYear: e.target.value })}
                      className="w-24 min-h-[44px] sm:min-h-0 bg-[#111318] border border-[#3A404D]/80 rounded-xl px-3 py-1.5 text-xs text-white text-center"
                    />
                  </div>

                  <div className="flex items-start gap-2.5 py-2 border-b border-[#282C35]/60 text-[#A1A4AC]">
                    <svg
                      className="size-4 text-emerald-400 mt-1 shrink-0"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 12 20 22 4 22 4 12" />
                      <rect width="20" height="5" x="2" y="7" />
                      <line x1="12" y1="22" x2="12" y2="7" />
                      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                    </svg>
                    <textarea
                      rows={2}
                      placeholder="Gift ideas, party venue, wishlist notes…"
                      value={formState.description}
                      onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                      className="min-h-[44px] flex-1 resize-none bg-transparent text-xs text-white placeholder-[#A1A4AC] focus:outline-none sm:min-h-0"
                    />
                  </div>
                </div>
              )}

              {/* ----------------- 4. COMPREHENSIVE CLUE / FLO PERIOD TRACKER ----------------- */}
              {activeSheetType === 'period' && (
                <div className="space-y-6">
                  {/* Sub-tab 1: DAILY TRACKING */}
                  {periodSubTab === 'track' && (
                    <div className="space-y-6">
                      {/* Mini Week Bar with Highlighted Period */}
                      <div className="p-3 rounded-2xl bg-[#111318]/80 border border-[#282C35] space-y-2">
                        <div className="flex items-center justify-between text-xs text-[#A1A4AC]">
                          <span className="font-semibold">Cycle Dates</span>
                          <button
                            type="button"
                            onClick={() => setIsPeriodCustomizeOpen(true)}
                            className="inline-flex items-center gap-1 px-3 py-1 min-h-[44px] sm:min-h-0 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black border border-rose-500/30 hover:bg-rose-500/30 transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                          >
                            <IconSettings size={11} />
                            Customize
                          </button>
                        </div>
                        <div className="grid grid-cols-7 text-center gap-1">
                          {currentWeekDays.map((d) => (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => {
                                setFormState((prev) => ({
                                  ...prev,
                                  startDate: toDateInput(d.date),
                                  endDate: toDateInput(d.date),
                                }));
                              }}
                              className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition-all relative before:absolute before:inset-y-0 before:-inset-x-[2px] before:content-[''] ${
                                formState.startDate === d.key
                                  ? 'border-2 border-rose-400 bg-rose-950/80 text-white font-black scale-105 shadow-[0_4px_16px_rgba(0,0,0,0.6)]'
                                  : 'bg-[#090A0C] text-[#A1A4AC] hover:bg-[#282C35]'
                              }`}
                            >
                              <span className="text-[10px]">{d.dayLetter}</span>
                              <span className="text-xs">{d.dayNum}</span>
                              {d.hasHoliday && (
                                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[#FF8C42] animate-pulse" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 1. PERIOD FLOW */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconDroplet className="size-3.5 text-rose-500" /> Period Flow
                        </span>
                        <div className="grid grid-cols-4 gap-2">
                          {(
                            [
                              { key: 'light', label: 'Light', drops: 1 },
                              { key: 'medium', label: 'Medium', drops: 2 },
                              { key: 'heavy', label: 'Heavy', drops: 3 },
                              { key: 'super_heavy', label: 'Super', drops: 4 },
                            ] as const
                          ).map((flow) => (
                            <button
                              key={flow.key}
                              type="button"
                              onClick={() =>
                                setFormState({ ...formState, flowIntensity: flow.key })
                              }
                              aria-pressed={formState.flowIntensity === flow.key}
                              className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.flowIntensity === flow.key
                                  ? 'bg-rose-600 border-rose-400 text-white font-black'
                                  : 'bg-[#1e1e24] border-rose-500/20 text-rose-300 hover:bg-[#25252e]'
                              }`}
                            >
                              <span className="flex items-center gap-px" aria-hidden="true">
                                {Array.from({ length: flow.drops }).map((_, i) => (
                                  <IconDroplet key={i} size={12} />
                                ))}
                              </span>
                              <span className="text-[11px] mt-1 font-bold">{flow.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 2. COLLECTION METHOD */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconShield className="size-3.5 text-rose-400" /> Collection Method
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_COLLECTION_METHODS.map((cm) => (
                            <button
                              key={cm.id}
                              type="button"
                              onClick={() =>
                                setFormState({ ...formState, collectionMethod: cm.label })
                              }
                              aria-pressed={formState.collectionMethod === cm.label}
                              className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.collectionMethod === cm.label
                                  ? 'bg-rose-600/40 border-rose-400 text-white font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:text-[#F5F5F5]'
                              }`}
                            >
                              <cm.Icon className="size-4" />
                              <span className="text-[10px] mt-0.5 font-semibold text-center leading-tight">
                                {cm.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 3. SPOTTING */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconFlower className="size-3.5 text-rose-400" /> Spotting
                        </span>
                        <div className="grid grid-cols-2 gap-2.5">
                          {(
                            [
                              { key: 'red', label: 'Red Spotting', tone: '#ef4444' },
                              { key: 'brown', label: 'Brown Spotting', tone: '#92400e' },
                            ] as const
                          ).map((sp) => (
                            <button
                              key={sp.key}
                              type="button"
                              onClick={() => setFormState({ ...formState, spottingColor: sp.key })}
                              aria-pressed={formState.spottingColor === sp.key}
                              className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.spottingColor === sp.key
                                  ? 'bg-rose-600/30 border-rose-500 text-white font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:text-[#F5F5F5]'
                              }`}
                            >
                              <IconDot size={11} tone={sp.tone} />
                              <span className="text-[11px] font-bold">{sp.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 4. FEELINGS / MOOD */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconBrain className="size-3.5 text-[#FF8C42]" /> Feelings &amp; Mood
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {CLUE_FEELINGS.map((f) => {
                            const isSelected = formState.feelings.includes(f.label);
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() => toggleFeeling(f.label)}
                                aria-pressed={isSelected}
                                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                  isSelected
                                    ? 'bg-[#E8752F]/30 border-[#FF8C42] text-[#FFD1A3] font-black shadow'
                                    : 'bg-[#1e1e24] border-[#FF8C42]/20 text-[#FFB875] hover:bg-[#25252e]'
                                }`}
                              >
                                <f.Icon className="size-[18px]" />
                                <span className="text-[10px] mt-1 text-center font-semibold leading-tight">
                                  {f.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 5. PAIN & SYMPTOMS */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconActivity className="size-3.5 text-blue-400" /> Pain &amp; Physical
                          Symptoms
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          {CLUE_PAIN.map((p) => {
                            const isSelected = formState.pain.includes(p.label);
                            return (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => togglePain(p.label)}
                                aria-pressed={isSelected}
                                className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                  isSelected
                                    ? 'bg-blue-600/30 border-blue-400 text-blue-200 font-black shadow'
                                    : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:bg-[#25252e]'
                                }`}
                              >
                                <p.Icon className="size-[18px]" />
                                <span className="text-[10px] mt-1 text-center font-semibold leading-tight">
                                  {p.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 6. INTIMATE HEALTH */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconShield className="size-3.5 text-pink-400" /> Intimate Health
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_INTIMATE.map((intm) => (
                            <button
                              key={intm.id}
                              type="button"
                              onClick={() =>
                                setFormState({ ...formState, intimateHealth: intm.label })
                              }
                              aria-pressed={formState.intimateHealth === intm.label}
                              className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.intimateHealth === intm.label
                                  ? 'bg-pink-600/30 border-pink-400 text-pink-200 font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:bg-[#25252e]'
                              }`}
                            >
                              <intm.Icon className="size-4" />
                              <span className="text-[10px] mt-0.5 text-center font-semibold leading-tight">
                                {intm.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 7. HOT FLASHES & CHILLS */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconActivity className="size-3.5 text-amber-500" /> Hot Flashes &amp;
                          Chills
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_HOT_FLASHES.map((hf) => (
                            <button
                              key={hf.id}
                              type="button"
                              onClick={() => setFormState({ ...formState, hotFlashes: hf.label })}
                              aria-pressed={formState.hotFlashes === hf.label}
                              className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.hotFlashes === hf.label
                                  ? 'bg-amber-600/30 border-amber-400 text-amber-200 font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:bg-[#25252e]'
                              }`}
                            >
                              <span className="flex items-center gap-px h-4" aria-hidden="true">
                                {hf.flames === 0 ? (
                                  <IconBan size={14} />
                                ) : (
                                  Array.from({ length: hf.flames }).map((_, i) => (
                                    <IconFlame key={i} size={13} />
                                  ))
                                )}
                              </span>
                              <span className="text-[10px] mt-0.5 text-center font-semibold leading-tight">
                                {hf.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 8. SLEEP */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconActivity className="size-3.5 text-indigo-400" /> Sleep
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_SLEEP.map((sl) => (
                            <button
                              key={sl.id}
                              type="button"
                              onClick={() => setFormState({ ...formState, sleep: sl.label })}
                              aria-pressed={formState.sleep === sl.label}
                              className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.sleep === sl.label
                                  ? 'bg-indigo-600/30 border-indigo-400 text-indigo-200 font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:bg-[#25252e]'
                              }`}
                            >
                              <sl.Icon className="size-4" />
                              <span className="text-[10px] mt-0.5 text-center font-semibold leading-tight">
                                {sl.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 9. SEX LIFE */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconActivity className="size-3.5 text-rose-400" /> Sex Life
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_SEX_LIFE.map((sx) => (
                            <button
                              key={sx.id}
                              type="button"
                              onClick={() => setFormState({ ...formState, sexLife: sx.label })}
                              aria-pressed={formState.sexLife === sx.label}
                              className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.sexLife === sx.label
                                  ? 'bg-rose-600/30 border-rose-400 text-rose-200 font-black shadow'
                                  : 'bg-[#1e1e24] border-[#282C35] text-[#A1A4AC] hover:bg-[#25252e]'
                              }`}
                            >
                              <sx.Icon className="size-4" />
                              <span className="text-[10px] mt-0.5 text-center font-semibold leading-tight">
                                {sx.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 10. ENERGY */}
                      <div className="space-y-2">
                        <span className="text-xs font-black text-white flex items-center gap-1.5">
                          <IconActivity className="size-3.5 text-[#FF8C42]" /> Energy
                        </span>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CLUE_ENERGY.map((en) => (
                            <button
                              key={en.id}
                              type="button"
                              onClick={() => setFormState({ ...formState, energy: en.label })}
                              aria-pressed={formState.energy === en.label}
                              className={`flex flex-col items-center justify-center p-2 rounded-2xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                                formState.energy === en.label
                                  ? 'bg-[#E8752F]/30 border-[#FF8C42] text-[#FFB875] font-black shadow'
                                  : 'bg-[#1e1e24] border-[#FF8C42]/20 text-[#FFB875] hover:bg-[#25252e]'
                              }`}
                            >
                              <en.Icon className="size-4" />
                              <span className="text-[10px] mt-0.5 font-semibold text-center">
                                {en.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* 11. BODY METRICS */}
                      <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-[#1e1e24] border border-[#282C35]">
                        <div>
                          <span className="flex items-center gap-1 text-[10px] text-[#A1A4AC] mb-1">
                            <IconThermometer size={11} /> Basal Body Temp
                          </span>
                          <input
                            type="text"
                            aria-label="Basal body temperature"
                            placeholder="98.4 °F"
                            value={formState.bbt}
                            onChange={(e) => setFormState({ ...formState, bbt: e.target.value })}
                            className="w-full min-h-[44px] sm:min-h-0 bg-[#090A0C] border border-[#282C35] rounded-xl px-2.5 py-1 text-xs text-white"
                          />
                        </div>
                        <div>
                          <span className="flex items-center gap-1 text-[10px] text-[#A1A4AC] mb-1">
                            <IconScale size={11} /> Weight
                          </span>
                          <input
                            type="text"
                            aria-label="Weight"
                            placeholder="58.5 kg"
                            value={formState.weight}
                            onChange={(e) => setFormState({ ...formState, weight: e.target.value })}
                            className="w-full min-h-[44px] sm:min-h-0 bg-[#090A0C] border border-[#282C35] rounded-xl px-2.5 py-1 text-xs text-white"
                          />
                        </div>
                      </div>

                      {/* 12. MY CUSTOM TAGS */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-[#A1A4AC]">My tags</span>
                        <input
                          type="text"
                          placeholder="+ Create new tag (press Enter)"
                          value={formState.customTagInput}
                          onChange={(e) =>
                            setFormState({ ...formState, customTagInput: e.target.value })
                          }
                          onKeyDown={handleAddCustomTag}
                          className="w-full min-h-[44px] sm:min-h-0 bg-[#1e1e24] border border-[#282C35] rounded-2xl p-2.5 text-xs text-white placeholder-[#A1A4AC] focus:outline-none"
                        />
                        {formState.customTags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {formState.customTags.map((tag) => (
                              <span
                                key={tag}
                                className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[#282C35] text-cyan-300 text-[10px] font-semibold border border-cyan-500/20"
                              >
                                <span>{tag}</span>
                                <button
                                  type="button"
                                  onClick={() => removeCustomTag(tag)}
                                  className="relative inline-flex items-center justify-center size-4 rounded text-[#A1A4AC] hover:text-rose-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] after:absolute after:-inset-y-[14px] after:-inset-x-[10px] after:content-['']"
                                  aria-label={`Remove tag ${tag}`}
                                >
                                  <IconX size={11} />
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* 13. DAILY NOTE */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-[#A1A4AC]">Daily Note</span>
                        <textarea
                          rows={2}
                          placeholder="Any extra details to add today?…"
                          value={formState.description}
                          onChange={(e) =>
                            setFormState({ ...formState, description: e.target.value })
                          }
                          className="w-full bg-[#1e1e24] border border-[#282C35] rounded-2xl p-3 text-xs text-white placeholder-[#A1A4AC] focus:outline-none focus:border-rose-500 resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 2: CYCLE DIAL */}
                  {periodSubTab === 'cycle' && (
                    <div className="space-y-6">
                      <div className="flex flex-col items-center justify-center p-6 rounded-3xl bg-gradient-to-b from-[#111318] via-rose-950/40 to-[#111318] border border-rose-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
                        <div className="relative size-48 rounded-full border-4 border-[#282C35] flex items-center justify-center shadow-inner">
                          <div className="absolute inset-0 rounded-full border-4 border-rose-500 border-t-transparent border-r-transparent rotate-45 animate-pulse" />

                          <div className="text-center space-y-1">
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-black">
                              Day {formState.currentCycleDay} of {formState.cycleLength}
                            </span>
                            <h3 className="text-xl font-black text-white">
                              {formState.periodDays - formState.currentCycleDay + 1 > 0
                                ? `${formState.periodDays - formState.currentCycleDay + 1} more days of period`
                                : 'Fertile Window Forecast'}
                            </h3>
                            <p className="text-[10px] text-[#A1A4AC]">
                              Next cycle in ~{formState.cycleLength - formState.currentCycleDay}{' '}
                              days
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 mt-4 text-[10px] text-[#A1A4AC]">
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-rose-500" /> Period
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-cyan-400" /> Fertile
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="size-2 rounded-full bg-[#FF8C42]" /> Ovulation
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 p-3 rounded-2xl bg-[#1e1e24] border border-[#282C35] text-[11px]">
                        <div>
                          <label className="block text-[#A1A4AC] mb-1">
                            Period Length ({formState.periodDays}d)
                          </label>
                          <input
                            type="range"
                            min="2"
                            max="8"
                            value={formState.periodDays}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                periodDays: Number(e.target.value) || 5,
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[#A1A4AC] mb-1">
                            Cycle Length ({formState.cycleLength}d)
                          </label>
                          <input
                            type="range"
                            min="21"
                            max="36"
                            value={formState.cycleLength}
                            onChange={(e) =>
                              setFormState({
                                ...formState,
                                cycleLength: Number(e.target.value) || 28,
                              })
                            }
                            className="w-full accent-rose-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 3: INSIGHTS & GRAPHS */}
                  {periodSubTab === 'insights' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-white">Cycle statistics</span>
                        <p className="text-[10px] text-[#A1A4AC]">
                          Averages are based on your cycle inputs.
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-3 rounded-2xl bg-[#1e1e24] border border-[#282C35] flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-[#A1A4AC]">Cycle length</span>
                              <h4 className="text-base font-extrabold text-rose-400">
                                {formState.cycleLength} days
                              </h4>
                            </div>
                            <IconCircle className="size-4 text-rose-400" />
                          </div>

                          <div className="p-3 rounded-2xl bg-[#1e1e24] border border-[#282C35] flex items-center justify-between">
                            <div>
                              <span className="text-[10px] text-[#A1A4AC]">Cycle variation</span>
                              <h4 className="text-base font-extrabold text-[#A1A4AC]">±1 day</h4>
                            </div>
                            <IconRefresh className="size-4 text-[#A1A4AC]" />
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-3xl bg-[#1e1e24] border border-[#282C35] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">Your cycle phase</span>
                          <span className="text-[10px] text-rose-400 font-semibold">
                            Early follicular phase
                          </span>
                        </div>

                        <div className="h-14 w-full rounded-2xl bg-[#090A0C] border border-[#282C35] overflow-hidden flex relative">
                          <div className="w-[45%] bg-rose-900/60 border-r border-rose-500/40 flex items-center justify-center text-[10px] text-rose-200 font-bold">
                            Follicular
                          </div>
                          <div
                            className="w-[10%] bg-cyan-900/60 border-r border-cyan-400 flex items-center justify-center text-cyan-300"
                            title="Ovulation window"
                          >
                            <IconDot size={8} />
                          </div>
                          <div className="w-[45%] bg-emerald-900/60 flex items-center justify-center text-[10px] text-emerald-200 font-bold">
                            Luteal
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#A1A4AC]">
                          <span>Period (Day 1-{formState.periodDays})</span>
                          <span>Ovulation (~Day 14)</span>
                          <span>PMS (Day 24-28)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
