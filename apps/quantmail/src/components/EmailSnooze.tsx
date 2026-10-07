'use client';

// ============================================================================
// EmailSnooze — "snooze until" menu for one conversation or a selection
// ============================================================================
// The menu's behaviour (positioning, dismissal, keyboard scope, roving focus)
// now lives in `AnchoredMenu`; what is left here is the thing that is actually
// about snoozing — the five presets, the custom date field, and the guarantee
// that neither can hand the backend a time in the past.

import { useCallback, useState } from 'react';
import { AnchoredMenu } from './AnchoredMenu';
import { MailIcon } from './MailIcon';

interface EmailSnoozeProps {
  /**
   * The caller closes over what is being snoozed — one row's conversation, or a
   * whole selection. This used to take an `emailId` back as its first argument,
   * which the row had just handed in and which no other caller could supply.
   */
  onSnooze: (snoozeUntil: Date) => void;
  /** Controlled open state (optional), so the row's hover bar can open it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Keep the anchor, drop the trigger — the hover bar covers its slot. */
  triggerHidden?: boolean;
  /** Lets the selection header's trigger match its siblings instead of `.snooze-trigger`. */
  triggerClassName?: string;
  triggerLabel?: string;
}

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Tomorrow at 09:00, local.
 *
 * Exported because the inbox row's swipe-right commits to this same time, and a
 * gesture that snoozed to a *slightly different* tomorrow than the menu's
 * `Tomorrow` would be two different features wearing one word. One function, two
 * callers.
 */
export function snoozeUntilNextMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

// Every option is guaranteed to land in the future (the backend rejects past
// snooze times): weekend/next-week math rolls forward a full week when the
// naive target would be today-or-earlier.
const SNOOZE_OPTIONS = [
  {
    label: 'Later today',
    getDate: () => {
      const d = new Date();
      d.setHours(d.getHours() + 3);
      return d;
    },
  },
  {
    label: 'Tomorrow',
    getDate: snoozeUntilNextMorning,
  },
  {
    label: 'This weekend',
    getDate: () => {
      const d = new Date();
      const add = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next week',
    getDate: () => {
      const d = new Date();
      const add = (1 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + add);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: 'Next month',
    getDate: () => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
] as const;

export function EmailSnooze({
  onSnooze,
  open,
  onOpenChange,
  triggerHidden = false,
  triggerClassName = 'snooze-trigger',
  triggerLabel = 'Snooze email',
}: EmailSnoozeProps) {
  const [customValue, setCustomValue] = useState('');

  const customDate = customValue ? new Date(customValue) : null;
  const customInvalid =
    !customDate || Number.isNaN(customDate.getTime()) || customDate.getTime() <= Date.now();

  const handleCustomSnooze = useCallback(
    (close: () => void) => {
      if (!customDate || customInvalid) return;
      onSnooze(customDate);
      setCustomValue('');
      close();
    },
    [customDate, customInvalid, onSnooze],
  );

  return (
    <AnchoredMenu
      icon={<MailIcon name="clock" className="size-4" />}
      triggerLabel={triggerLabel}
      triggerTitle="Snooze"
      triggerClassName={triggerClassName}
      triggerHidden={triggerHidden}
      menuLabel="Snooze options"
      menuClassName="snooze-menu"
      // `shrink-0` because the selection header packs four controls into a fixed
      // right group: an inline-flex wrapper that can shrink is how a 44px button
      // silently becomes 26px wide next to a long count.
      wrapperClassName="snooze-wrapper shrink-0"
      scope="snooze-menu"
      open={open}
      onOpenChange={onOpenChange}
      // Five presets at the coarse-pointer floor plus the custom row; the clamp
      // needs the tall figure or the menu runs off the bottom of a phone.
      height={380}
    >
      {(close) => (
        <>
          <p className="snooze-menu-title">Snooze until</p>
          {SNOOZE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              role="menuitem"
              className="snooze-option"
              onClick={() => {
                onSnooze(option.getDate());
                close();
              }}
            >
              <span>{option.label}</span>
              <span className="snooze-option-date">
                {option.getDate().toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </button>
          ))}
          <div className="snooze-custom">
            <p className="snooze-menu-title">Pick date &amp; time</p>
            <div className="snooze-custom-row">
              <input
                type="datetime-local"
                value={customValue}
                min={toLocalInputValue(new Date(Date.now() + 5 * 60 * 1000))}
                onChange={(e) => setCustomValue(e.target.value)}
                aria-label="Custom snooze date and time"
              />
              <button
                type="button"
                disabled={customInvalid}
                onClick={() => handleCustomSnooze(close)}
              >
                Set
              </button>
            </div>
          </div>
        </>
      )}
    </AnchoredMenu>
  );
}
