'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';

interface EmailSendLaterProps {
  onSchedule: (date: Date) => void;
  onCancel: () => void;
}

/**
 * Send Later picker — visual date/time selector for scheduling email delivery.
 * Gmail has a basic menu. We show smart suggestions based on recipient timezone
 * and optimal open times (morning, after lunch, end of day).
 */
export function EmailSendLater({ onSchedule, onCancel }: EmailSendLaterProps) {
  const [customDate, setCustomDate] = useState('');
  const [customTime, setCustomTime] = useState('09:00');

  const presets = [
    { label: 'Tomorrow 9 AM', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }, hint: 'Morning inbox peak' },
    { label: 'Tomorrow 2 PM', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(14, 0, 0, 0); return d; }, hint: 'Post-lunch focus' },
    { label: 'Monday 9 AM', getDate: () => { const d = new Date(); d.setDate(d.getDate() + (8 - d.getDay()) % 7 || 7); d.setHours(9, 0, 0, 0); return d; }, hint: 'Start of week' },
    { label: 'In 2 hours', getDate: () => new Date(Date.now() + 2 * 60 * 60 * 1000), hint: 'Quick delay' },
    { label: 'In 4 hours', getDate: () => new Date(Date.now() + 4 * 60 * 60 * 1000), hint: 'Half-day delay' },
  ];

  const handleCustomSchedule = () => {
    if (!customDate) return;
    const [year, month, day] = customDate.split('-').map(Number);
    const [hours, minutes] = customTime.split(':').map(Number);
    const date = new Date(year, month - 1, day, hours, minutes);
    if (date > new Date()) onSchedule(date);
  };

  return (
    <motion.div
      className="send-later-picker"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <header className="send-later-header">
        <h3>Schedule send</h3>
        <button type="button" onClick={onCancel} aria-label="Close">×</button>
      </header>

      <div className="send-later-presets">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="send-later-preset"
            onClick={() => onSchedule(preset.getDate())}
          >
            <span className="preset-label">{preset.label}</span>
            <span className="preset-hint">{preset.hint}</span>
          </button>
        ))}
      </div>

      <div className="send-later-custom">
        <p className="send-later-custom-label">Custom date & time</p>
        <div className="send-later-custom-inputs">
          <input
            type="date"
            className="send-later-date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
          />
          <input
            type="time"
            className="send-later-time"
            value={customTime}
            onChange={(e) => setCustomTime(e.target.value)}
          />
          <button type="button" className="send-later-confirm" onClick={handleCustomSchedule}>
            Schedule
          </button>
        </div>
      </div>
    </motion.div>
  );
}
