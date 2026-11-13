'use client';

import React, { useState } from 'react';

export function MobileClearCalendarScheduleModal({
  onClose,
  onDeclineSelected,
}: {
  onClose: () => void;
  onDeclineSelected: () => void;
}) {
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>(['ev-lunch']);

  const conflictingEvents = [
    { id: 'ev-lunch', title: 'Lunch', time: '12:00 PM - 1:00 PM', date: '27 Fri', role: 'Organiser' },
    { id: 'ev-pack', title: 'Pack merchandise', time: '1:00 PM - 2:00 PM', date: '27 Fri', role: 'Organiser' },
  ];

  return (
    <div
      data-testid="clear-calendar-schedule-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-card)] dark:bg-[#1C1C1E] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="clear-calendar-cancel-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          Cancel
        </button>
        <h2 className="text-base font-semibold">Clear My Calendar</h2>
        <button
          type="button"
          data-testid="clear-calendar-decline-btn"
          onClick={onDeclineSelected}
          className="text-base font-semibold text-red-500"
        >
          Decline
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-[var(--quant-muted-foreground)]">
          Choose the events you want to cancel:
        </p>

        <div className="rounded-2xl border border-[var(--quant-border)] divide-y divide-[var(--quant-border)] overflow-hidden">
          {conflictingEvents.map((ev) => {
            const isChecked = selectedEventIds.includes(ev.id);
            return (
              <button
                key={ev.id}
                type="button"
                data-testid={`conflict-event-${ev.id}`}
                onClick={() => {
                  setSelectedEventIds(
                    isChecked
                      ? selectedEventIds.filter((id) => id !== ev.id)
                      : [...selectedEventIds, ev.id]
                  );
                }}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--quant-border)]/20"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center rounded-lg bg-[var(--quant-border)]/50 size-10 text-center font-bold">
                    <span className="text-sm">27</span>
                    <span className="text-[var(--q-type-xs)] uppercase text-[var(--quant-muted-foreground)]">Fri</span>
                  </div>
                  <div>
                    <span className="font-semibold text-sm block">{ev.title}</span>
                    <span className="text-xs text-[var(--quant-muted-foreground)]">{ev.time}</span>
                  </div>
                </div>
                <div
                  className={`size-5 rounded-full border flex items-center justify-center ${
                    isChecked ? 'bg-red-500 border-red-500 text-white text-xs' : 'border-[var(--quant-border)]'
                  }`}
                >
                  {isChecked && '✓'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function MobileAutomaticRepliesSheet({
  isOpen,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (enabled: boolean, msg: string) => void;
}) {
  const [enabled, setEnabled] = useState(true);
  const [replyTimeRange, setReplyTimeRange] = useState(false);
  const [message, setMessage] = useState(
    "I'm on leave until March 1. Please reach me on my cell number for urgent matters."
  );
  const [showClearScheduleModal, setShowClearScheduleModal] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      data-testid="automatic-replies-sheet"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] text-[var(--quant-foreground)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
        <button
          type="button"
          data-testid="autoreplies-back-btn"
          onClick={onClose}
          className="text-base text-[var(--quant-muted-foreground)]"
        >
          ‹
        </button>
        <h2 className="text-base font-semibold">Automatic Replies</h2>
        <button
          type="button"
          data-testid="autoreplies-save-btn"
          onClick={() => {
            onSave(enabled, message);
            onClose();
          }}
          className="text-base font-semibold text-[#0078D4]"
        >
          Done
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        <div className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)] overflow-hidden">
          {/* Main Toggle */}
          <div className="flex items-center justify-between p-4">
            <span className="font-semibold text-sm">Automatic Replies</span>
            <input
              type="checkbox"
              data-testid="autoreplies-main-toggle"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="size-5 accent-[#0078D4]"
            />
          </div>

          {enabled && (
            <>
              {/* Time Range Toggle */}
              <div className="flex items-center justify-between p-4">
                <div>
                  <span className="font-medium text-sm block">Reply Within a Time Range</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    Send replies only during a time period
                  </span>
                </div>
                <input
                  type="checkbox"
                  data-testid="autoreplies-timerange-toggle"
                  checked={replyTimeRange}
                  onChange={(e) => setReplyTimeRange(e.target.checked)}
                  className="size-5 accent-[#0078D4]"
                />
              </div>

              {/* Clear Schedule Button (Flow #19) */}
              <button
                type="button"
                data-testid="clear-my-calendar-btn"
                onClick={() => setShowClearScheduleModal(true)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-[var(--quant-border)]/20"
              >
                <div>
                  <span className="font-medium text-sm block">Clear My Calendar</span>
                  <span className="text-xs text-[var(--quant-muted-foreground)]">
                    Decline and cancel meetings during the period you selected.
                  </span>
                </div>
                <span className="text-[#0078D4]">›</span>
              </button>
            </>
          )}
        </div>

        {enabled && (
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[var(--quant-muted-foreground)]">
              Reply to Everyone With
            </span>
            <textarea
              data-testid="autoreplies-message-input"
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3 text-xs outline-none leading-relaxed"
            />
          </div>
        )}
      </div>

      {/* Clear My Calendar Sheet (Flow #19 Screen 1-2) */}
      {showClearScheduleModal && (
        <MobileClearCalendarScheduleModal
          onClose={() => setShowClearScheduleModal(false)}
          onDeclineSelected={() => {
            setShowClearScheduleModal(false);
          }}
        />
      )}
    </div>
  );
}

export const AutomaticRepliesSheet = MobileAutomaticRepliesSheet;
export const ClearCalendarScheduleModal = MobileClearCalendarScheduleModal;
