'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '../services/api-client';
import type { CalendarEvent, Email, EmailAttachment } from '../types';
import { threadAddresses } from '../lib/threading';
import { formatBytes } from '../lib/format-bytes';

/*
 * QM-SCREEN-005 R2 P2 bundle — thread-view relations + subject-change parity.
 *
 * 1. SubjectChangeSeparator / subjectChangedNewSubject — the user-locked
 *    "Naya vishay: <subject>" separator from the people-view thread
 *    (PersonThread.tsx), replicated in the classic thread view. Subject
 *    comparison ignores Re:/Fwd: prefixes (case-insensitive, repeatable), so
 *    only a genuine topic change draws the separator.
 *
 * 2. QuantyThreadEvidence — the compact Quanty draft + evidence section.
 *    HONEST BACKEND GAP: there is no per-thread persisted Quanty draft/evidence
 *    store. `POST /ai/reply` is an on-demand draft action (never persisted),
 *    `POST /ai/summarize-thread` is summarization only, and the copilot
 *    drawer's drafts are ephemeral chat-envelope drafts that are discarded when
 *    the drawer closes. Until a backend endpoint exposes stored per-thread
 *    drafts/evidence, this component renders NOTHING (honest hidden state)
 *    rather than inventing UI. The typed `drafts` prop is the wiring point —
 *    when the backend lands, pass real rows and the section appears.
 *
 * 3. ThreadRelatedSection — the "Related" section. REAL relations only:
 *    - Drive/files: every attachment actually carried by the thread's messages
 *      (EmailAttachment rows: filename, mimeType, size) — aggregated thread-wide
 *      so the reader stops hunting per-message previews.
 *    - Calendar: real events from GET /events inside the thread's date window
 *      (±1 day), matched by attendee-email overlap with the thread's
 *      participants. Client-side filter because the API has no attendee query.
 *    - QuantGit: no backend exposes thread↔repo/commit linkage, so nothing
 *      renders — the gap is documented here and in the PR; no fabricated
 *      references. Honest "No related items" empty state when both real
 *      sources are empty.
 */

/** Strip Re:/Fwd: prefixes (repeatable, case-insensitive), trim, lowercase. Exported for tests. */
export function normalizeSubjectForChange(subject?: string | null): string {
  let value = (subject ?? '').trim();
  while (/^(?:re|fwd):\s*/i.test(value)) {
    value = value.replace(/^(?:re|fwd):\s*/i, '').trim();
  }
  return value.toLowerCase();
}

/**
 * The new subject when the message at `index` genuinely changes the subject
 * relative to the previous message (Re:/Fwd: prefixes ignored), else null.
 * Messages are expected ascending by receivedAt (the view keeps that order).
 * Exported for tests.
 */
export function subjectChangedNewSubject(messages: Email[], index: number): string | null {
  if (index <= 0 || index >= messages.length) return null;
  const prev = normalizeSubjectForChange(messages[index - 1]?.subject);
  const next = normalizeSubjectForChange(messages[index]?.subject);
  if (!next || next === prev) return null;
  const raw = (messages[index]?.subject ?? '').trim();
  return raw || null;
}

