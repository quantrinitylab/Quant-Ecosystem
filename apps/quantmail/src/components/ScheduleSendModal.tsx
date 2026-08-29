'use client';

import { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconChevronLeft, IconChevronRight, IconX } from './icons';

interface ScheduleSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSchedule: (scheduledAt: string) => void;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function ScheduleSendModal({ isOpen, onClose, onSchedule }: ScheduleSendModalProps) {
  const today = useMemo(() => new Date(), []);

  // Date State
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  // Time State (12h format)
  const [hour, setHour] = useState<number>(8);
  const [minute, setMinute] = useState<number>(0);
  const [period, setPeriod] = useState<'AM' | 'PM'>('AM');
  const [clockMode, setClockMode] = useState<'hours' | 'minutes'>('hours');

  // Clock ref for touch/drag gestures
  const clockRef = useRef<HTMLDivElement>(null);
  const isDraggingClock = useRef<boolean>(false);

  // Days in selected view month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{ day: number; currentMonth: boolean; date: Date; isPast: boolean }> = [];

    // Prev month padding
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - 1, daysInPrevMonth - i);
      days.push({ day: daysInPrevMonth - i, currentMonth: false, date: d, isPast: true });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(viewYear, viewMonth, d);
      const isPast =
        curDate.getFullYear() < today.getFullYear() ||
        (curDate.getFullYear() === today.getFullYear() && curDate.getMonth() < today.getMonth()) ||
        (curDate.getFullYear() === today.getFullYear() &&
          curDate.getMonth() === today.getMonth() &&
          curDate.getDate() < today.getDate());
      days.push({ day: d, currentMonth: true, date: curDate, isPast });
    }

    // Next month padding to reach full grid of 35 or 42
    const total = days.length;
    const remaining = total <= 35 ? 35 - total : 42 - total;
    for (let d = 1; d <= remaining; d++) {
      const curDate = new Date(viewYear, viewMonth + 1, d);
      days.push({ day: d, currentMonth: false, date: curDate, isPast: false });
    }

    return days;
  }, [viewYear, viewMonth, today]);

  const handlePrevMonth = useCallback(() => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  }, [viewMonth]);

  const handleNextMonth = useCallback(() => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  }, [viewMonth]);

  const handleSelectDay = (date: Date, isPast: boolean) => {
    if (isPast) return;
    setSelectedDate(date);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  };

  // Quick Preset Handlers (Today Evening, Tomorrow Morning, Tomorrow Afternoon)
  const handleQuickPreset = (type: 'today_evening' | 'tomorrow_morning' | 'tomorrow_afternoon') => {
    const d = new Date();
    if (type === 'today_evening') {
      setSelectedDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setHour(6);
      setMinute(0);
      setPeriod('PM');
    } else if (type === 'tomorrow_morning') {
      d.setDate(d.getDate() + 1);
      setSelectedDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setHour(8);
      setMinute(0);
      setPeriod('AM');
    } else if (type === 'tomorrow_afternoon') {
      d.setDate(d.getDate() + 1);
      setSelectedDate(d);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setHour(1);
      setMinute(0);
      setPeriod('PM');
    }
  };

  // Drag Gesture for Month Swipe
  const handleCalendarDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (info.offset.x < -40) {
      handleNextMonth();
    } else if (info.offset.x > 40) {
      handlePrevMonth();
    }
  };

  // Clock Gesture & Angle Handler (Continuous rotation, minutes 0-59, hours 1-12)
  const updateClockFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!clockRef.current) return;
      const rect = clockRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // Angle in degrees from top 12 o'clock clockwise (0 to 360)
      let deg = (Math.atan2(dy, dx) * (180 / Math.PI) + 90 + 360) % 360;

      if (clockMode === 'hours') {
        let h = Math.round(deg / 30);
        if (h === 0) h = 12;
        setHour(h);
      } else {
        let m = Math.round(deg / 6) % 60;
        setMinute(m);
      }
    },
    [clockMode],
  );

  const handleClockPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingClock.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateClockFromPointer(e.clientX, e.clientY);
  };

  const handleClockPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingClock.current) return;
    updateClockFromPointer(e.clientX, e.clientY);
  };

  const handleClockPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingClock.current) {
      isDraggingClock.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {}
      if (clockMode === 'hours') {
        setClockMode('minutes');
      }
    }
  };

  const handleConfirm = () => {
    const finalDate = new Date(selectedDate);
    let finalHour = hour % 12;
    if (period === 'PM') finalHour += 12;
    finalDate.setHours(finalHour, minute, 0, 0);

    onSchedule(finalDate.toISOString());
    onClose();
  };

  // Clock Numbers (Standard 1 to 12 & 00 to 55)
  const hoursList = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const minutesList = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 0];

  // Calculated pointer rotation
  const pointerRotation = useMemo(() => {
    if (clockMode === 'hours') {
      return (hour % 12) * 30;
    }
    return minute * 6;
  }, [clockMode, hour, minute]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm select-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="w-full max-w-lg rounded-3xl border border-[#282C35] bg-[#121622] p-4 sm:p-6 shadow-2xl space-y-4"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#282C35]/80 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-[#FF8C42]/10 text-[#FF8C42] flex items-center justify-center border border-[#FF8C42]/20">
                  <svg
                    className="size-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Schedule Send</h3>
                  <p className="text-[11px] text-[#A1A4AC]">
                    Pick date & time to deliver your message
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close schedule send dialog"
                className="inline-flex items-center justify-center size-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 -mr-1.5 sm:mr-0 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <IconX size={15} />
              </button>
            </div>

            {/* Quick Presets (Exactly 2: Today 6 PM and Tomorrow 8 AM) */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <button
                type="button"
                onClick={() => handleQuickPreset('today_evening')}
                className="px-3.5 py-2.5 rounded-2xl bg-[#111318]/80 hover:bg-[#282C35]/90 border border-[#282C35] text-left transition-all hover:border-[#FF8C42]/40 group"
              >
                <span className="block font-medium text-[#F5F5F5] text-xs group-hover:text-white">
                  Today
                </span>
                <span className="text-xs text-[#FF8C42] font-semibold">6:00 PM</span>
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('tomorrow_morning')}
                className="px-3.5 py-2.5 rounded-2xl bg-[#111318]/80 hover:bg-[#282C35]/90 border border-[#282C35] text-left transition-all hover:border-[#FF8C42]/40 group"
              >
                <span className="block font-medium text-[#F5F5F5] text-xs group-hover:text-white">
                  Tomorrow
                </span>
                <span className="text-xs text-[#FF8C42] font-semibold">8:00 AM</span>
              </button>
            </div>

            {/* Calendar & Clock Body */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Left Column: Calendar with Gesture Swipe Support */}
              <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={handleCalendarDragEnd}
                className="space-y-2.5 bg-[#090A0C]/40 p-3 rounded-2xl border border-[#282C35]/80 touch-pan-y"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="inline-flex items-center justify-center size-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                      title="Previous month (or swipe right)"
                      aria-label="Previous month"
                    >
                      <IconChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="inline-flex items-center justify-center size-7 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                      title="Next month (or swipe left)"
                      aria-label="Next month"
                    >
                      <IconChevronRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-[#A1A4AC]">
                  {WEEKDAYS.map((w, idx) => (
                    <span key={idx}>{w}</span>
                  ))}
                </div>

                {/* Days Grid */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs select-none">
                  {calendarDays.map((item, idx) => {
                    const isSelected =
                      item.date.getFullYear() === selectedDate.getFullYear() &&
                      item.date.getMonth() === selectedDate.getMonth() &&
                      item.date.getDate() === selectedDate.getDate();

                    const isToday =
                      item.date.getFullYear() === today.getFullYear() &&
                      item.date.getMonth() === today.getMonth() &&
                      item.date.getDate() === today.getDate();

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={item.isPast}
                        onClick={() => handleSelectDay(item.date, item.isPast)}
                        className={`size-7 mx-auto rounded-lg flex items-center justify-center text-[11px] font-medium transition-all ${
                          isSelected
                            ? 'bg-[#FF8C42] text-black font-bold shadow-md scale-105'
                            : isToday
                              ? 'border border-[#FF8C42]/50 text-[#FF8C42]'
                              : item.isPast
                                ? // Genuinely `disabled`, so 1.4.3 does not
                                  // apply — but #3A404D is 1.91:1 and the past
                                  // half of the grid read as empty holes rather
                                  // than as dates you cannot pick.
                                  'text-[#6B6E76] cursor-not-allowed'
                                : item.currentMonth
                                  ? 'text-[#F5F5F5] hover:bg-[#282C35]'
                                  : 'text-[#A1A4AC]'
                        }`}
                      >
                        {item.day}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-[#A1A4AC] text-center">
                  Swipe left/right to change month
                </p>
              </motion.div>

              {/* Right Column: Google Clock Material Style Picker with Drag Gestures */}
              <div className="flex flex-col items-center justify-between bg-[#090A0C]/40 p-3 rounded-2xl border border-[#282C35]/80 space-y-2 select-none">
                {/* Digital Time Display */}
                <div className="flex items-center justify-center gap-2">
                  <div className="flex items-center rounded-xl bg-[#111318] border border-[#282C35] p-1">
                    <button
                      type="button"
                      onClick={() => setClockMode('hours')}
                      className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all ${
                        clockMode === 'hours'
                          ? 'bg-[#FF8C42] text-black shadow'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      {hour.toString().padStart(2, '0')}
                    </button>
                    <span className="px-1 text-[#6B6E76] font-bold">:</span>
                    <button
                      type="button"
                      onClick={() => setClockMode('minutes')}
                      className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all ${
                        clockMode === 'minutes'
                          ? 'bg-[#FF8C42] text-black shadow'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      {minute.toString().padStart(2, '0')}
                    </button>
                  </div>

                  {/* AM/PM Toggle */}
                  <div className="flex rounded-xl bg-[#111318] border border-[#282C35] p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setPeriod('AM')}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        period === 'AM'
                          ? 'bg-[#FF8C42] text-black'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      AM
                    </button>
                    <button
                      type="button"
                      onClick={() => setPeriod('PM')}
                      className={`px-2 py-1 rounded-lg transition-all ${
                        period === 'PM'
                          ? 'bg-[#FF8C42] text-black'
                          : 'text-[#A1A4AC] hover:text-white'
                      }`}
                    >
                      PM
                    </button>
                  </div>
                </div>

                {/* Radial Clock Face with full touch/drag gesture support */}
                <div
                  ref={clockRef}
                  onPointerDown={handleClockPointerDown}
                  onPointerMove={handleClockPointerMove}
                  onPointerUp={handleClockPointerUp}
                  className="relative size-40 rounded-full bg-[#111318]/90 border border-[#282C35] flex items-center justify-center shadow-inner cursor-pointer touch-none"
                >
                  {/* Center Pin */}
                  <div className="size-2 rounded-full bg-[#FF8C42] z-10 pointer-events-none" />

                  {/* Clock Hand / Pointer */}
                  <div
                    className="absolute bottom-1/2 left-1/2 w-0.5 origin-bottom bg-[#FF8C42] transition-transform duration-100 z-0 pointer-events-none"
                    style={{
                      height: '56px',
                      transform: `translateX(-50%) rotate(${pointerRotation}deg)`,
                    }}
                  >
                    <div className="size-6 -top-3 -left-[11px] absolute rounded-full bg-[#FF8C42]/30 border border-[#FF8C42]" />
                  </div>

                  {/* Numbers accurately plotted at angle = (val * 30 - 90) deg */}
                  {(clockMode === 'hours' ? hoursList : minutesList).map((val) => {
                    const angleDeg =
                      (clockMode === 'hours' ? val * 30 : val === 0 ? 360 : val * 6) - 90;
                    const angleRad = angleDeg * (Math.PI / 180);
                    const radius = 56;
                    const x = Math.cos(angleRad) * radius;
                    const y = Math.sin(angleRad) * radius;
                    const isCur = clockMode === 'hours' ? hour === val : minute === val;

                    return (
                      <div
                        key={val}
                        style={{
                          transform: `translate(${x}px, ${y}px)`,
                        }}
                        className={`absolute size-6 rounded-full flex items-center justify-center text-[10px] font-semibold pointer-events-none transition-all ${
                          isCur
                            ? 'bg-[#FF8C42] text-black font-bold shadow scale-110'
                            : 'text-[#A1A4AC]'
                        }`}
                      >
                        {clockMode === 'hours' ? val : val.toString().padStart(2, '0')}
                      </div>
                    );
                  })}
                </div>

                {/* Minute Slider / Gesture Fine Tuner */}
                <div className="w-full space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-[#A1A4AC]">
                    <span>
                      Fine-tune Minute:{' '}
                      <strong className="text-[#FF8C42]">
                        {minute.toString().padStart(2, '0')}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setClockMode(clockMode === 'hours' ? 'minutes' : 'hours')}
                      className="text-[#FF8C42] hover:underline capitalize"
                    >
                      Switch to {clockMode === 'hours' ? 'Minutes' : 'Hours'}
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="59"
                    value={minute}
                    onChange={(e) => {
                      setMinute(parseInt(e.target.value, 10));
                      setClockMode('minutes');
                    }}
                    className="w-full accent-[#FF8C42] h-1.5 bg-[#282C35] rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Footer Preview & Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-[#282C35]">
              <div className="text-xs text-[#A1A4AC] truncate pr-2">
                <span>Send on: </span>
                <strong className="text-[#FF8C42] font-semibold">
                  {selectedDate.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}{' '}
                  at {hour.toString().padStart(2, '0')}:{minute.toString().padStart(2, '0')}{' '}
                  {period}
                </strong>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="px-4 py-1.5 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#111111] text-xs font-semibold shadow-sm transition-all"
                >
                  Schedule Send
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
