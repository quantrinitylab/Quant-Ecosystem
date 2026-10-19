'use client';

// ============================================================================
// QuantCalendar — Host Booking Links Manager Modal (Calendly-Class Parity)
// Tasks W39-CAL01 & W39-CAL02
// ============================================================================

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { showToast } from '../../../components/InboxToast';
import { IconLink, IconX, IconCalendar, IconClock, IconClipboard, IconCheck, IconTrash } from '../../../components/icons';
import { apiFetchRaw } from '@quant/api-client';
import { TIMEZONES } from '../types';
import {
  bookingLinksAccountKey,
  ensureBookingLinksNamespaceV2,
  getBookingLinks,
  saveBookingLinks,
  windowBookingLinksStorage,
  type BookingLinkItem,
} from '../../../lib/bookingLinks';

// The booking-link type and the persisted-cache parsing live in the
// framework-free lib module (qm-booking-links-scope: account-scoped offline
// cache on the immutable user id, legacy unscoped key purged). Re-exported
// here so existing import sites (booking-page tests) keep working unchanged.
export type { BookingLinkItem } from '../../../lib/bookingLinks';
export { parseStoredBookingLinks } from '../../../lib/bookingLinks';

export interface BookingLinksModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  /**
   * Backend-verified immutable user id (from useAuth) — namespaces the
   * offline booking-links cache (qm-booking-links-scope). Never the mutable
   * email.
   */
  userId?: string;
}

/**
 * Host-timezone default for a new booking link
 * (fix/qm-booking-tz-availability-2): the host's own IANA timezone when it
 * is one of the curated options, else the detected zone as an honest
 * explicit option, else 'UTC'.
 */
export function defaultHostTimezone(): string {
  try {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof detected === 'string' && detected.trim()) return detected.trim();
  } catch {
    // fall through to UTC
  }
  return 'UTC';
}

/** Curated timezone options plus the detected zone when it is not curated. */
export function hostTimezoneOptions(): { label: string; value: string }[] {
  const detected = defaultHostTimezone();
  if (TIMEZONES.some((t) => t.value === detected)) return TIMEZONES;
  return [{ label: `${detected} (detected)`, value: detected }, ...TIMEZONES];
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// The seeded-fake-data filter and cache parsing moved to lib/bookingLinks
// (re-exported above) — qm-booking-links-scope.

/**
 * Honest result of a booking-link server sync.
 * - ok: the backend accepted the link (HTTP 2xx).
 * - slugTaken: the backend rejected it with 409 BOOKING_LINK_SLUG_TAKEN —
 *   the slug belongs to another host's link, so it can NEVER sync and the
 *   caller must not keep a local copy (fix/qm-booking-slug-409).
 */
export interface BookingLinkSyncResult {
  ok: boolean;
  slugTaken: boolean;
}

/**
 * Best-effort server sync for a newly created booking link.
 * Returns whether the backend accepted the link plus whether it rejected the
 * slug as taken. The caller must surface a false result honestly instead of
 * silently pretending the save succeeded.
 */
export async function persistBookingLinkToServer(link: BookingLinkItem): Promise<BookingLinkSyncResult> {
  try {
    const res = await apiFetchRaw('/api/booking/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: link.title,
        slug: link.slug,
        description: link.description,
        duration: link.duration,
        startHour: link.startHour,
        endHour: link.endHour,
        availableDays: link.availableDays,
        // fix/qm-booking-tz-availability-2: the host's IANA timezone anchoring
        // the availability window (backend normalizes invalid values to UTC).
        timezone: link.timezone,
      }),
    });
    if (res.ok) return { ok: true, slugTaken: false };
    // fix/qm-booking-slug-409: detect the duplicate-slug rejection. The
    // backend answers 409 BOOKING_LINK_SLUG_TAKEN (body code preferred;
    // plain 409 status as fallback for proxies that strip bodies).
    let slugTaken = res.status === 409;
    try {
      const body = (await res.json()) as { error?: { code?: string } };
      slugTaken = body?.error?.code === 'BOOKING_LINK_SLUG_TAKEN' || (res.status === 409 && !body?.error);
    } catch {
      // Non-JSON error body — keep the status-based verdict.
    }
    return { ok: false, slugTaken };
  } catch {
    return { ok: false, slugTaken: false };
  }
}

