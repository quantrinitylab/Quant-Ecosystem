'use client';

import React from 'react';
import { Button, Modal } from '@quant/shared-ui';
import { IconCheck, IconClock, IconMapPin, IconVideoCall } from '../../../components/icons';
import type { CalendarEventLike, FormState } from '../types';
import { NOTIFICATION_SLIDER_VALUES, RECURRENCE_OPTIONS, TIMEZONES } from '../types';
import { endOf, startOf } from '../lib/calendar-geometry';

export interface CalendarModalsProps {
  isPeriodCustomizeOpen: boolean;
  setIsPeriodCustomizeOpen: (open: boolean) => void;
  formState: FormState;
  setFormState: React.Dispatch<React.SetStateAction<FormState>>;
  isTimezoneModalOpen: boolean;
  setIsTimezoneModalOpen: (open: boolean) => void;
  isRecurrenceModalOpen: boolean;
  setIsRecurrenceModalOpen: (open: boolean) => void;
  isNotificationSliderOpen: boolean;
  setIsNotificationSliderOpen: (open: boolean) => void;
  notifSliderIndex: number;
  setNotifSliderIndex: (index: number) => void;
  addNotificationReminder: (label: string) => void;
  selectedEvent: CalendarEventLike | null;
  setSelectedEvent: (event: CalendarEventLike | null) => void;
  openEditSheet: (event: CalendarEventLike) => void;
  handleDeleteEvent: (id: string) => void;
}

