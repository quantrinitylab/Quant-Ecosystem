'use client';

import React, { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { spring } from '@quant/brand';
import {
  DISAPPEAR_TIMER_OPTIONS,
  formatTimerLabel,
  TIMER_OFF_SECONDS,
} from '../../lib/disappearing-timers';

// ============================================================================
// Task 14.8: DisappearingTimerPicker
//
// Per-conversation disappear-timer configuration. Lets the user pick one of
// the supported durations (5s, 10s, 30s, 1min, 5min, 24h) or turn timers off.
// The selected value applies to all new messages in the conversation.
//
// Requirements: 18.1
// ============================================================================

export interface DisappearingTimerPickerProps {
  /** Conversation the timer applies to. */
  conversationId: string;
  /** Current timer in seconds (0 = off). */
  currentSeconds: number;
  /** Called when the user picks a new duration (seconds, 0 = off). */
  onChange: (seconds: number) => void;
  /** Whether a persist operation is in flight. */
  isSaving?: boolean;
}

export const DisappearingTimerPicker: React.FC<DisappearingTimerPickerProps> = ({
  conversationId,
  currentSeconds,
  onChange,
  isSaving = false,
}) => {
  const [selected, setSelected] = useState<number>(currentSeconds);

  const handleSelect = useCallback(
    (seconds: number) => {
      setSelected(seconds);
      onChange(seconds);
    },
    [onChange],
  );

  return (
    <div className="disappearing-timer-picker" data-conversation-id={conversationId}>
      <header className="disappearing-timer-picker__header">
        <h2 className="disappearing-timer-picker__title">⏱ Disappearing Messages</h2>
        <p className="disappearing-timer-picker__subtitle">
          {selected === TIMER_OFF_SECONDS
            ? 'Messages stay until deleted'
            : `New messages disappear ${formatTimerLabel(selected)} after being viewed`}
          {isSaving ? ' · Saving…' : ''}
        </p>
      </header>

      <div
        className="disappearing-timer-picker__options"
        role="radiogroup"
        aria-label="Disappear timer"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
      >
        {DISAPPEAR_TIMER_OPTIONS.map((option) => {
          const isSelected = option.seconds === selected;
          return (
            <motion.button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(option.seconds)}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', ...spring.snappy }}
              className={`disappearing-timer-picker__option${isSelected ? ' is-selected' : ''}`}
              style={{
                padding: '8px 16px',
                borderRadius: 999,
                border: isSelected ? '2px solid #fffc00' : '1px solid #3a3a3c',
                background: isSelected ? 'rgba(255,252,0,0.12)' : 'transparent',
                color: '#fff',
                fontWeight: isSelected ? 700 : 500,
                cursor: 'pointer',
              }}
            >
              {option.label}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default DisappearingTimerPicker;
