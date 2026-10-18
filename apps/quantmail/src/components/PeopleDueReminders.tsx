'use client';

/**
 * PeopleDueReminders — the missing delivery half of follow-up reminders.
 *
 * fix/qm-followup-resurface (P1 inbox-people): persistence landed earlier
 * (POST /follow-up-reminders upserts one row per (user, thread)) but nothing
 * ever delivered a due reminder — four code comments claimed "the People
 * home resurfaces due reminders at the top of the conversation list
 * (Superhuman/Gmail-nudge style)" and no such code existed. This component
 * is that code: it fetches the real active reminders from
 * GET /follow-up-reminders on mount (re-polling while mounted so a
 * reminder whose remindAt just passed gets nudged without a reload),
 * keeps only the DUE rows (remindAt <= now; future reminders are not
 * deliverable yet and stay invisible), and renders them in a strip at the
 * top of the People home. Tapping a row opens the matching conversation;
 * when the thread's mail isn't in the loaded window it deep-links to the
 * thread view instead — honest, never a fake row.
 *
 * Honest degrades: a failed fetch hides the strip silently (no fake
 * "reminders" from nothing); each row has a real Dismiss that DELETEs the
 * row; an unparseable remindAt is dropped, never rendered as a lie.
 *
 * Visual language: pure black, no divider lines, Mail orange
 * (`APP_THEMES.mail.accent`) accent, 44px minimum touch targets.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IdentityAvatar } from './IdentityAvatar';
import { IconBell } from './icons';
import { showToast } from './InboxToast';
import { apiClient, type FollowUpReminder } from '../services/api-client';
import { APP_THEMES } from '../lib/app-theme';
import { personSnippet, type PersonConversation } from '../lib/peopleGrouping';
import { formatRelativeTime } from './PeopleList';

const MAIL_ACCENT = APP_THEMES.mail.accent;

/** Re-poll cadence: a reminder whose remindAt just passed must surface
 *  without forcing the user to reload the home. */
const REMINDER_POLL_MS = 60_000;

/**
 * Due = remindAt has passed. An unparseable remindAt is NOT due — it is a
 * bad row, and a bad row must never render as a reminder.
 */
export function isReminderDue(reminder: FollowUpReminder, now: number = Date.now()): boolean {
  const at = new Date(reminder.remindAt).getTime();
  return !Number.isNaN(at) && at <= now;
}

/**
 * Match a reminder to a loaded conversation: first by threadId against any
 * message's threadId, then by emailId against any message id (legacy rows
 * have a null threadId). Returns null when the thread's mail is not in the
 * loaded window — the caller then falls back to the thread deep-link.
 */
export function matchReminderConversation(
  reminder: FollowUpReminder,
  conversations: PersonConversation[],
): PersonConversation | null {
  for (const conversation of conversations) {
    if (reminder.threadId) {
      const byThread = conversation.messages.some((m) => m.threadId === reminder.threadId);
      if (byThread) return conversation;
    }
    const byEmail = conversation.messages.some((m) => m.id === reminder.emailId);
    if (byEmail) return conversation;
  }
  return null;
}

export interface PeopleDueRemindersProps {
  conversations: PersonConversation[];
  onSelect: (c: PersonConversation) => void;
  /**
   * Test/render seam: when provided, the component renders from these rows
   * and performs no network fetch. Production passes nothing and the
   * component fetches from the real endpoint.
   */
  reminders?: FollowUpReminder[];
}

