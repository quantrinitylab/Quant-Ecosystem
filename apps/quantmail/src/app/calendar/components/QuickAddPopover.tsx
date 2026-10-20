'use client';

/*
 * fix/qm-calendar-nlp-quickadd — Google Calendar "Q"-style quick-add.
 *
 * A single input: type "Lunch with Sam 1pm", see the parsed preview live,
 * hit Enter and the event is created. Anything the parser cannot schedule
 * falls back honestly to the full editor with the title prefilled — no
 * invented dates.
 *
 * fix/qm-calendar-nlp-quickadd-invite — "with Alex" names are resolved
 * against the user's contacts and REAL emails are attached as attendees, so
 * the backend sends genuine ICS invites on creation (the finding's headline
 * example: "Schedule a 30-minute lunch with Alex on Tuesday at noon").
 * Names that match no contact are never invited — the preview says so
 * honestly instead of pretending.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuickAdd, type QuickAddParse } from '../lib/nlpEventParser';
import { resolveAttendeeEmails, type ResolvedAttendee } from '../lib/attendeeResolve';
import { apiClient } from '../../../services/api-client';
import { useCreateEvent } from '../../../hooks/useCalendar';

/** Fresh contact lookup for names (authoritative at submit; preview is best-effort). */
function resolveNow(names: string[]): Promise<ResolvedAttendee[]> {
  return resolveAttendeeEmails(names, async (q) => {
    const res = await apiClient.searchContacts(q);
    return (res.data ?? []).map((c) => ({ name: c.name, email: c.email }));
  });
}

export interface QuickAddPopoverProps {
  open: boolean;
  onClose: () => void;
  /** The event was created — the parent refetches and toasts. */
  onCreated: (title: string) => void;
  /** The text named nothing schedulable — open the full editor instead. */
  onOpenFullEditor: (title: string) => void;
}

function formatPreview(parsed: QuickAddParse): string {
  const dayFmt = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  if (parsed.allDay) return `${dayFmt.format(parsed.start)} · All day`;
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dayFmt.format(parsed.start)} · ${timeFmt.format(parsed.start)} – ${timeFmt.format(parsed.end)}`;
}

export function QuickAddPopover({ open, onClose, onCreated, onOpenFullEditor }: QuickAddPopoverProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Contact resolution for "with Alex" names — preview is best-effort
  // (debounced), submit re-resolves authoritatively.
  const [resolved, setResolved] = useState<ResolvedAttendee[]>([]);
  const [resolving, setResolving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const createEvent = useCreateEvent();

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);
  const namesKey = parsed && parsed.attendees.length > 0 ? parsed.attendees.join('\n') : '';

  useEffect(() => {
    if (open) {
      setText('');
      setError(null);
      setSaving(false);
      setResolved([]);
      setResolving(false);
      // Focus after paint so the opening `q` keystroke never lands in it.
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open ]);

  useEffect(() => {
    if (!open) return undefined;
    if (!namesKey) {
      setResolved([]);
      setResolving(false);
      return undefined;
    }
    const names = namesKey.split('\n');
    setResolved(names.map((name) => ({ name, email: null })));
    setResolving(true);
    let cancelled = false;
    const t = setTimeout(() => {
      void resolveNow(names).then((r) => {
        if (!cancelled) {
          setResolved(r);
          setResolving(false);
        }
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, namesKey]);

  if (!open) return null;

  const submit = async () => {
    const value = text.trim();
    if (!value || saving) return;
    const hit = parseQuickAdd(value);
    if (!hit) {
      // Honest fallback: nothing schedulable in the text — hand the title to
      // the full editor instead of inventing a date.
      onOpenFullEditor(value.slice(0, 200));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // Resolve "with Alex" names to real contact emails right before
      // saving. Only email-shaped addresses become attendees — unresolved
      // names are left out (the preview already said so honestly).
      const resolvedNow = await resolveNow(hit.attendees);
      const emails = [
        ...new Set(resolvedNow.map((r) => r.email).filter((e): e is string => !!e)),
      ];
      await createEvent.mutateAsync({
        title: hit.title,
        startTime: hit.start.toISOString(),
        endTime: hit.end.toISOString(),
        allDay: hit.allDay,
        ...(emails.length > 0 ? { attendees: emails } : {}),
      } as Parameters<typeof createEvent.mutateAsync>[0]);
      onCreated(hit.title);
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'Could not create the event — try again');
    }
  };

  // Honest invite status for the live preview: who gets a real invite and
  // who doesn't (name with no contact email is never invited).
  const inviteNote =
    parsed && parsed.attendees.length > 0
      ? parsed.attendees
          .map((n) => {
            const r = resolved.find((x) => x.name === n);
            if (r?.email) return `${n} — invite to ${r.email}`;
            if (resolving) return `${n} — looking up…`;
            return `${n} — not in contacts, no invite`;
          })
          .join(' · ')
      : null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-24"
      role="dialog"
      aria-modal="true"
      aria-label="Quick-add event"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-black p-4 shadow-2xl ring-1 ring-white/10">
        <label
          htmlFor="calendar-quick-add-input"
          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--quant-muted-foreground)]"
        >
          Quick add
        </label>
        <input
          ref={inputRef}
          id="calendar-quick-add-input"
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder='Try "Lunch with Sam 1pm"'
          autoComplete="off"
          className="w-full rounded-xl bg-[var(--quant-surface)] px-3 py-2.5 text-sm text-white placeholder:text-[var(--quant-muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
        />
        <div className="mt-2 min-h-[20px] text-xs" aria-live="polite">
          {parsed ? (
            <>
              <span className="text-[var(--app-accent)]">
                {parsed.title} · {formatPreview(parsed)}
              </span>
              {inviteNote && (
                <span className="mt-1 block text-[var(--quant-muted-foreground)]">
                  Guests: {inviteNote}
                </span>
              )}
            </>
          ) : text.trim() ? (
            <span className="text-[var(--quant-muted-foreground)]">
              No date or time found — Enter opens the full editor with this title.
            </span>
          ) : (
            <span className="text-[var(--quant-muted-foreground)]">
              Type a title plus a time, like “Dentist tomorrow at 9am”.
            </span>
          )}
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || saving}
            className="rounded-xl bg-[var(--app-accent)] px-4 py-2 text-xs font-bold text-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {saving ? 'Adding…' : parsed ? 'Add event' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
