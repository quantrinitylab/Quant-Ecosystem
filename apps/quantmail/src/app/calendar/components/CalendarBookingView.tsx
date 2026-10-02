'use client';

import React, { useState } from 'react';
import { showToast } from '../../../components/InboxToast';

export interface CalendarBookingViewProps {
  userEmail?: string;
  bookingSlug?: string;
  className?: string;
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-3.5'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function CalendarBookingView({
  userEmail = 'sundar@quantmail.in',
  bookingSlug = 'sundar',
  className = '',
}: CalendarBookingViewProps) {
  const [copied, setCopied] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState<'15m' | '30m' | '45m' | '60m'>('30m');
  const [selectedSlot, setSelectedSlot] = useState<string | null>('10:00 AM');
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);

  const bookingUrl = `https://quantmail.in/calendar/booking/${bookingSlug}`;

  const handleCopyLink = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(bookingUrl);
      }
      setCopied(true);
      showToast({ text: 'Booking link copied to clipboard', type: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast({ text: 'Failed to copy link', type: 'error' });
    }
  };

  const handleBookSlot = (slot: string) => {
    if (bookedSlots.includes(slot)) return;
    setSelectedSlot(slot);
    setBookedSlots((prev) => [...prev, slot]);
    showToast({
      text: `Slot ${slot} reserved with Instant E2EE Confirmation!`,
      type: 'success',
    });
  };

  const timeSlots = [
    { time: '10:00 AM', status: 'available' },
    { time: '11:30 AM', status: 'available' },
    { time: '02:00 PM', status: 'available' },
    { time: '04:30 PM', status: 'available' },
  ];

  return (
    <div
      id="subview-booking"
      role="tabpanel"
      aria-labelledby="tab-booking"
      className={`flex-1 flex flex-col overflow-y-auto bg-[#090A0E] text-[#F5F5F5] p-4 sm:p-6 space-y-6 ${className}`}
    >
      {/* Sovereign Public Booking Header Card */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#F59E0B]">
                Public Booking Engine
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F59E0B]/20 text-[#F59E0B] border border-[#F59E0B]/40">
                Calendly-Class
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F5F5] mt-1">
              One-Click Instant Availability & Booking
            </h2>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              Share your sovereign scheduling URL for frictionless, zero-coordination calendar reservations.
            </p>
          </div>

          {/* Slot Concurrency Status Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/40 border border-emerald-800/60 text-xs font-medium text-emerald-300 shadow-sm"
            title="Real-time Concurrency & E2EE Verification"
          >
            <ShieldCheckIcon className="size-3.5 text-emerald-400" />
            <span>4 slots available today · Instant E2EE Confirmation</span>
          </div>
        </div>

        {/* Link Display & Copy Link Pill */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 bg-[#090A0E] border border-[#232938] rounded-xl p-2.5">
          <div className="flex-1 font-mono text-xs sm:text-sm text-[#F59E0B] px-3 py-1.5 truncate select-all">
            {bookingUrl}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Copy Link Pill */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-[#F59E0B] hover:bg-[#D97706] text-black text-xs font-bold transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B]"
            >
              {copied ? (
                <>
                  <CheckIcon className="size-3.5 text-black" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="size-3.5 text-black" />
                  <span>Copy Link</span>
                </>
              )}
            </button>

            {/* Open Public Page */}
            <a
              href={`/calendar/booking/${bookingSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#161822] hover:bg-[#1f2230] border border-[#232938] text-xs font-medium text-[#A1A4AC] hover:text-[#F5F5F5] transition-all"
            >
              <ExternalLinkIcon className="size-3.5 text-current" />
              <span>Preview</span>
            </a>
          </div>
        </div>
      </div>

      {/* Meeting Duration Selector Chips */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-bold text-[#F5F5F5] flex items-center gap-2">
            <ClockIcon className="size-4 text-[#F59E0B]" />
            <span>Meeting Duration</span>
          </label>
          <span className="text-xs text-[#A1A4AC]">Select duration chip for public slots</span>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {(['15m', '30m', '45m', '60m'] as const).map((duration) => {
            const isSelected = selectedDuration === duration;
            return (
              <button
                key={duration}
                type="button"
                onClick={() => setSelectedDuration(duration)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F59E0B] ${
                  isSelected
                    ? 'bg-[#F59E0B] text-black shadow-[0_0_16px_rgba(245,158,11,0.3)] scale-105'
                    : 'bg-[#090A0E] text-[#A1A4AC] hover:text-[#F5F5F5] border border-[#232938] hover:border-[#F59E0B]/40'
                }`}
              >
                {duration}
              </button>
            );
          })}
        </div>
      </div>

      {/* Available Time Slots Grid */}
      <div className="bg-[#12151E] border border-[#232938] rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#F5F5F5]">Available Time Slots (Today)</h3>
            <p className="text-xs text-[#A1A4AC] mt-0.5">
              Live CalDAV free/busy calculations · Instant double-booking prevention
            </p>
          </div>
          <span className="text-xs font-medium text-[#F59E0B]">
            {4 - bookedSlots.length} open slots
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {timeSlots.map(({ time }) => {
            const isBooked = bookedSlots.includes(time);
            const isSelected = selectedSlot === time;

            return (
              <div
                key={time}
                onClick={() => !isBooked && setSelectedSlot(time)}
                className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 cursor-pointer select-none ${
                  isBooked
                    ? 'bg-[#090A0E]/50 border-[#232938] opacity-60 cursor-not-allowed'
                    : isSelected
                    ? 'bg-[#F59E0B]/10 border-2 border-[#F59E0B] shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                    : 'bg-[#090A0E] border-[#232938] hover:border-[#F59E0B]/50 hover:bg-[#161822]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-base font-bold text-[#F5F5F5]">{time}</span>
                  <span
                    className={`size-2 rounded-full ${
                      isBooked ? 'bg-zinc-600' : 'bg-emerald-400 animate-pulse'
                    }`}
                  />
                </div>

                <div className="text-xs text-[#A1A4AC]">
                  {isBooked ? (
                    <span className="text-zinc-500 font-medium">Booked & Confirmed</span>
                  ) : (
                    <span>Duration: {selectedDuration}</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isBooked}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleBookSlot(time);
                  }}
                  className={`w-full py-1.5 rounded-lg text-xs font-bold transition-all focus-visible:outline-none ${
                    isBooked
                      ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#F59E0B] hover:bg-[#D97706] text-black shadow-sm'
                      : 'bg-[#161822] hover:bg-[#1f2230] text-[#F59E0B] border border-[#232938]'
                  }`}
                >
                  {isBooked ? 'Reserved' : 'Reserve Slot'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
