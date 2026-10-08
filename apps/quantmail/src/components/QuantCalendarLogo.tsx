'use client';

import { useEffect, useState } from 'react';
import type { QuantLogoProps } from './AppMark';

/**
 * QuantCalendar logo — Apple Calendar-style professional icon.
 * 
 * Clean, minimal, enterprise-grade design inspired by Apple's Calendar:
 * - White/light background with subtle depth
 * - Red header bar with month abbreviation
 * - Large, bold day number in dark text
 * - Subtle rounded corners and professional shadow
 * - Shows today's real date
 * 
 * This replaces the previous complex canvas animation with a polished,
 * instantly recognizable calendar icon that feels at home next to
 * Gmail, Outlook, and Apple Calendar.
 */
export function QuantCalendarLogo({ size = 28, className = '' }: QuantLogoProps) {
  // Track "now" in state so the icon's date — and its accessible name — stay
  // fresh if the app is left open across midnight. The same timer keeps the
  // aria-label in sync with the painted date.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const dayNumber = now.getDate();
  const monthAbbr = now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const weekdayAbbr = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  // Screen-reader users learn the actual date shown, not just "QuantCalendar".
  // Localized with the user's locale (e.g. "QuantCalendar — Tuesday, October 6, 2026").
  const accessibleName = `QuantCalendar — ${now.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`;

  return (
    <span
      role="img"
      aria-label={accessibleName}
      title={accessibleName}
      className={`inline-flex shrink-0 select-none items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className="h-full w-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
        aria-hidden="true"
      >
        <defs>
          {/* Subtle professional background gradient - white to light grey */}
          <linearGradient id="qcal-bg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#F1F3F4" />
          </linearGradient>
          {/* Red header gradient - Apple-style */}
          <linearGradient id="qcal-header" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF3B30" />
            <stop offset="100%" stopColor="#E53935" />
          </linearGradient>
          {/* Subtle inner shadow for depth */}
          <linearGradient id="qcal-sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
            <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        {/* Main calendar body - rounded rectangle */}
        <rect
          x="4"
          y="6"
          width="40"
          height="38"
          rx="7"
          fill="url(#qcal-bg)"
          stroke="rgba(0,0,0,0.08)"
          strokeWidth="1"
        />
        
        {/* Red header bar */}
        <path
          d="M 4 13 A 7 7 0 0 1 11 6 L 37 6 A 7 7 0 0 1 44 13 L 44 17 L 4 17 Z"
          fill="url(#qcal-header)"
        />
        
        {/* Month abbreviation in header - white text */}
        <text
          x="24"
          y="14.5"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif"
          fontSize="10"
          fontWeight="600"
          fill="#FFFFFF"
          letterSpacing="0.8"
        >
          {monthAbbr}
        </text>
        
        {/* Day number - large, bold, dark */}
        <text
          x="24"
          y="36"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif"
          fontSize="19"
          fontWeight="300"
          fill="#1D1D1F"
        >
          {dayNumber}
        </text>
        
        {/* Weekday - small, subtle, below day number */}
        <text
          x="24"
          y="41.5"
          textAnchor="middle"
          fontFamily="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
          fontSize="10"
          fontWeight="500"
          fill="#86868B"
          letterSpacing="0.5"
        >
          {weekdayAbbr}
        </text>
        
        {/* Subtle top sheen for professional polish */}
        <rect
          x="4"
          y="6"
          width="40"
          height="38"
          rx="7"
          fill="url(#qcal-sheen)"
          pointerEvents="none"
        />
      </svg>
    </span>
  );
}

// Backward compatibility: some imports may reference CalendarLogoIcon
export const CalendarLogoIcon = QuantCalendarLogo;