export function CalendarModals({
  isPeriodCustomizeOpen,
  setIsPeriodCustomizeOpen,
  formState,
  setFormState,
  isTimezoneModalOpen,
  setIsTimezoneModalOpen,
  isRecurrenceModalOpen,
  setIsRecurrenceModalOpen,
  isNotificationSliderOpen,
  setIsNotificationSliderOpen,
  notifSliderIndex,
  setNotifSliderIndex,
  addNotificationReminder,
  selectedEvent,
  setSelectedEvent,
  openEditSheet,
  handleDeleteEvent,
}: CalendarModalsProps) {
  return (
    <>
      {/* Period Tracker Customize Settings Modal */}
      <Modal
        isOpen={isPeriodCustomizeOpen}
        onClose={() => setIsPeriodCustomizeOpen(false)}
        title="Customize Cycle Settings"
      >
        <div className="space-y-4 text-xs text-white">
          <div>
            <label className="block text-[#A1A4AC] mb-1 font-semibold">
              Period Length ({formState.periodDays} days)
            </label>
            <input
              type="range"
              min="2"
              max="8"
              value={formState.periodDays}
              onChange={(e) =>
                setFormState({ ...formState, periodDays: Number(e.target.value) || 5 })
              }
              className="w-full accent-rose-500"
            />
          </div>

          <div>
            <label className="block text-[#A1A4AC] mb-1 font-semibold">
              Cycle Length ({formState.cycleLength} days)
            </label>
            <input
              type="range"
              min="21"
              max="36"
              value={formState.cycleLength}
              onChange={(e) =>
                setFormState({ ...formState, cycleLength: Number(e.target.value) || 28 })
              }
              className="w-full accent-rose-500"
            />
          </div>

          <div>
            <label className="block text-[#A1A4AC] mb-1 font-semibold">
              Current Cycle Day ({formState.currentCycleDay})
            </label>
            <input
              type="number"
              min="1"
              max={formState.cycleLength}
              value={formState.currentCycleDay}
              onChange={(e) =>
                setFormState({ ...formState, currentCycleDay: Number(e.target.value) || 1 })
              }
              className="w-full bg-[#111318] border border-[#3A404D] rounded-xl px-3 py-1.5 text-xs text-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#282C35]">
            <Button variant="primary" onClick={() => setIsPeriodCustomizeOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Timezone Selector Modal */}
      <Modal
        isOpen={isTimezoneModalOpen}
        onClose={() => setIsTimezoneModalOpen(false)}
        title="Select Timezone"
      >
        <div className="space-y-1 text-xs max-h-72 overflow-y-auto">
          {TIMEZONES.map((tz) => (
            <button
              key={tz.value}
              type="button"
              onClick={() => {
                setFormState({ ...formState, timezone: tz.value });
                setIsTimezoneModalOpen(false);
              }}
              className={`w-full text-left p-2.5 min-h-[44px] rounded-xl transition-colors flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                formState.timezone === tz.value
                  ? 'bg-[#FF8C42] text-black font-black'
                  : 'text-[#A1A4AC] hover:bg-[#282C35]'
              }`}
              aria-pressed={formState.timezone === tz.value}
            >
              <span>{tz.label}</span>
              {formState.timezone === tz.value && <IconCheck size={13} />}
            </button>
          ))}
        </div>
      </Modal>

      {/* Recurrence Selector Modal */}
      <Modal
        isOpen={isRecurrenceModalOpen}
        onClose={() => setIsRecurrenceModalOpen(false)}
        title="Repeat Option"
      >
        <div className="space-y-1 text-xs">
          {RECURRENCE_OPTIONS.map((rec) => (
            <button
              key={rec}
              type="button"
              onClick={() => {
                setFormState({ ...formState, recurrence: rec });
                setIsRecurrenceModalOpen(false);
              }}
              className={`w-full text-left p-2.5 min-h-[44px] rounded-xl transition-colors flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                formState.recurrence === rec
                  ? 'bg-[#FF8C42] text-black font-black'
                  : 'text-[#A1A4AC] hover:bg-[#282C35]'
              }`}
              aria-pressed={formState.recurrence === rec}
            >
              <span>{rec}</span>
              {formState.recurrence === rec && <IconCheck size={13} />}
            </button>
          ))}
        </div>
      </Modal>

      {/* Custom Notification Slider Modal */}
      <Modal
        isOpen={isNotificationSliderOpen}
        onClose={() => setIsNotificationSliderOpen(false)}
        title="Custom Notification Timing"
      >
        <div className="space-y-4 text-xs text-white">
          <div className="text-center py-2">
            <span className="text-lg font-black text-[#FF8C42]">
              {NOTIFICATION_SLIDER_VALUES[notifSliderIndex].label}
            </span>
          </div>

          <input
            type="range"
            min="0"
            max={NOTIFICATION_SLIDER_VALUES.length - 1}
            value={notifSliderIndex}
            onChange={(e) => setNotifSliderIndex(Number(e.target.value))}
            className="w-full accent-[#FF8C42]"
          />

          <div className="flex items-center justify-between text-[10px] text-[#A1A4AC]">
            <span>5m</span>
            <span>1h</span>
            <span>1d</span>
            <span>1w</span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#282C35]">
            <Button variant="ghost" onClick={() => setIsNotificationSliderOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                addNotificationReminder(NOTIFICATION_SLIDER_VALUES[notifSliderIndex].label);
                setIsNotificationSliderOpen(false);
              }}
            >
              Add Notification
            </Button>
          </div>
        </div>
      </Modal>

      {/* Event Detail Inspector Modal */}
      {selectedEvent && (
        <Modal
          isOpen={Boolean(selectedEvent)}
          onClose={() => setSelectedEvent(null)}
          title={selectedEvent.title}
        >
          <div className="space-y-3 text-xs text-[#A1A4AC]">
            <div className="flex items-center gap-2 text-white font-semibold">
              <IconClock className="size-4 text-[#FF8C42]" />
              <span>
                {selectedEvent.allDay
                  ? 'All Day Entry'
                  : `${startOf(selectedEvent).toLocaleString()} – ${endOf(selectedEvent).toLocaleTimeString()}`}
              </span>
            </div>

            {selectedEvent.type && (
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-md ${
                    selectedEvent.type === 'period'
                      ? 'bg-rose-500/20 text-rose-300'
                      : selectedEvent.type === 'task'
                        ? 'bg-[#FF8C42]/20 text-[#FFB875]'
                        : selectedEvent.type === 'birthday'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-[#FF8C42]/20 text-[#FF8C42]'
                  }`}
                >
                  {selectedEvent.type}
                </span>
                {selectedEvent.flowIntensity && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold">
                    Flow: {selectedEvent.flowIntensity}
                  </span>
                )}
              </div>
            )}

            {selectedEvent.location && (
              <div className="flex items-center gap-2">
                <IconMapPin className="size-4 text-rose-400" />
                {selectedEvent.location.includes('meet.quantrinity.in') ? (
                  <a
                    href={selectedEvent.location}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#FF8C42] hover:underline font-bold"
                  >
                    <IconVideoCall size={13} />
                    {selectedEvent.location}
                    <span className="text-[10px] font-semibold">(Join Meeting)</span>
                  </a>
                ) : (
                  <span>{selectedEvent.location}</span>
                )}
              </div>
            )}

            {selectedEvent.description && (
              <div className="pt-2 border-t border-[#282C35] text-[#A1A4AC]">
                {selectedEvent.description}
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-[#282C35]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditSheet(selectedEvent)}
                  className="px-3 py-1.5 rounded-xl bg-[#FF8C42]/20 text-[#FF8C42] hover:bg-[#FF8C42]/30 text-xs font-bold"
                >
                  Edit Entry
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(selectedEvent.id)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 text-xs font-bold"
                >
                  Delete Entry
                </button>
              </div>
              <Button variant="ghost" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