/** Aggregate every attachment carried by the thread's messages, deduped by id. Exported for tests. */
export function aggregateThreadFiles(messages: Email[]): EmailAttachment[] {
  const seen = new Set<string>();
  const files: EmailAttachment[] = [];
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      const key = attachment.id || `${attachment.filename}:${attachment.size}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push(attachment);
    }
  }
  return files;
}

/**
 * Keep only the events that share at least one attendee email with the thread's
 * participants, deduped by id, sorted by start time. Exported for tests.
 */
export function filterEventsByAttendees(
  events: CalendarEvent[],
  participantEmails: string[],
): CalendarEvent[] {
  const normalized = new Set(
    participantEmails.map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  if (normalized.size === 0) return [];
  const seen = new Set<string>();
  const matched: CalendarEvent[] = [];
  for (const event of events) {
    if (!event?.id || seen.has(event.id)) continue;
    seen.add(event.id);
    const attendees = (event.attendees ?? []).map((attendee) =>
      (attendee.email ?? '').trim().toLowerCase(),
    );
    if (attendees.some((email) => normalized.has(email))) matched.push(event);
  }
  matched.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  return matched;
}

/** The thread's date window, padded by a day on each side. Null when unknowable. */
function threadDateWindow(messages: Email[]): { start: Date; end: Date } | null {
  const times = messages
    .map((message) => new Date(message.receivedAt || message.createdAt || 0).getTime())
    .filter((time) => Number.isFinite(time) && time > 0);
  if (times.length === 0) return null;
  const start = new Date(Math.min(...times));
  start.setDate(start.getDate() - 1);
  const end = new Date(Math.max(...times));
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function formatEventWhen(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileWhen(value: string | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * The "Naya vishay:" separator — replicated from PersonThread's MessageRow so
 * the two thread views speak the same language when the subject changes
 * mid-conversation.
 */
export function SubjectChangeSeparator({ subject }: { subject: string }) {
  return (
    <div
      data-testid="subject-change"
      className="my-3 flex items-center gap-3"
      aria-label={`Subject changed to ${subject}`}
    >
      <span className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
      <span
        dir="auto"
        className="min-w-0 max-w-[70%] truncate text-[11px] tracking-wide text-zinc-500"
      >
        Naya vishay: {subject}
      </span>
      <span className="h-px flex-1 bg-zinc-800" aria-hidden="true" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quanty draft evidence (honest hidden state until the backend wires per-thread drafts)
// ---------------------------------------------------------------------------

export interface QuantyEvidenceRef {
  /** The message id the excerpt was taken from. */
  messageId: string;
  /** Verbatim excerpt grounding the draft — never paraphrased. */
  excerpt: string;
}

export interface QuantyThreadDraft {
  id: string;
  subject?: string;
  body: string;
  /** The model's own confidence, 0–1, when the backend reports one. */
  confidence?: number;
  /** Message excerpts the draft was built from. */
  evidence: QuantyEvidenceRef[];
  createdAt?: string | Date;
}

/**
 * Compact Quanty draft + evidence/diff section. With no backend rows this
 * renders nothing — see the honest-gap note at the top of this file.
 */
export function QuantyThreadEvidence({ drafts = [] }: { drafts?: QuantyThreadDraft[] }) {
  if (drafts.length === 0) return null;

  return (
    <section
      data-testid="quanty-thread-evidence"
      aria-label="Quanty drafts for this conversation"
      className="rounded-2xl bg-[var(--quant-surface-elevated)] p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">
        Quanty <span className="font-normal text-zinc-500">· {drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
      </h3>
      <div className="space-y-3">
        {drafts.map((draft) => (
          <article key={draft.id} data-testid="quanty-draft" className="rounded-xl bg-black/40 p-3">
            {draft.subject && (
              <p dir="auto" className="mb-1 truncate text-xs font-semibold text-zinc-200">
                {draft.subject}
              </p>
            )}
            <p
              dir="auto"
              className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300"
            >
              {draft.body}
            </p>
            {typeof draft.confidence === 'number' && (
              <p className="mt-2 text-[11px] text-zinc-500">
                Quanty confidence: {Math.round(draft.confidence * 100)}%
              </p>
            )}
            {draft.evidence.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Based on
                </p>
                {draft.evidence.map((ref) => (
                  <blockquote
                    key={ref.messageId}
                    data-testid="quanty-evidence"
                    dir="auto"
                    className="border-l-2 border-[var(--quant-primary)]/60 pl-2 text-xs italic text-zinc-400"
                  >
                    “{ref.excerpt}”
                  </blockquote>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Related section — cross-app relations, real data only
// ---------------------------------------------------------------------------

export function ThreadRelatedSection({
  messages,
  currentEmail,
}: {
  messages: Email[];
  currentEmail: string;
}) {
  const files = useMemo(() => aggregateThreadFiles(messages), [messages]);

  const participantEmails = useMemo(() => {
    const set = new Set<string>();
    // threadAddresses: every address in the conversation that is not the
    // signed-in user's (threadParticipants returns display *names*, which can
    // never match an attendee email).
    for (const address of threadAddresses(messages, currentEmail)) {
      const normalized = address.trim().toLowerCase();
      if (normalized) set.add(normalized);
    }
    const self = (currentEmail ?? '').trim().toLowerCase();
    if (self) set.add(self);
    return [...set];
  }, [messages, currentEmail]);

  // null = still loading; [] = loaded, nothing related.
  const [relatedEvents, setRelatedEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const window = threadDateWindow(messages);
    if (!window || participantEmails.length === 0) {
      setRelatedEvents([]);
      return;
    }
    if (typeof apiClient.getEvents !== 'function') {
      // Some hand-rolled apiClient mocks (and older clients) do not
      // implement getEvents — the section degrades to the files the
      // thread already carries instead of throwing in the effect.
      setRelatedEvents([]);
      return;
    }
    apiClient
      .getEvents({ start: window.start.toISOString(), end: window.end.toISOString() })
      .then((res) => {
        if (cancelled) return;
        const rows = res?.success && Array.isArray(res.data) ? res.data : [];
        setRelatedEvents(filterEventsByAttendees(rows, participantEmails));
      })
      .catch(() => {
        // An events failure must never break the thread — the section degrades
        // to the files the thread already carries.
        if (!cancelled) setRelatedEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [messages, participantEmails]);

  const eventsReady = relatedEvents !== null;
  const hasRelations = files.length > 0 || (relatedEvents ?? []).length > 0;

  return (
    <section
      data-testid="thread-related"
      aria-label="Related items for this conversation"
      className="rounded-2xl bg-[var(--quant-surface-elevated)] p-4"
    >
      <h3 className="mb-3 text-sm font-semibold text-zinc-100">Related</h3>

      {files.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Files in this conversation
          </p>
          <ul className="space-y-1.5">
            {files.map((file) => (
              <li
                key={file.id || `${file.filename}:${file.size}`}
                data-testid="related-file"
                className="flex items-center gap-2.5 rounded-xl bg-black/40 px-3 py-2"
              >
                <svg
                  className="size-4 shrink-0 text-zinc-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span
                    dir="auto"
                    className="block truncate text-xs font-medium text-zinc-200"
                    title={file.filename}
                  >
                    {file.filename}
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    {formatBytes(file.size)}
                    {file.mimeType ? ` · ${file.mimeType}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {eventsReady && (relatedEvents ?? []).length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Calendar events with these people
          </p>
          <ul className="space-y-1.5">
            {(relatedEvents ?? []).map((event) => (
              <li
                key={event.id}
                data-testid="related-event"
                className="flex items-center gap-2.5 rounded-xl bg-black/40 px-3 py-2"
              >
                <svg
                  className="size-4 shrink-0 text-[var(--quant-primary)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span
                    dir="auto"
                    className="block truncate text-xs font-medium text-zinc-200"
                    title={event.title}
                  >
                    {event.title}
                  </span>
                  <span className="block text-[11px] text-zinc-500">
                    {formatEventWhen(event.startTime)}
                    {event.location ? ` · ${event.location}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!eventsReady && (
        <p className="py-1 text-xs text-zinc-500" role="status">
          Checking calendar…
        </p>
      )}

      {eventsReady && !hasRelations && (
        <p className="py-1 text-sm text-zinc-500">No related items</p>
      )}
    </section>
  );
}