/**
 * Honest toast copy for the booking-link save outcome. Kept as a pure
 * function so the exact user-facing words are unit-testable:
 * - slugTaken: the slug belongs to someone else's link and can never sync —
 *   the host must pick another (no local copy is kept).
 * - ok: the server accepted the link.
 * - otherwise: the link lives on this device only (may sync later) — say so.
 */
export function bookingLinkSaveToast(sync: BookingLinkSyncResult): { text: string; type: 'success' | 'error' } {
  if (sync.slugTaken) {
    return { text: 'This URL slug is already taken — pick another', type: 'error' };
  }
  if (sync.ok) {
    return { text: 'Booking link created successfully!', type: 'success' };
  }
  return {
    text: 'Booking link saved on this device only — server sync failed. The link is not yet shareable from other devices.',
    type: 'error',
  };
}

/**
 * Map one backend booking-link record into the modal's BookingLinkItem.
 * Returns null for malformed records — the list render must never crash on
 * an unexpected server payload.
 */
export function mapServerBookingLink(raw: unknown): BookingLinkItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['slug'] !== 'string' || typeof r['title'] !== 'string') {
    return null;
  }
  const days = Array.isArray(r['availableDays'])
    ? (r['availableDays'] as unknown[])
        .map((d) => Number(d))
        .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [1, 2, 3, 4, 5];
  const rawCreatedAt = r['createdAt'];
  let createdAt: string;
  if (typeof rawCreatedAt === 'string' && rawCreatedAt) {
    createdAt = rawCreatedAt;
  } else {
    const d = new Date(rawCreatedAt as string | number | Date);
    createdAt = Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return {
    id: r['id'] as string,
    slug: r['slug'] as string,
    title: r['title'] as string,
    description: typeof r['description'] === 'string' ? (r['description'] as string) : '',
    duration: num(r['duration'], 30),
    startHour: num(r['startHour'], 9),
    endHour: num(r['endHour'], 17),
    availableDays: days,
    // The backend normalizes the stored value; default 'UTC' for records
    // created before the field existed (fix/qm-booking-tz-availability-2).
    timezone:
      typeof r['timezone'] === 'string' && r['timezone'].trim()
        ? (r['timezone'] as string)
        : 'UTC',
    isActive: typeof r['isActive'] === 'boolean' ? (r['isActive'] as boolean) : true,
    createdAt,
  };
}

/**
 * Read the host's booking links from the backend (GET /api/booking/links).
 * Returns null on ANY failure — network error, non-2xx, or a malformed
 * envelope — so the caller can fall back to this device's local copy and say
 * so honestly instead of rendering a fake empty list.
 */
