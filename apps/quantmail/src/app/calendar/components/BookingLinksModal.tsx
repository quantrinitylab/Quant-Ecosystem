'use client';

// ============================================================================
// QuantCalendar — Host Booking Links Manager Modal (Calendly-Class Parity)
// Tasks W39-CAL01 & W39-CAL02
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { showToast } from '../../../components/InboxToast';

export interface BookingLinkItem {
  id: string;
  slug: string;
  title: string;
  description?: string;
  duration: number; // in minutes (15, 30, 45, 60)
  startHour: number; // 0..23 (default 9)
  endHour: number; // 1..24 (default 17)
  availableDays: number[]; // 0 = Sun, 1 = Mon ... 6 = Sat
  isActive: boolean;
  createdAt: string;
}

export interface BookingLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const DEFAULT_BOOKING_LINKS: BookingLinkItem[] = [
  {
    id: 'link-30-min',
    slug: '30-min-strategy-session',
    title: '30 Min Strategy Session',
    description: 'Quick discussion to review requirements, architecture roadmap, and next steps.',
    duration: 30,
    startHour: 9,
    endHour: 17,
    availableDays: [1, 2, 3, 4, 5],
    isActive: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'link-15-min',
    slug: '15-min-quick-sync',
    title: '15 Min Quick Sync',
    description: 'Fast 1:1 check-in or quick question sync.',
    duration: 15,
    startHour: 10,
    endHour: 16,
    availableDays: [1, 2, 3, 4, 5],
    isActive: true,
    createdAt: '2026-09-05T00:00:00.000Z',
  },
  {
    id: 'link-60-min',
    slug: '60-min-deep-dive',
    title: '60 Min Technical Deep Dive',
    description: 'In-depth architectural review, live pair-programming, or system design session.',
    duration: 60,
    startHour: 9,
    endHour: 18,
    availableDays: [1, 2, 3, 4, 5],
    isActive: true,
    createdAt: '2026-09-10T00:00:00.000Z',
  },
];

const WEEKDAY_NAMES = [
  { day: 1, label: 'Mon', full: 'Monday' },
  { day: 2, label: 'Tue', full: 'Tuesday' },
  { day: 3, label: 'Wed', full: 'Wednesday' },
  { day: 4, label: 'Thu', full: 'Thursday' },
  { day: 5, label: 'Fri', full: 'Friday' },
  { day: 6, label: 'Sat', full: 'Saturday' },
  { day: 0, label: 'Sun', full: 'Sunday' },
];

const DURATION_PRESETS = [15, 30, 45, 60];

