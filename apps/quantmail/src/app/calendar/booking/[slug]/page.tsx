'use client';

// ============================================================================
// QuantCalendar — Calendly-Class Sovereign Public Booking Engine
// Tasks W39-CAL01 & W39-CAL02
// Completely public page: NO auth gate, unauthenticated guests can book!
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TIMEZONES } from '../../types';
import { generateGoogleCalendarUrl, generateIcsContent, applyBookingLinkResponse, resolveBookingFailureMessage, resolveLinkLoadFailure, resolvePostSubmitDeadLink, resolveSlotsResponse, resolveSlotsLoadFailure, slotsWithinGuestDay, guestDayKeyToYmd, compareGuestDayKeys, todayInTimeZone, weekdayInTimeZone, isGuestDayEnabled, formatGuestDayHeader, formatGuestDayShort, defaultSelectedGuestDay, daysIn1BasedMonth, formatSlotTimeLabelInTz, shouldResetSelectionOnTimezoneChange } from './booking-utils';
import type { BookingLinkDetails, BookingLinkLoadStatus, BookingSlotItem, GuestDayKey } from './booking-utils';
import {
  IconClock,
  IconVideoCall,
  IconCalendar,
  IconGlobe,
  IconUsers,
  IconMail,
  IconDownload,
  IconBan,
  IconCheck,
} from '../../../../components/icons';
import { apiFetchRaw } from '@quant/api-client';
import { BookingLinkDeadPanel, shouldUseHistoryBack } from './dead-link-panel';