export function PeopleDueReminders({
  conversations,
  onSelect,
  reminders: remindersProp,
}: PeopleDueRemindersProps) {
  const router = useRouter();
  const [reminders, setReminders] = useState<FollowUpReminder[] | null>(remindersProp ?? null);
  const [now, setNow] = useState(() => Date.now());

  // Keep an injected prop authoritative in tests/static render; in
  // production this is undefined and the effect below owns the state.
  useEffect(() => {
    if (remindersProp !== undefined) setReminders(remindersProp);
  }, [remindersProp]);

  useEffect(() => {
    if (remindersProp !== undefined) return; // test seam: no network
    let cancelled = false;
    const load = () => {
      void apiClient
        .listFollowUpReminders()
        .then((res) => {
          if (cancelled || !res.success || !res.data) return;
          setReminders(res.data);
        })
        .catch(() => {
          // Honest degrade: a failed read hides the strip. Rendering fake
          // rows or an error banner for a non-critical nudge is worse.
        });
    };
    load();
    const timer = setInterval(() => {
      setNow(Date.now());
      load();
    }, REMINDER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [remindersProp]);

  const due = useMemo(
    () => (reminders ?? []).filter((r) => isReminderDue(r, now)),
    [reminders, now],
  );

  const handleDismiss = useCallback(
    async (reminder: FollowUpReminder) => {
      try {
        const res = await apiClient.dismissFollowUpReminder(reminder.id);
        if (!res.success) throw new Error(res.error?.message || 'Could not dismiss');
        setReminders((prev) => (prev ?? []).filter((r) => r.id !== reminder.id));
      } catch (err) {
        showToast({
          text:
            err instanceof Error && err.message
              ? `Couldn't dismiss the reminder — ${err.message}`
              : "Couldn't dismiss the reminder — please try again",
          type: 'error',
        });
      }
    },
    [],
  );

  const handleOpen = useCallback(
    (reminder: FollowUpReminder, conversation: PersonConversation | null) => {
      if (conversation) {
        onSelect(conversation);
        return;
      }
      // The thread's mail is not in the loaded window: deep-link to the
      // thread view, which loads by id. A reminder without a thread id and
      // without a loaded conversation cannot be opened honestly — it stays
      // visible with a working Dismiss instead of a dead link.
      if (reminder.threadId) {
        router.push(`/thread/${encodeURIComponent(reminder.threadId)}`);
      }
    },
    [onSelect, router],
  );

  if (due.length === 0) return null;

  return (
    <section aria-label="Due follow-up reminders" className="bg-black px-4 pt-3">
      <div className="flex items-center gap-2 px-1 pb-2">
        <span className="inline-flex" style={{ color: MAIL_ACCENT }} aria-hidden="true">
          <IconBell size={15} />
        </span>
        <h2 className="text-sm font-semibold text-white">Due reminders</h2>
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
          style={{ backgroundColor: MAIL_ACCENT }}
          aria-label={`${due.length} due`}
        >
          {due.length}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {due.map((reminder) => {
          const conversation = matchReminderConversation(reminder, conversations);
          const openable = Boolean(conversation || reminder.threadId);
          const title = conversation?.name ?? reminder.subject ?? 'Follow up';
          const subtitle = conversation
            ? personSnippet(conversation)
            : (reminder.subject ?? 'Follow-up reminder');
          const dueLabel = formatRelativeTime(new Date(reminder.remindAt));
          return (
            <li
              key={reminder.id}
              data-testid="due-reminder-row"
              className="flex items-center gap-3 rounded-2xl bg-[#141518] px-3 py-2.5"
            >
              {conversation ? (
                <IdentityAvatar name={conversation.name || conversation.email} size="md" />
              ) : (
                <span
                  className="flex size-10 flex-none items-center justify-center rounded-full bg-white/[0.06]"
                  style={{ color: MAIL_ACCENT }}
                  aria-hidden="true"
                >
                  <IconBell size={18} />
                </span>
              )}
              <button
                type="button"
                onClick={() => handleOpen(reminder, conversation)}
                disabled={!openable}
                aria-label={
                  openable ? `Open follow-up: ${title}` : `Follow-up due: ${title}`
                }
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span dir="auto" className="truncate text-[15px] font-semibold text-white">
                    {title}
                  </span>
                  <span
                    className="flex-none text-xs font-medium"
                    style={{ color: MAIL_ACCENT }}
                  >
                    {dueLabel ? `Due ${dueLabel}` : 'Due now'}
                  </span>
                </span>
                <span
                  dir="auto"
                  className="mt-0.5 block truncate text-sm text-zinc-400"
                >
                  {subtitle}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void handleDismiss(reminder)}
                aria-label={`Dismiss reminder: ${title}`}
                className="flex min-h-[44px] min-w-[44px] flex-none items-center justify-center rounded-full text-xl leading-none text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