export const BookingLinksModal: React.FC<BookingLinksModalProps> = ({
  isOpen,
  onClose,
  userEmail = 'kundan@quantmail.in',
}) => {
  const [links, setLinks] = useState<BookingLinkItem[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('quant_calendar_booking_links');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // fallback
      }
    }
    return DEFAULT_BOOKING_LINKS;
  });

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formStartHour, setFormStartHour] = useState<number>(9);
  const [formEndHour, setFormEndHour] = useState<number>(17);
  const [formAvailableDays, setFormAvailableDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Sync to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('quant_calendar_booking_links', JSON.stringify(links));
    }
  }, [links]);

  // Handle title changes & auto-slugification
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormTitle(val);
    if (!slugManuallyEdited) {
      setFormSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSlugManuallyEdited(true);
    setFormSlug(slugify(e.target.value));
  };

  const toggleDay = (day: number) => {
    setFormAvailableDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  };

  const handleCopyLink = useCallback((slug: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://quantmail.in';
    const fullUrl = `${origin}/calendar/booking/${slug}`;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(fullUrl).catch(() => {
        // fallback
      });
    }

    setCopiedSlug(slug);
    showToast({
      text: `Copied booking link: /calendar/booking/${slug}`,
      type: 'success',
    });

    setTimeout(() => {
      setCopiedSlug((current) => (current === slug ? null : current));
    }, 2500);
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast({ text: 'Please enter a title for the booking link', type: 'error' });
      return;
    }

    const finalSlug = formSlug.trim() || slugify(formTitle);
    if (!finalSlug) {
      showToast({ text: 'Please enter a valid URL slug', type: 'error' });
      return;
    }

    // Check slug collision
    if (links.some((l) => l.slug === finalSlug)) {
      showToast({ text: 'A booking link with this slug already exists', type: 'error' });
      return;
    }

    if (formAvailableDays.length === 0) {
      showToast({ text: 'Please select at least one available day', type: 'error' });
      return;
    }

    if (formStartHour >= formEndHour) {
      showToast({ text: 'Start time must be before end time', type: 'error' });
      return;
    }

    setIsSubmitting(true);

    const newLink: BookingLinkItem = {
      id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      slug: finalSlug,
      title: formTitle.trim(),
      description: formDescription.trim(),
      duration: formDuration,
      startHour: formStartHour,
      endHour: formEndHour,
      availableDays: formAvailableDays,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Try posting to backend API if available
    try {
      await fetch('/api/booking/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLink.title,
          slug: newLink.slug,
          description: newLink.description,
          duration: newLink.duration,
          startHour: newLink.startHour,
          endHour: newLink.endHour,
          availableDays: newLink.availableDays,
        }),
      }).catch(() => {
        // Fallback gracefully to client state
      });
    } catch {
      // Local state is preserved
    }

    setLinks((prev) => [newLink, ...prev]);
    setIsSubmitting(false);
    showToast({ text: 'Booking link created successfully!', type: 'success' });

    // Reset form
    setFormTitle('');
    setFormSlug('');
    setFormDescription('');
    setFormDuration(30);
    setFormStartHour(9);
    setFormEndHour(17);
    setFormAvailableDays([1, 2, 3, 4, 5]);
    setSlugManuallyEdited(false);
    setActiveTab('list');
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:00 ${period}`;
  };

  const getDayNamesSummary = (days: number[]) => {
    if (days.length === 7) return 'Every day';
    if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Mon – Fri';
    if (days.length === 2 && [0, 6].every((d) => days.includes(d))) return 'Weekends (Sat, Sun)';
    const dayMap: Record<number, string> = {
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
      0: 'Sun',
    };
    return days.map((d) => dayMap[d]).join(', ');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Surface */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="booking-links-modal-title"
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[#121316] border border-[#282C35] shadow-2xl overflow-hidden z-10 text-[#F5F5F5] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#282C35]/80 bg-[#0c0c0f]">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#FF8C42]/10 border border-[#FF8C42]/20 flex items-center justify-center text-[#FF8C42] text-lg font-bold">
              🔗
            </div>
            <div>
              <h2
                id="booking-links-modal-title"
                className="text-base font-bold tracking-tight text-white flex items-center gap-2"
              >
                Booking Links
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FF8C42]/20 text-[#FF8C42] border border-[#FF8C42]/30">
                  Calendly Parity
                </span>
              </h2>
              <p className="text-xs text-[#A1A4AC]">
                Share public booking links with clients and colleagues to schedule meetings
                effortlessly.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="size-8 grid place-items-center rounded-lg text-[#A1A4AC] hover:text-white hover:bg-[#282C35] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            ✕
          </button>
        </div>

        {/* Tab Toggle Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-[#282C35]/60 bg-[#16181D]/50">
          <div className="flex items-center rounded-lg border border-[#282C35] bg-[#0c0c0f] p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'list'
                  ? 'bg-[#FF8C42] text-[#090A0C] shadow-sm'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
            >
              Active Links ({links.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'create'
                  ? 'bg-[#FF8C42] text-[#090A0C] shadow-sm'
                  : 'text-[#A1A4AC] hover:text-white'
              }`}
            >
              + Create New Link
            </button>
          </div>

          {activeTab === 'list' && (
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#090A0C] transition-colors shadow-sm"
            >
              + New Link
            </button>
          )}
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'list' ? (
            links.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3">
                <div className="text-4xl">📅</div>
                <h3 className="text-sm font-semibold text-white">No booking links created yet</h3>
                <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto">
                  Create your first shareable link to let others book slots directly on your
                  calendar.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#090A0C] shadow-md transition-all"
                >
                  Create Your First Link
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {links.map((link) => {
                  const isCopied = copiedSlug === link.slug;
                  return (
                    <div
                      key={link.id}
                      className="group p-4 rounded-xl border border-[#282C35] bg-[#16181D] hover:border-[#3A404D] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-white truncate">
                            {link.title}
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[#FF8C42]/15 text-[#FF8C42] border border-[#FF8C42]/25">
                            {link.duration} min
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#1F2430] text-[#7EE787] border border-[#7EE787]/20">
                            Active
                          </span>
                        </div>

                        {link.description && (
                          <p className="text-xs text-[#A1A4AC] line-clamp-1">{link.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-[#8B949E] pt-1">
                          <span className="flex items-center gap-1">
                            🕒 {formatHour(link.startHour)} – {formatHour(link.endHour)}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            📅 {getDayNamesSummary(link.availableDays)}
                          </span>
                        </div>

                        <div className="pt-1 flex items-center gap-1.5 text-xs text-[#58A6FF] font-mono select-all">
                          <span className="truncate">/calendar/booking/{link.slug}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(link.slug)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                            isCopied
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-[#21262D] hover:bg-[#30363D] text-[#F0F6FC] border-[#30363D]'
                          }`}
                          title="Copy direct booking link to clipboard"
                        >
                          {isCopied ? '✓ Copied!' : '📋 Copy Link'}
                        </button>

                        <a
                          href={`/calendar/booking/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1F2430] hover:bg-[#282E3E] text-[#58A6FF] border border-[#58A6FF]/30 transition-all flex items-center gap-1"
                          title="Preview public booking page"
                        >
                          ↗ View Page
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Create New Link Sub-Form */
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Title & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#A1A4AC] font-semibold mb-1">
                    Meeting Title <span className="text-[#FF8C42]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={handleTitleChange}
                    placeholder="e.g. 30 Min Strategy Session"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#0c0c0f] border border-[#282C35] text-white placeholder-[#5E6472] focus:outline-none focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42] text-xs transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[#A1A4AC] font-semibold mb-1">
                    URL Slug <span className="text-[#FF8C42]">*</span>
                  </label>
                  <div className="flex items-center rounded-xl bg-[#0c0c0f] border border-[#282C35] focus-within:border-[#FF8C42] focus-within:ring-1 focus-within:ring-[#FF8C42] overflow-hidden text-xs">
                    <span className="pl-3 text-[#5E6472] select-none text-[11px]">/booking/</span>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={handleSlugChange}
                      placeholder="strategy-session"
                      required
                      className="w-full pr-3 py-2 bg-transparent border-0 text-white placeholder-[#5E6472] focus:outline-none text-xs font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[#A1A4AC] font-semibold mb-1">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Share a brief overview of what this meeting is about, what attendees should prepare, etc."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-[#0c0c0f] border border-[#282C35] text-white placeholder-[#5E6472] focus:outline-none focus:border-[#FF8C42] focus:ring-1 focus:ring-[#FF8C42] text-xs transition-colors"
                />
              </div>

              {/* Duration Presets */}
              <div>
                <label className="block text-[#A1A4AC] font-semibold mb-1.5">
                  Meeting Duration
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {DURATION_PRESETS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      onClick={() => setFormDuration(dur)}
                      className={`py-2 px-3 rounded-xl border text-center font-semibold transition-all ${
                        formDuration === dur
                          ? 'bg-[#FF8C42] text-[#090A0C] border-[#FF8C42] shadow-sm'
                          : 'bg-[#16181D] text-[#A1A4AC] border-[#282C35] hover:text-white hover:border-[#3A404D]'
                      }`}
                    >
                      {dur} min
                    </button>
                  ))}
                </div>
              </div>

              {/* Hours of Availability */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#A1A4AC] font-semibold mb-1">Start Time</label>
                  <select
                    value={formStartHour}
                    onChange={(e) => setFormStartHour(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0c0c0f] border border-[#282C35] text-white focus:outline-none focus:border-[#FF8C42] text-xs cursor-pointer"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#A1A4AC] font-semibold mb-1">End Time</label>
                  <select
                    value={formEndHour}
                    onChange={(e) => setFormEndHour(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-[#0c0c0f] border border-[#282C35] text-white focus:outline-none focus:border-[#FF8C42] text-xs cursor-pointer"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {formatHour(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Available Days Checkboxes */}
              <div>
                <label className="block text-[#A1A4AC] font-semibold mb-1.5">
                  Available Days of the Week
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {WEEKDAY_NAMES.map(({ day, label }) => {
                    const isSelected = formAvailableDays.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => toggleDay(day)}
                        className={`py-2 rounded-xl text-center text-xs font-bold transition-all border ${
                          isSelected
                            ? 'bg-[#FF8C42] text-[#090A0C] border-[#FF8C42] shadow-sm'
                            : 'bg-[#16181D] text-[#8B949E] border-[#282C35] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#282C35]/80">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 rounded-xl border border-[#282C35] bg-[#16181D] hover:bg-[#20232A] text-[#A1A4AC] hover:text-white font-semibold transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[#FF8C42] hover:bg-[#FF9B5A] text-[#090A0C] font-bold shadow-md transition-all disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating Link…' : 'Create Booking Link'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-[#282C35]/80 bg-[#0c0c0f] flex items-center justify-between text-xs text-[#A1A4AC]">
          <span className="flex items-center gap-1.5">
            Host: <span className="font-semibold text-white">{userEmail}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[#A1A4AC] hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