// BookingSlotItem lives in ./booking-utils (Next.js rejects non-page value
// exports from page.tsx; the interface is type-only and shared with tests).

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

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface PageProps {
  params?: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default function PublicBookingPage(props: PageProps) {
  // Unwrap Next.js 15 params. Starts EMPTY (not a guessed slug): fetching is
  // skipped until the real slug resolves, so we never request — or briefly
  // error on — a bogus default slug (fix/qm-booking-deadlink-details).
  const [resolvedSlug, setResolvedSlug] = useState<string>('');

  useEffect(() => {
    if (!props?.params) return;
    Promise.resolve(props.params as any).then((p: any) => {
      if (p?.slug) setResolvedSlug(p.slug);
    });
  }, [props?.params]);

  // Host & Meeting Information.
  // NOTE: host identity is deliberately NOT seeded here. The real host name
  // and email come from the backend booking-link record; until that fetch
  // resolves the UI shows an honest "unknown host" — never a hardcoded name.
  const [meetingDetails, setMeetingDetails] = useState<BookingLinkDetails>({
    slug: resolvedSlug,
    title: '30 Min Strategy Session',
    description:
      'One-on-one session to discuss architectural vision, product requirements, and strategic roadmap.',
    duration: 30,
    startHour: 9,
    endHour: 17,
    availableDays: [1, 2, 3, 4, 5],
    // Seeded placeholder shown while the link record loads (same family as
    // the seeded title/description/host above); the real host timezone
    // arrives from the backend record via applyBookingLinkResponse
    // (fix/qm-booking-tz-availability-2).
    timezone: 'UTC',
    hostName: '',
    hostEmail: '',
  });

  // Honest link-load state (fix/qm-booking-deadlink-details).
  // 'loading'  — fetch in flight; seeded layout is shown as a placeholder.
  // 'ready'    — backend returned a real, active booking-link record.
  // 'not-found'/'inactive'/'error' — dead or unreachable link: the booking
  // UI is replaced by an honest state BEFORE any slot selection, never the
  // seeded details as if they were real.
  const [linkStatus, setLinkStatus] = useState<'loading' | 'ready' | BookingLinkLoadStatus>(
    'loading',
  );
  const [linkErrorMessage, setLinkErrorMessage] = useState<string | null>(null);
  // Bumped by the "Try again" button to re-run the link fetch below.
  const [linkReloadNonce, setLinkReloadNonce] = useState(0);

  // Re-run the link fetch for the 'error'/'inactive' dead-link panel.
  const handleReloadLink = useCallback(() => {
    setLinkStatus('loading');
    setLinkErrorMessage(null);
    setLinkReloadNonce((n) => n + 1);
  }, []);

  // 'not-found' panel action: return to where the guest came from, or the
  // QuantMail home when this tab has no history (so it never silently does
  // nothing). Plain window.history avoids pulling in the app router.
  const handleGoBack = useCallback(() => {
    if (typeof window !== 'undefined' && shouldUseHistoryBack(window.history.length)) {
      window.history.back();
    } else {
      window.location.assign('/');
    }
  }, []);

  // Flow State: Step 1 (Date & Slot) -> Step 2 (Visitor Form) -> Step 3 (Confirmation)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Timezone selector
  const [selectedTimezone, setSelectedTimezone] = useState<string>('Asia/Kolkata');

  // Calendar Date State — timezone-free guest-day keys in the SELECTED
  // timezone (fix/qm-booking-journey-v2). The old code carried browser-local
  // `Date`s (midnight in the browser's zone); for a guest whose browser
  // zone differs from the selected zone that silently re-derived the wrong
  // YYYY-MM-DD (off-by-one) and enabled tiles with the browser-local
  // weekday. No Date is constructed for day math anymore.
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const today = todayInTimeZone('Asia/Kolkata');
    return { year: today.year, month: today.month };
  });

  // Default to tomorrow in the guest zone, skipping days the host cannot serve.
  const [selectedDate, setSelectedDate] = useState<GuestDayKey>(() =>
    defaultSelectedGuestDay('Asia/Kolkata'),
  );

  // Slot Selection
  const [availableSlots, setAvailableSlots] = useState<BookingSlotItem[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<BookingSlotItem | null>(null);
  // Honest failure state (fix/qm-booking-slots-fallback): when the slots
  // endpoint fails, no availability is invented — this carries the copy for
  // the error panel instead.
  const [slotsError, setSlotsError] = useState<string | null>(null);
  // Bumped by the slots error panel's "Try again" button to re-run the fetch.
  const [slotsReloadNonce, setSlotsReloadNonce] = useState(0);

  // Form State (Step 2)
  const [bookerName, setBookerName] = useState('');
  const [bookerEmail, setBookerEmail] = useState('');
  const [bookerNotes, setBookerNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirmed details (Step 3)
  const [confirmedBooking, setConfirmedBooking] = useState<{
    title: string;
    startTime: Date;
    endTime: Date;
    hostName: string;
    hostEmail: string;
    bookerName: string;
    bookerEmail: string;
    bookerNotes?: string;
    icsData?: string;
  } | null>(null);

  // Fetch Booking Link details
  useEffect(() => {
    if (!resolvedSlug) return;

    let isMounted = true;

    const readServerMessage = async (res: Response): Promise<string | undefined> => {
      try {
        const errJson = await res.json();
        const err = errJson?.error;
        return (
          (typeof err === 'object' && err ? err.message : undefined) ||
          (typeof err === 'string' ? err : undefined) ||
          (typeof errJson?.message === 'string' ? errJson.message : undefined)
        );
      } catch {
        // Error body unreadable — fall through to the status-mapped copy.
        return undefined;
      }
    };

    async function fetchLink() {
      try {
        const res = await apiFetchRaw(`/api/calendar/booking/${resolvedSlug}`);
        if (!res.ok) {
          // Dead link or server trouble: never keep the seeded meeting
          // details on screen as if they were real.
          if (isMounted) {
            const { status, message } = resolveLinkLoadFailure(
              res.status,
              await readServerMessage(res),
            );
            setLinkStatus(status);
            setLinkErrorMessage(message);
          }
          return;
        }
        const json = await res.json();
        if (json.success && json.data) {
          // The public GET returns the record even when the host paused it
          // (no 410 on GET) — an inactive link is a dead link: show the
          // honest inactive state, never the booking UI.
          if (json.data.isActive === false) {
            if (isMounted) {
              const { status, message } = resolveLinkLoadFailure(410);
              setLinkStatus(status);
              setLinkErrorMessage(message);
            }
            return;
          }
          if (isMounted) {
            setMeetingDetails((prev) => applyBookingLinkResponse(prev, json.data));
            setLinkStatus('ready');
          }
          return;
        }
        // 2xx but unusable payload — honest error, never the seeded fake.
        if (isMounted) {
          const { status, message } = resolveLinkLoadFailure(res.status);
          setLinkStatus(status);
          setLinkErrorMessage(message);
        }
      } catch {
        // Network failure: never invent meeting details from the slug.
        if (isMounted) {
          const { status, message } = resolveLinkLoadFailure(0);
          setLinkStatus(status);
          setLinkErrorMessage(message);
        }
      }
    }

    fetchLink();
    return () => {
      isMounted = false;
    };
  }, [resolvedSlug, linkReloadNonce]);

  // REMOVED (fix/qm-booking-slots-fallback): the client-side slot generator
  // (generateSlotsForDate) is gone. On a slots-endpoint failure it marked
  // every future 30-min window as "available" purely by time-of-day — with
  // no host-calendar or conflict data — letting bookers pick slots that do
  // not exist. The only honest responses to a failure are the error panel
  // below or server-sourced slots. Nothing may replace this generator.

  // Fetch slots whenever selectedDate, meetingDetails, or the guest's timezone change
  useEffect(() => {
    let isMounted = true;

    // Never fetch or invent slots for a dead/unreachable link — the honest
    // link state above replaces the booking UI entirely.
    if (linkStatus !== 'ready') {
      setIsLoadingSlots(false);
      setAvailableSlots([]);
      setSlotsError(null);
      return () => {
        isMounted = false;
      };
    }

    setIsLoadingSlots(true);
    setSlotsError(null);

    async function loadSlots() {
      // The request names the GUEST's calendar day in the SELECTED timezone
      // (fix/qm-booking-guest-day) — the key serializes to YYYY-MM-DD
      // directly; no browser-local Date is reinterpreted
      // (fix/qm-booking-journey-v2).
      const dateStr = guestDayKeyToYmd(selectedDate);
      const tzParam = encodeURIComponent(selectedTimezone);
      // Status 0 = the fetch itself threw (no HTTP response).
      let httpStatus = 0;
      try {
        const res = await apiFetchRaw(
          `/api/calendar/booking/${resolvedSlug}/slots?date=${dateStr}&tz=${tzParam}`,
        );
        httpStatus = res.status;
        if (res.ok) {
          const json = await res.json();
          const slots = resolveSlotsResponse(json, selectedTimezone);
          if (slots !== null && isMounted) {
            // The backend answer is authoritative — even when it is an empty
            // array (fully booked date / link inactive for this date). Render
            // the honest "no slots" state; NEVER fall through to a
            // client-side generator, which would invent bookable slots the
            // backend rejects at submit with 409 SLOT_UNAVAILABLE.
            // Re-apply the guest-day rule client-side as a stale-backend
            // guard: labels must always land on the selected guest date.
            setAvailableSlots(slotsWithinGuestDay(slots, dateStr, selectedTimezone));
            setSlotsError(null);
            setIsLoadingSlots(false);
            return;
          }
        } else if ((res.status === 404 || res.status === 410) && isMounted) {
          // The link died between the initial link load and this slots
          // fetch (deleted/paused mid-session): flip to the honest dead-link
          // state instead of rendering — or inventing — slots for it.
          const { status, message } = resolveLinkLoadFailure(res.status);
          setLinkStatus(status);
          setLinkErrorMessage(message);
          setAvailableSlots([]);
          setSlotsError(null);
          setIsLoadingSlots(false);
          return;
        }
      } catch {
        // Network failure — httpStatus stays 0 so the error copy below is
        // the connection variant.
      }

      // Failure path (fix/qm-booking-slots-fallback): the slots endpoint
      // failed (non-ok status, non-authoritative payload, or network throw).
      // Availability must NOT be invented — the client has no host-calendar
      // or conflict data, so generated slots could be bookable fictions.
      // Show the honest error panel with a retry action instead.
      if (isMounted) {
        setAvailableSlots([]);
        setSlotsError(resolveSlotsLoadFailure(httpStatus));
        setIsLoadingSlots(false);
      }
    }

    loadSlots();
    return () => {
      isMounted = false;
    };
  }, [selectedDate, resolvedSlug, meetingDetails, linkStatus, selectedTimezone, slotsReloadNonce]);

  // Handle Month Navigation
  const handlePrevMonth = () => {
    setCalendarMonth((curr) =>
      curr.month === 1 ? { year: curr.year - 1, month: 12 } : { year: curr.year, month: curr.month - 1 },
    );
  };

  const handleNextMonth = () => {
    setCalendarMonth((curr) =>
      curr.month === 12 ? { year: curr.year + 1, month: 1 } : { year: curr.year, month: curr.month + 1 },
    );
  };

  // Calendar Grid Days Calculation — pure calendar math on guest-day keys
  // in the SELECTED timezone (fix/qm-booking-journey-v2). The old grid
  // built browser-local Dates and enabled tiles with the browser-local
  // weekday; both are zone-free now: grid alignment uses the selected
  // zone's weekday, month length is UTC math, and tile enablement is
  // slot-authoritative via isGuestDayEnabled (host-zone weekday of the
  // host date(s) intersecting each guest day).
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const hostTz = meetingDetails.timezone || 'UTC';

    const firstDayIndex = weekdayInTimeZone({ year, month, day: 1 }, selectedTimezone);
    // GuestDayKey.month is 1-based — daysIn1BasedMonth wraps the
    // Date.UTC(year, month, 0) last-day-of-month idiom (regression: the
    // previous month+1 read the NEXT month's length, so Jan showed 28 days
    // and Feb offered invalid day keys 29–31).
    const daysInMonth = daysIn1BasedMonth(year, month);

    const days: Array<{
      key: GuestDayKey;
      isCurrentMonth: boolean;
      isAvailable: boolean;
      isPast: boolean;
    }> = [];

    const todayKey = todayInTimeZone(selectedTimezone);

    // Padding for days before the 1st (previous month's tail)
    const prevMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    const daysInPrevMonth = daysIn1BasedMonth(prevMonth.year, prevMonth.month);
    for (let i = 0; i < firstDayIndex; i++) {
      days.push({
        key: { year: prevMonth.year, month: prevMonth.month, day: daysInPrevMonth - firstDayIndex + i + 1 },
        isCurrentMonth: false,
        isAvailable: false,
        isPast: true,
      });
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const key: GuestDayKey = { year, month, day };
      const isPast = compareGuestDayKeys(key, todayKey) < 0;
      const isAvailable =
        !isPast && isGuestDayEnabled(key, selectedTimezone, hostTz, meetingDetails.availableDays);

      days.push({
        key,
        isCurrentMonth: true,
        isAvailable,
        isPast,
      });
    }

    return days;
  }, [calendarMonth, meetingDetails.availableDays, meetingDetails.timezone, selectedTimezone]);

  // Click slot -> Step 2
  const handleSelectSlot = (slot: BookingSlotItem) => {
    if (!slot.available) return;
    setSelectedSlot(slot);
    setCurrentStep(2);
  };

  // Timezone change (fix/qm-calendar-booking-tz-day): the new zone
  // reinterprets the picked day, so a slot chosen under the old zone must
  // not survive into steps 1–2 — confirming it would book an instant that
  // can land on a different guest day at the zone edges. Drop the
  // selection and return to date/slot picking; step 3 (booking complete)
  // keeps its absolute instants and only relabels. Form input is kept.
  const handleTimezoneChange = (tz: string) => {
    setSelectedTimezone(tz);
    if (shouldResetSelectionOnTimezoneChange(currentStep)) {
      setSelectedSlot(null);
      setCurrentStep(1);
    }
  };

  // Handle Booking Form Submission
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookerName.trim()) {
      setSubmitError('Please enter your full name');
      return;
    }
    if (!bookerEmail.trim() || !bookerEmail.includes('@')) {
      setSubmitError('Please enter a valid email address');
      return;
    }
    if (!selectedSlot) {
      setSubmitError('Please select a booking slot');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const bookingPayload = {
      slot: selectedSlot.start.toISOString(),
      name: bookerName.trim(),
      email: bookerEmail.trim(),
      notes: bookerNotes.trim(),
    };

    let icsResult: string | undefined;
    // Real host identity, when the booking endpoint returns it. Otherwise
    // derived from the fetched booking-link record (honest unknown if absent).
    let serverHostName: string | undefined;
    let serverHostEmail: string | undefined;

    // A failed booking must NEVER advance to the confirmation step:
    // setConfirmedBooking + setCurrentStep(3) run ONLY after a 2xx response.
    const failBooking = (message: string) => {
      setSubmitError(message);
      setIsSubmitting(false);
    };

    try {
      const res = await apiFetchRaw(`/api/calendar/booking/${resolvedSlug}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingPayload),
      });

      if (!res.ok) {
        // Honest failure: 409 slot-taken, 410 inactive link, 404 unknown slug,
        // 400 invalid payload, 429 rate-limited, 5xx server problem.
        // Never render "Booking Confirmed!" on a failure — stay on step 2
        // with the real reason.
        let serverMessage: string | undefined;
        try {
          const errJson = await res.json();
          const err = errJson?.error;
          serverMessage =
            (typeof err === 'object' && err ? err.message : undefined) ||
            (typeof err === 'string' ? err : undefined) ||
            (typeof errJson?.message === 'string' ? errJson.message : undefined);
        } catch {
          // Error body unreadable — fall through to the status-mapped copy.
        }
        // fix/qm-booking-postsubmit-deadlink: the link died between the
        // initial link load and the booking POST (deleted/paused mid-step-2).
        // This is the SAME surface as a dead link found pre-selection —
        // flip to the honest dead-link panel (not-found / inactive) instead
        // of keeping the booking form on screen with an inline error. Every
        // other failure keeps the inline form error via failBooking.
        const postSubmitDeadLink = resolvePostSubmitDeadLink(res.status, serverMessage);
        if (postSubmitDeadLink) {
          setLinkStatus(postSubmitDeadLink.status);
          setLinkErrorMessage(postSubmitDeadLink.message);
          setIsSubmitting(false);
          return;
        }
        failBooking(resolveBookingFailureMessage(res.status, serverMessage));
        return;
      }

      const json = await res.json();
      // The backend returns { event, icsContent, hostName, hostEmail } —
      // icsContent is generated server-side with the REAL organizer and
      // must be preferred over any client-side fallback.
      const data = json?.data;
      if (data?.icsContent) {
        icsResult = data.icsContent;
      } else if (data?.icsData) {
        // Legacy tolerance for older backends.
        icsResult = data.icsData;
      }
      if (data?.hostName) serverHostName = data.hostName;
      if (data?.hostEmail) serverHostEmail = data.hostEmail;
    } catch {
      // Network failure: the booking POST may never have reached the server.
      // Honest error and stay on step 2 — NEVER show a confirmation for a
      // booking that was not created.
      failBooking(resolveBookingFailureMessage(0));
      return;
    }

    const hostName = serverHostName || meetingDetails.hostName || '';
    const hostEmail = serverHostEmail || meetingDetails.hostEmail || '';

    // Generate RFC 5545 ICS client-side fallback if not returned by server.
    // With an unknown host the ORGANIZER line is omitted rather than faked.
    const finalIcs =
      icsResult ||
      generateIcsContent({
        title: meetingDetails.title,
        description: bookerNotes || meetingDetails.description,
        startTime: selectedSlot.start,
        endTime: selectedSlot.end,
        hostName,
        hostEmail,
        attendeeName: bookerName.trim(),
        attendeeEmail: bookerEmail.trim(),
      });

    setConfirmedBooking({
      title: meetingDetails.title,
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      hostName,
      hostEmail,
      bookerName: bookerName.trim(),
      bookerEmail: bookerEmail.trim(),
      bookerNotes: bookerNotes.trim(),
      icsData: finalIcs,
    });

    setIsSubmitting(false);
    setCurrentStep(3);
  };

  // Trigger .ics Download
  const handleDownloadIcs = () => {
    if (!confirmedBooking) return;
    const icsString =
      confirmedBooking.icsData ||
      generateIcsContent({
        title: confirmedBooking.title,
        description: confirmedBooking.bookerNotes,
        startTime: confirmedBooking.startTime,
        endTime: confirmedBooking.endTime,
        hostName: confirmedBooking.hostName,
        hostEmail: confirmedBooking.hostEmail,
        attendeeName: confirmedBooking.bookerName,
        attendeeEmail: confirmedBooking.bookerEmail,
      });

    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `invite-${resolvedSlug}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Reset to book another
  const handleBookAnother = () => {
    setCurrentStep(1);
    setSelectedSlot(null);
    setConfirmedBooking(null);
    setBookerName('');
    setBookerEmail('');
    setBookerNotes('');
    setSubmitError(null);
  };

  // Format Date for Summary Header (in the guest's selected timezone)
  const formattedSelectedDate = useMemo(() => {
    return formatGuestDayHeader(selectedDate);
  }, [selectedDate]);

  return (
    <div className="min-h-screen bg-[var(--quant-background)] text-[var(--quant-foreground)] font-sans flex flex-col justify-between selection:bg-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] selection:text-white">
      {/* Top Brand Bar */}
      <header className="bg-black/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-xl bg-gradient-to-tr from-[var(--app-accent)] to-[color-mix(in_srgb,var(--app-accent),white_30%)] flex items-center justify-center text-[var(--quant-background)] font-black text-sm shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)]">
            Q
          </div>
          <div>
            <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
              QuantCalendar
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-px rounded bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_25%,transparent)]">
                Sovereign Booking
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Calendly-Class 2-Column Container */}
      {/* Honest dead-link states (fix/qm-booking-deadlink-details): a link
          that 404s, 410s, or fails to load replaces the booking UI with an
          honest state BEFORE any slot selection — never seeded details as
          if they were real. While loading, the seeded layout is a placeholder. */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 md:p-10">
        {linkStatus === 'ready' || linkStatus === 'loading' ? (
        <div className="w-full max-w-5xl rounded-3xl bg-[var(--quant-surface-subtle)] border border-[var(--quant-surface-elevated)] shadow-2xl shadow-black/80 overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[580px]">
          {/* ================================================================= */}
          {/* LEFT COLUMN: Host Information, Brand, Timezone & Meeting Info     */}
          {/* ================================================================= */}
          <section className="md:col-span-5 p-6 sm:p-8 bg-black/70 flex flex-col justify-between space-y-6">
            <div className="space-y-5">
              {/* Host Brand Mark / Avatar */}
              <div className="flex items-center gap-3.5">
                <div className="size-14 rounded-2xl bg-gradient-to-tr from-[#1E222B] to-[#2B303C] border-2 border-[color-mix(in_srgb,var(--app-accent)_60%,transparent)] p-0.5 flex items-center justify-center shadow-lg shadow-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] relative group">
                  <div className="size-full rounded-[14px] bg-[var(--quant-surface-elevated)] flex items-center justify-center text-lg font-black text-[var(--app-accent)]">
                    {(meetingDetails.hostName || '?').charAt(0)}
                  </div>
                  <span className="absolute -bottom-1 -right-1 size-3.5 rounded-full bg-emerald-500 border-2 border-[var(--quant-surface-subtle)]" />
                </div>

                <div>
                  <h3 className="font-semibold text-xs uppercase tracking-wider text-[var(--quant-muted-foreground)]">
                    Host
                  </h3>
                  <h2 className="font-bold text-base text-white">
                    {meetingDetails.hostName || 'Unknown host'}
                  </h2>
                  {meetingDetails.hostEmail && (
                    <p className="text-xs text-[#717684] truncate">{meetingDetails.hostEmail}</p>
                  )}
                </div>
              </div>

              {/* Meeting Title & Description */}
              <div className="space-y-2 pt-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  {meetingDetails.title}
                </h1>
                <p className="text-xs text-[var(--quant-muted-foreground)] leading-relaxed">
                  {meetingDetails.description}
                </p>
              </div>

              {/* Meeting Metadata Pills */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--quant-foreground)]">
                  <span className="size-6 rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] flex items-center justify-center text-[11px]">
                    <IconClock size={12} />
                  </span>
                  <span>{meetingDetails.duration} min duration</span>
                </div>

                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--quant-foreground)]">
                  <span className="size-6 rounded-lg bg-[#58A6FF]/15 text-[#58A6FF] border border-[#58A6FF]/20 flex items-center justify-center text-[11px]">
                    <IconVideoCall size={12} />
                  </span>
                  <span>QuantMeet Video Call</span>
                </div>

                {/* Slot Summary in Step 2 or 3 */}
                {selectedSlot && (
                  <div className="p-3 rounded-xl bg-[var(--quant-surface-elevated)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] space-y-1 mt-3 animate-in fade-in duration-200">
                    <div className="text-[11px] font-bold text-[var(--app-accent)] uppercase tracking-wider">
                      Selected Slot
                    </div>
                    <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                      <IconCalendar size={13} className="text-[var(--app-accent)]" />
                      <span>{formattedSelectedDate}</span>
                    </div>
                    <div className="text-xs text-[var(--quant-muted-foreground)] flex items-center gap-1.5">
                      <IconClock size={13} />
                      <span>{formatSlotTimeLabelInTz(selectedSlot.start, selectedTimezone)} ({meetingDetails.duration}m)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Left Column Bottom: Timezone Selector & Footer Note */}
            <div className="space-y-4 pt-6">
              <div>
                <label htmlFor="booking-timezone" className="block text-[11px] font-semibold text-[var(--quant-muted-foreground)] mb-1.5">
                  Your Timezone
                </label>
                <div className="relative">
                  <select
                    id="booking-timezone"
                    value={selectedTimezone}
                    onChange={(e) => handleTimezoneChange(e.target.value)}
                    className="w-full appearance-none rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] pl-8 pr-8 py-2 text-xs text-white focus:outline-none focus:border-[var(--app-accent)] cursor-pointer"
                  >
                    {TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value} className="bg-[var(--quant-surface-subtle)] text-white">
                        {tz.label}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--quant-muted-foreground)] flex items-center">
                    <IconGlobe size={13} />
                  </span>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--q-type-xs)] text-[var(--quant-muted-foreground)]">
                    ▼
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-[#5E6472] flex items-center gap-1.5">
                <span>Powered by</span>
                <span className="text-[var(--quant-muted-foreground)] font-semibold">Quant Ecosystem</span>
              </div>
            </div>
          </section>

          {/* ================================================================= */}
          {/* RIGHT COLUMN: Interactive Step 1, Step 2, or Step 3               */}
          {/* ================================================================= */}
          <section className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between bg-[var(--quant-surface-subtle)]">
            {/* STEP 1: Date & Time Picker */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white tracking-tight">
                    Select a Date & Time
                  </h2>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Choose an available date on the calendar, then select a meeting time.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-6">
                  {/* Mini Month Calendar Grid */}
                  <div className="sm:col-span-7 space-y-3">
                    {/* Month Stepper Header */}
                    <div className="flex items-center justify-between pb-2">
                      <h3 className="font-bold text-sm text-white flex items-center gap-1.5">
                        <span>{MONTH_NAMES[calendarMonth.month - 1]}</span>
                        <span className="text-[var(--quant-muted-foreground)] font-normal">
                          {calendarMonth.year}
                        </span>
                      </h3>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handlePrevMonth}
                          aria-label="Previous month"
                          className="size-7 grid place-items-center rounded-lg border border-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[#20232B] transition-colors"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={handleNextMonth}
                          aria-label="Next month"
                          className="size-7 grid place-items-center rounded-lg border border-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[#20232B] transition-colors"
                        >
                          ›
                        </button>
                      </div>
                    </div>

                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {WEEKDAY_HEADERS.map((w) => (
                        <span key={w} className="text-[11px] font-semibold text-[#717684]">
                          {w}
                        </span>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {calendarDays.map((item, idx) => {
                        const isSelected = compareGuestDayKeys(item.key, selectedDate) === 0;
                        const isCurrentMonth = item.isCurrentMonth;
                        const isAvailable = item.isAvailable;

                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={!isAvailable}
                            onClick={() => {
                              // A new picked day invalidates any slot chosen
                              // for the previous day (fix/qm-calendar-booking-tz-day):
                              // after Back-from-step-2 the old selection would
                              // otherwise linger under the new day's header.
                              setSelectedDate(item.key);
                              setSelectedSlot(null);
                            }}
                            className={`size-9 rounded-xl text-xs font-semibold flex items-center justify-center transition-all ${
                              isSelected
                                ? 'bg-[var(--app-accent)] text-[var(--quant-background)] font-black shadow-md shadow-[color-mix(in_srgb,var(--app-accent)_30%,transparent)] scale-105'
                                : isAvailable
                                  ? 'bg-[var(--quant-surface-elevated)] hover:bg-[var(--quant-surface-elevated)] text-white cursor-pointer border border-[var(--quant-surface-elevated)]'
                                  : isCurrentMonth
                                    ? 'text-[#3E424E] cursor-not-allowed'
                                    : 'text-transparent cursor-not-allowed pointer-events-none'
                            }`}
                          >
                            {isCurrentMonth ? item.key.day : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Available Time Slots List */}
                  <div className="sm:col-span-5 space-y-3 sm:border-l sm:border-[var(--quant-surface-elevated)]/60 sm:pl-6">
                    <div className="text-xs font-bold text-white flex items-center justify-between pb-1">
                      <span>Available Slots</span>
                      <span className="text-[10px] text-[var(--quant-muted-foreground)] font-normal truncate">
                        {formatGuestDayShort(selectedDate)}
                      </span>
                    </div>

                    {isLoadingSlots ? (
                      <div className="py-12 text-center text-xs text-[var(--quant-muted-foreground)] flex items-center justify-center gap-2">
                        <span className="inline-block size-3 rounded-full border-2 border-white/30 border-t-[var(--app-accent)] animate-spin" />
                        <span>Loading slots…</span>
                      </div>
                    ) : slotsError ? (
                      <div className="py-10 text-center text-xs text-[#8B949E] space-y-3">
                        <div className="flex justify-center"><IconBan size={22} className="text-[#8B949E]" /></div>
                        <p className="leading-relaxed">{slotsError}</p>
                        <button
                          type="button"
                          onClick={() => setSlotsReloadNonce((n) => n + 1)}
                          className="px-5 py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] font-bold text-xs shadow-lg shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] transition-all"
                        >
                          Try again
                        </button>
                      </div>
                    ) : availableSlots.filter((s) => s.available).length === 0 ? (
                      <div className="py-10 text-center text-xs text-[#8B949E] space-y-2">
                        <div className="flex justify-center"><IconBan size={22} className="text-[#8B949E]" /></div>
                        <p>No available slots on this date.</p>
                        <p className="text-[10px] text-[#58A6FF]">Please select another date.</p>
                      </div>
                    ) : (
                      <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {availableSlots
                          .filter((slot) => slot.available)
                          .map((slot, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleSelectSlot(slot)}
                              className="w-full py-2.5 px-3 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] hover:bg-[var(--app-accent)] hover:text-[var(--quant-background)] hover:border-[var(--app-accent)] text-xs font-bold text-white transition-all text-center group flex items-center justify-between shadow-sm"
                            >
                              <span>{slot.timeLabel}</span>
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] font-bold">
                                Select →
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Visitor Information Form */}
            {currentStep === 2 && (
              <form
                onSubmit={handleConfirmBooking}
                className="space-y-5 animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">
                      Enter Your Details
                    </h2>
                    <p className="text-xs text-[var(--quant-muted-foreground)]">
                      Provide your contact info to receive the calendar invitation and meeting link.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-3 py-1.5 rounded-lg border border-[var(--quant-surface-elevated)] text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[#1E222B] transition-colors"
                  >
                    ← Back
                  </button>
                </div>

                {submitError && (
                  <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    {submitError}
                  </div>
                )}

                <div className="space-y-4 text-xs">
                  {/* Name field */}
                  <div>
                    <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                      Your Name <span className="text-[var(--app-accent)]">*</span>
                    </label>
                    <input
                      type="text"
                      value={bookerName}
                      onChange={(e) => setBookerName(e.target.value)}
                      placeholder="e.g. Sarah Connor"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white placeholder-[#8E939E] focus:outline-none focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] text-xs transition-colors"
                    />
                  </div>

                  {/* Email field */}
                  <div>
                    <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                      Your Email Address <span className="text-[var(--app-accent)]">*</span>
                    </label>
                    <input
                      type="email"
                      value={bookerEmail}
                      onChange={(e) => setBookerEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white placeholder-[#8E939E] focus:outline-none focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] text-xs transition-colors"
                    />
                  </div>

                  {/* Additional Notes */}
                  <div>
                    <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                      Additional Notes / Agenda (Optional)
                    </label>
                    <textarea
                      value={bookerNotes}
                      onChange={(e) => setBookerNotes(e.target.value)}
                      placeholder="Please share anything that will help prepare for our meeting…"
                      rows={3}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white placeholder-[#8E939E] focus:outline-none focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] text-xs transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
                  >
                    ← Change Date/Time
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] font-bold text-xs shadow-lg shadow-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <span className="inline-block size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin mr-1" />
                        <span>Confirming…</span>
                      </>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span>Confirm Booking</span>
                        <IconCheck size={14} className="text-[var(--quant-background)]" />
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Confirmation State */}
            {currentStep === 3 && confirmedBooking && (
              <div className="space-y-6 text-center py-4 animate-in zoom-in-95 duration-200">
                {/* Animated Success Checkmark */}
                <div className="size-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center text-3xl shadow-xl shadow-emerald-500/10">
                  <IconCheck size={32} className="text-emerald-400" />
                </div>

                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">
                    Booking Confirmed!
                  </h2>
                  <p className="text-xs text-[var(--quant-muted-foreground)] max-w-sm mx-auto mt-1">
                    A calendar invitation and RFC 5545 invite have been sent to{' '}
                    <span className="text-white font-semibold">{confirmedBooking.bookerEmail}</span>
                    .
                  </p>
                </div>

                {/* Confirmed Details Card */}
                <div className="p-5 rounded-2xl bg-[var(--quant-surface-elevated)] border border-[var(--quant-surface-elevated)] text-left space-y-3 max-w-md mx-auto text-xs">
                  <div className="font-bold text-sm text-white flex items-center gap-2 pb-2">
                    <span className="text-[var(--app-accent)]">●</span> {confirmedBooking.title}
                  </div>

                  <div className="space-y-1.5 text-[var(--quant-muted-foreground)]">
                    <div className="flex items-center gap-2 text-white">
                      <IconCalendar size={14} className="text-[var(--app-accent)]" />
                      <span className="font-medium">
                        {confirmedBooking.startTime.toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: selectedTimezone,
                        })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconClock size={14} />
                      <span>
                        {formatSlotTimeLabelInTz(confirmedBooking.startTime, selectedTimezone)} ({meetingDetails.duration} min)
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconGlobe size={14} />
                      <span>{selectedTimezone}</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <IconUsers size={14} />
                      <span>
                        Host: {confirmedBooking.hostName || 'Unknown host'}
                        {confirmedBooking.hostEmail ? ` (${confirmedBooking.hostEmail})` : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <IconMail size={14} />
                      <span>
                        Invitee: {confirmedBooking.bookerName} ({confirmedBooking.bookerEmail})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calendar Integration Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                  {/* Add to Google Calendar button */}
                  <a
                    href={generateGoogleCalendarUrl({
                      title: confirmedBooking.title,
                      description: confirmedBooking.bookerNotes,
                      startTime: confirmedBooking.startTime,
                      endTime: confirmedBooking.endTime,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--quant-surface-elevated)] hover:bg-[#282E3E] text-[#58A6FF] border border-[#58A6FF]/30 font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <IconCalendar size={14} className="text-[#58A6FF]" />
                    <span>Add to Google Calendar</span>
                  </a>

                  {/* Download .ics RFC 5545 button */}
                  <button
                    type="button"
                    onClick={handleDownloadIcs}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#21262D] hover:bg-[#30363D] text-[#F0F6FC] border border-[#30363D] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <IconDownload size={14} className="text-[#F0F6FC]" />
                    <span>Download .ics Invite</span>
                  </button>
                </div>

                <div className="pt-4">
                  <button
                    type="button"
                    onClick={handleBookAnother}
                    className="text-xs text-[var(--quant-muted-foreground)] hover:text-white underline transition-colors"
                  >
                    Book another appointment
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
        ) : (
        <BookingLinkDeadPanel
          status={linkStatus}
          message={linkErrorMessage}
          onRetry={handleReloadLink}
          onGoBack={handleGoBack}
        />
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-xs text-[#5E6472] bg-black">
        QuantCalendar • Sovereign Scheduling Platform • Zero Ads
      </footer>
    </div>
  );
}