export async function fetchBookingLinksFromServer(): Promise<BookingLinkItem[] | null> {
  try {
    const res = await apiFetchRaw('/api/booking/links', { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json()) as { success?: unknown; data?: unknown };
    if (!body || body.success !== true || !Array.isArray(body.data)) return null;
    return body.data
      .map((raw) => mapServerBookingLink(raw))
      .filter((l): l is BookingLinkItem => l !== null);
  } catch {
    return null;
  }
}

/**
 * Delete one booking link on the backend (DELETE /api/booking/links/:id).
 * Returns true only when the backend accepted the delete (HTTP 2xx).
 */
export async function deleteBookingLinkOnServer(id: string): Promise<boolean> {
  try {
    const res = await apiFetchRaw(`/api/booking/links/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Merge the server list (source of truth) with local-only links that the
 * server never accepted. A local link whose slug already exists on the server
 * is dropped — it was synced; the local id is dead weight.
 */
export function mergeServerAndLocalLinks(
  serverLinks: BookingLinkItem[],
  localLinks: BookingLinkItem[],
): BookingLinkItem[] {
  const serverSlugs = new Set(serverLinks.map((l) => l.slug));
  const localOnly = localLinks
    .filter((l) => !serverSlugs.has(l.slug))
    .map((l) => ({ ...l, pendingSync: true }));
  return [...serverLinks, ...localOnly];
}

/**
 * A link that exists only on this device — never confirmed by the backend —
 * so there is nothing server-side to DELETE. Locally-created ids use the
 * `link-` prefix; the explicit `pendingSync` flag is the authoritative mark.
 */
export function isLocalOnlyBookingLink(link: BookingLinkItem): boolean {
  return link.pendingSync === true || link.id.startsWith('link-');
}

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
  // No hardcoded default identity: the caller passes the signed-in user's
  // real email (from useAuth). When it is absent we show an honest
  // "Not signed in" in the footer instead of inventing an identity.
  userEmail,
  userId,
}) => {
  // qm-booking-links-scope: the offline cache namespace key carries the
  // backend-verified IMMUTABLE user id. An unknown/empty account means no
  // persistence at all (fail closed — never the old shared key).
  const accountKey = bookingLinksAccountKey(userId);
  const [links, setLinks] = useState<BookingLinkItem[]>([]);

  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDuration, setFormDuration] = useState<number>(30);
  const [formStartHour, setFormStartHour] = useState<number>(9);
  const [formEndHour, setFormEndHour] = useState<number>(17);
  const [formAvailableDays, setFormAvailableDays] = useState<number[]>([1, 2, 3, 4, 5]);
  // fix/qm-booking-tz-availability-2: the host's IANA timezone anchoring the
  // availability window — availability hours are interpreted in this zone.
  const [formTimezone, setFormTimezone] = useState<string>(() => defaultHostTimezone());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Server read state. `serverSyncError` is the honest offline flag: when the
  // backend list can't be loaded we keep this device's local copy and say so.
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [serverSyncError, setServerSyncError] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // qm-booking-links-scope: offline cache is account-scoped
  // (`quant_calendar_booking_links.v2.<immutable-user-id>`); the legacy
  // unscoped key is purged once per page load (never read, never migrated).
  // `linksBelongToAccount` guards the write path: on an account switch the
  // persist effect must never write the previous account's in-memory links
  // under the new account's key before the reload effect runs.
  const linksBelongToAccount = useRef<string>('');
  useEffect(() => {
    const store = windowBookingLinksStorage();
    ensureBookingLinksNamespaceV2(store);
    setLinks(getBookingLinks(store, accountKey));
    linksBelongToAccount.current = accountKey;
  }, [accountKey]);

  // Sync to localStorage (offline cache only — the server is the source of truth)
  useEffect(() => {
    if (!accountKey) return; // fail closed: unknown account persists nothing
    if (linksBelongToAccount.current !== accountKey) return; // mid-switch guard
    saveBookingLinks(windowBookingLinksStorage(), accountKey, links);
  }, [accountKey, links]);

  // Load the host's links from the backend every time the modal opens.
  // Without this, backend-created links (and links made on other devices)
  // never appeared — the write/read split-brain this fix closes.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      setIsLoadingLinks(true);
      const serverLinks = await fetchBookingLinksFromServer();
      if (cancelled) return;
      if (serverLinks === null) {
        // Honest fallback: server unreachable — keep the localStorage copy
        // loaded above and say so; never render a fake empty list.
        setServerSyncError(true);
      } else {
        setServerSyncError(false);
        setLinks((prev) => mergeServerAndLocalLinks(serverLinks, prev));
      }
      setIsLoadingLinks(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

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
      // BB-P2-8: name the absolute URL that was actually copied to the
      // clipboard — a relative path here read as if the copy was broken.
      text: `Copied booking link: ${fullUrl}`,
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
      timezone: formTimezone,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    // Sync the link to the backend. The save is local-first (except for a
    // duplicate-slug rejection, which can never sync): the link lands in
    // local state, but we are honest about whether the server actually
    // accepted it — a failed sync surfaces an error toast instead
    // of a fake success. On success we re-read the list so the canonical
    // server record (server-assigned id) is what renders — that is what
    // DELETE needs later.
    // fix/qm-booking-slug-409: a 409 BOOKING_LINK_SLUG_TAKEN means the slug
    // belongs to another host's link — it can NEVER sync, so no local copy
    // is kept (a pendingSync copy would be permanently unsyncable dead
    // weight). The form stays open with the values intact so the host can
    // pick another slug.
    const sync = await persistBookingLinkToServer(newLink);

    if (sync.slugTaken) {
      setIsSubmitting(false);
      showToast(bookingLinkSaveToast(sync));
      return;
    }

    if (sync.ok) {
      const refreshed = await fetchBookingLinksFromServer();
      if (refreshed !== null) {
        setLinks((prev) => mergeServerAndLocalLinks(refreshed, [newLink]));
      } else {
        // Server accepted the POST but the list read failed — keep the local
        // copy so it is not silently lost.
        setLinks((prev) => [{ ...newLink, pendingSync: true }, ...prev]);
      }
      setIsSubmitting(false);
      showToast(bookingLinkSaveToast(sync));
    } else {
      setIsSubmitting(false);
      setLinks((prev) => [{ ...newLink, pendingSync: true }, ...prev]);
      showToast(bookingLinkSaveToast(sync));
    }

    // Reset form
    setFormTitle('');
    setFormSlug('');
    setFormDescription('');
    setFormDuration(30);
    setFormStartHour(9);
    setFormEndHour(17);
    setFormAvailableDays([1, 2, 3, 4, 5]);
    setFormTimezone(defaultHostTimezone());
    setSlugManuallyEdited(false);
    setActiveTab('list');
  };

  /**
   * Delete a booking link. Server-owned links are deleted on the backend
   * (DELETE /api/booking/links/:id); local-only links that the server never
   * accepted are removed from this device only. A failed server delete keeps
   * the row and says so honestly — it never pretends the link is gone.
   */
  const handleDeleteLink = async (link: BookingLinkItem) => {
    if (isLocalOnlyBookingLink(link)) {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      showToast({
        text: 'Booking link removed from this device (it was never synced to the server).',
        type: 'success',
      });
      return;
    }
    setDeletingId(link.id);
    const deleted = await deleteBookingLinkOnServer(link.id);
    setDeletingId(null);
    if (deleted) {
      setLinks((prev) => prev.filter((l) => l.id !== link.id));
      showToast({ text: 'Booking link deleted', type: 'success' });
    } else {
      showToast({
        text: 'Could not delete the link on the server — it is still live. Check your connection and try again.',
        type: 'error',
      });
    }
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
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--quant-surface-subtle)] border border-[var(--quant-surface-elevated)] shadow-2xl overflow-hidden z-10 text-[var(--quant-foreground)] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] flex items-center justify-center text-[var(--app-accent)] text-lg font-bold">
              <IconLink size={18} />
            </div>
            <div>
              <h2
                id="booking-links-modal-title"
                className="text-base font-bold tracking-tight text-white flex items-center gap-2"
              >
                Booking Links
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--app-accent)_20%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]">
                  Calendly Parity
                </span>
              </h2>
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                Share public booking links with clients and colleagues to schedule meetings
                effortlessly.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="size-8 grid place-items-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-white hover:bg-[var(--quant-surface-elevated)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Tab Toggle Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-[var(--quant-surface-elevated)]/50">
          <div className="flex items-center rounded-lg border border-[var(--quant-surface-elevated)] bg-black p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'list'
                  ? 'bg-[var(--app-accent)] text-[var(--quant-background)] shadow-sm'
                  : 'text-[var(--quant-muted-foreground)] hover:text-white'
              }`}
            >
              Active Links ({links.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                activeTab === 'create'
                  ? 'bg-[var(--app-accent)] text-[var(--quant-background)] shadow-sm'
                  : 'text-[var(--quant-muted-foreground)] hover:text-white'
              }`}
            >
              + Create New Link
            </button>
          </div>

          {activeTab === 'list' && (
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] transition-colors shadow-sm"
            >
              + New Link
            </button>
          )}
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === 'list' ? (
            isLoadingLinks ? (
              <div className="text-center py-12 px-4">
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  Loading your booking links…
                </p>
              </div>
            ) : (
              <>
                {/* Honest offline fallback: the server list couldn't be read, so
                    these are this device's links only — links made on other
                    devices are not shown. */}
                {serverSyncError && (
                  <div
                    role="alert"
                    className="px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200"
                  >
                    Couldn&apos;t reach the booking server — showing links saved on this
                    device. Links created on other devices aren&apos;t shown here.
                  </div>
                )}
                {links.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3">
                <div className="flex justify-center"><IconCalendar size={36} className="text-[var(--app-accent)]" /></div>
                <h3 className="text-sm font-semibold text-white">No booking links created yet</h3>
                <p className="text-xs text-[var(--quant-muted-foreground)] max-w-sm mx-auto">
                  Create your first shareable link to let others book slots directly on your
                  calendar.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('create')}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] shadow-md transition-all"
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
                      className="group p-4 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] hover:border-[#3A404D] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-semibold text-sm text-white truncate">
                            {link.title}
                          </h4>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-[color-mix(in_srgb,var(--app-accent)_15%,transparent)] text-[var(--app-accent)] border border-[color-mix(in_srgb,var(--app-accent)_25%,transparent)]">
                            {link.duration} min
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-[var(--quant-surface-elevated)] text-[#7EE787] border border-[#7EE787]/20">
                            Active
                          </span>
                          {/* Honest sync marker: this link never reached the
                              server — it only exists on this device. */}
                          {link.pendingSync && (
                            <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              This device only
                            </span>
                          )}
                        </div>

                        {link.description && (
                          <p className="text-xs text-[var(--quant-muted-foreground)] line-clamp-1">{link.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-xs text-[#8B949E] pt-1">
                          <span className="flex items-center gap-1">
                            <IconClock size={12} className="text-[#8B949E]" /> {formatHour(link.startHour)} – {formatHour(link.endHour)} {link.timezone}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <IconCalendar size={12} className="text-[#8B949E]" /> {getDayNamesSummary(link.availableDays)}
                          </span>
                        </div>

                        <div className="pt-1 flex items-center gap-1.5 text-xs text-[#58A6FF] font-mono select-all">
                          {/* P2: display the absolute URL, not a relative path —
                              select-all copying must yield a link that works
                              outside this page. Matches what Copy Link writes
                              to the clipboard. */}
                          <span className="truncate">
                            {(typeof window !== 'undefined' ? window.location.origin : 'https://quantmail.in')}
                            /calendar/booking/{link.slug}
                          </span>
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
                          {isCopied ? (
                            <>
                              <IconCheck size={13} className="text-emerald-400" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <IconClipboard size={13} />
                              <span>Copy Link</span>
                            </>
                          )}
                        </button>

                        <a
                          href={`/calendar/booking/${link.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--quant-surface-elevated)] hover:bg-[#282E3E] text-[#58A6FF] border border-[#58A6FF]/30 transition-all flex items-center gap-1"
                          title="Preview public booking page"
                        >
                          ↗ View Page
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDeleteLink(link)}
                          disabled={deletingId === link.id}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--quant-surface-elevated)] hover:bg-red-500/20 text-[#F85149] border border-[#F85149]/30 transition-all flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Delete booking link"
                        >
                          <IconTrash size={13} />
                          <span>{deletingId === link.id ? 'Deleting…' : 'Delete'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
                )}
              </>
            )
          ) : (
            /* Create New Link Sub-Form */
            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Title & Slug */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                    Meeting Title <span className="text-[var(--app-accent)]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={handleTitleChange}
                    placeholder="e.g. 30 Min Strategy Session"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white placeholder-[#8E939E] focus:outline-none focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] text-xs transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                    URL Slug <span className="text-[var(--app-accent)]">*</span>
                  </label>
                  <div className="flex items-center rounded-xl bg-black border border-[var(--quant-surface-elevated)] focus-within:border-[var(--app-accent)] focus-within:ring-1 focus-within:ring-[var(--app-accent)] overflow-hidden text-xs">
                    <span className="pl-3 text-[#5E6472] select-none text-[11px]">/booking/</span>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={handleSlugChange}
                      placeholder="strategy-session"
                      required
                      className="w-full pr-3 py-2 bg-transparent border-0 text-white placeholder-[#8E939E] focus:outline-none text-xs font-mono focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">
                  Description / Agenda (Optional)
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Share a brief overview of what this meeting is about, what attendees should prepare, etc."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white placeholder-[#8E939E] focus:outline-none focus:border-[var(--app-accent)] focus:ring-1 focus:ring-[var(--app-accent)] text-xs transition-colors"
                />
              </div>

              {/* Duration Presets */}
              <div>
                <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1.5">
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
                          ? 'bg-[var(--app-accent)] text-[var(--quant-background)] border-[var(--app-accent)] shadow-sm'
                          : 'bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)] border-[var(--quant-surface-elevated)] hover:text-white hover:border-[#3A404D]'
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
                  <label htmlFor="booking-start-hour" className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">Start Time</label>
                  <select
                    id="booking-start-hour" value={formStartHour}
                    onChange={(e) => setFormStartHour(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white focus:outline-none focus:border-[var(--app-accent)] text-xs cursor-pointer"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i} value={i}>
                        {formatHour(i)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="booking-end-hour" className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">End Time</label>
                  <select
                    id="booking-end-hour" value={formEndHour}
                    onChange={(e) => setFormEndHour(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white focus:outline-none focus:border-[var(--app-accent)] text-xs cursor-pointer"
                  >
                    {Array.from({ length: 24 }).map((_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {formatHour(i + 1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Availability timezone (fix/qm-booking-tz-availability-2):
                  the hours above are interpreted as wall-clock times in this
                  zone; guests see the same slots labeled in their own zone. */}
              <div className="mt-4">
                <label htmlFor="booking-timezone" className="block text-[var(--quant-muted-foreground)] font-semibold mb-1">Timezone</label>
                <select
                  id="booking-timezone" value={formTimezone}
                  onChange={(e) => setFormTimezone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black border border-[var(--quant-surface-elevated)] text-white focus:outline-none focus:border-[var(--app-accent)] text-xs cursor-pointer"
                >
                  {hostTimezoneOptions().map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-[var(--quant-muted-foreground)]">
                  Availability hours are interpreted in this timezone.
                </p>
              </div>

              {/* Available Days Checkboxes */}
              <div>
                <label className="block text-[var(--quant-muted-foreground)] font-semibold mb-1.5">
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
                            ? 'bg-[var(--app-accent)] text-[var(--quant-background)] border-[var(--app-accent)] shadow-sm'
                            : 'bg-[var(--quant-surface-elevated)] text-[#8B949E] border-[var(--quant-surface-elevated)] hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] hover:bg-[#20232A] text-[var(--quant-muted-foreground)] hover:text-white font-semibold transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-[var(--quant-background)] font-bold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Creating Link…' : 'Create Booking Link'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-black flex items-center justify-between text-xs text-[var(--quant-muted-foreground)]">
          <span className="flex items-center gap-1.5">
            Host:{' '}
            <span className="font-semibold text-white">
              {userEmail && userEmail.trim() ? userEmail : 'Not signed in'}
            </span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
