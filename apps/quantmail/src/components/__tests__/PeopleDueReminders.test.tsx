// ============================================================================
// PeopleDueReminders — due-date DELIVERY for follow-up reminders.
// fix/qm-followup-resurface (P1 inbox-people): persistence landed earlier
// (POST /follow-up-reminders upserts one row per (user, thread)) but no code
// ever surfaced a due reminder — four comments claimed the People home
// resurfaces them and none did. These tests prove the delivery half:
//   - isReminderDue: past => due, future => not due, garbage => never a lie
//   - matchReminderConversation: threadId first, emailId fallback, null when
//     the thread's mail isn't in the loaded window
//   - the strip renders due rows with the real person's name (never fake
//     data), excludes future/bad rows, falls back to the thread deep-link
//     when unmatched, and always offers a working Dismiss.
// Static markup (no @testing-library/react — the apps/quantmail package has
// no such dependency and CI runs --frozen-lockfile).
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isReminderDue,
  matchReminderConversation,
  PeopleDueReminders,
} from '../PeopleDueReminders';
import type { FollowUpReminder } from '../../services/api-client';
import type { PersonConversation } from '../../lib/peopleGrouping';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// PeopleDueReminders imports formatRelativeTime from ./PeopleList, which
// pulls @quant/shared-ui at module scope. The shared-ui mock keeps this a
// pure static-markup test (same pattern as people-home-pagination.test.tsx).
vi.mock('@quant/shared-ui', () => ({
  Skeleton: () => null,
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

const HOUR = 3_600_000;

function reminder(over: Partial<FollowUpReminder> = {}): FollowUpReminder {
  return {
    id: 'r1',
    emailId: 'm1',
    threadId: 't1',
    subject: 'Dinner plans',
    remindAt: new Date(Date.now() - HOUR).toISOString(),
    createdAt: new Date(Date.now() - 2 * HOUR).toISOString(),
    ...over,
  };
}

function convo(over: Record<string, unknown> = {}): PersonConversation {
  return {
    personKey: 'alice@example.com',
    name: 'Alice',
    email: 'alice@example.com',
    messages: [],
    lastMessage: { snippet: 'are we still on for friday?' } as never,
    lastActivityAt: new Date(),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: [],
    hasGroupMessages: false,
    ...over,
  } as PersonConversation;
}

function renderStrip(reminders: FollowUpReminder[], conversations: PersonConversation[] = []) {
  return renderToStaticMarkup(
    <PeopleDueReminders conversations={conversations} onSelect={() => {}} reminders={reminders} />,
  );
}

describe('isReminderDue', () => {
  it('is due when remindAt has passed', () => {
    expect(isReminderDue(reminder({ remindAt: new Date(Date.now() - 1000).toISOString() }))).toBe(
      true,
    );
  });

  it('is not due while remindAt is in the future', () => {
    expect(
      isReminderDue(reminder({ remindAt: new Date(Date.now() + HOUR).toISOString() })),
    ).toBe(false);
  });

  it('never treats a garbage remindAt as a reminder (no lying rows)', () => {
    expect(isReminderDue(reminder({ remindAt: 'not-a-date' }))).toBe(false);
    expect(isReminderDue(reminder({ remindAt: '' }))).toBe(false);
  });
});

describe('matchReminderConversation', () => {
  it('matches by threadId first', () => {
    const c = convo({ messages: [{ id: 'm9', threadId: 't1' }] });
    expect(matchReminderConversation(reminder({ threadId: 't1', emailId: 'zzz' }), [c])).toBe(c);
  });

  it('falls back to emailId for legacy rows with a null threadId', () => {
    const c = convo({ messages: [{ id: 'm1', threadId: 't-other' }] });
    expect(matchReminderConversation(reminder({ threadId: null, emailId: 'm1' }), [c])).toBe(c);
  });

  it('returns null when the thread mail is not in the loaded window', () => {
    const c = convo({ messages: [{ id: 'm9', threadId: 't9' }] });
    expect(matchReminderConversation(reminder(), [c])).toBeNull();
    expect(matchReminderConversation(reminder(), [])).toBeNull();
  });
});

describe('PeopleDueReminders strip', () => {
  it('renders nothing when there are no reminders', () => {
    expect(renderStrip([], [convo()])).toBe('');
  });

  it('renders nothing when no reminder is due yet (future rows stay invisible)', () => {
    const html = renderStrip(
      [reminder({ remindAt: new Date(Date.now() + HOUR).toISOString() })],
      [convo()],
    );
    expect(html).toBe('');
  });

  it('renders nothing for an unparseable remindAt (never a lying row)', () => {
    expect(renderStrip([reminder({ remindAt: 'garbage' })], [convo()])).toBe('');
  });

  it('renders the due row with the REAL person name and an overdue label', () => {
    const c = convo({ messages: [{ id: 'm1', threadId: 't1' }] });
    const html = renderStrip([reminder()], [c]);
    expect(html).toContain('Due reminders');
    expect(html).toContain('data-testid="due-reminder-row"');
    expect(html).toContain('Alice');
    // 1 hour overdue — the label is honest, derived from the real remindAt.
    expect(html).toContain('Due 1h');
    expect(html).toContain('aria-label="Open follow-up: Alice"');
  });

  it('falls back to the subject + thread deep-link when the thread mail is not loaded', () => {
    const html = renderStrip([reminder({ subject: 'Dinner plans' })], [convo()]);
    // Honest fallback: no invented person — the reminder's own subject.
    expect(html).toContain('Dinner plans');
    expect(html).toContain('aria-label="Open follow-up: Dinner plans"');
    // And a working Dismiss (DELETE), never a dead row.
    expect(html).toContain('aria-label="Dismiss reminder: Dinner plans"');
  });

  it('does not offer a dead link when neither conversation nor threadId exists', () => {
    const html = renderStrip(
      [reminder({ threadId: null, emailId: 'm-unknown' })],
      [convo()],
    );
    expect(html).toContain('aria-label="Follow-up due: Dinner plans"');
    expect(html).not.toContain('aria-label="Open follow-up:');
    // Dismiss still works — the row is never a trap.
    expect(html).toContain('aria-label="Dismiss reminder: Dinner plans"');
  });

  it('keeps 44px minimum touch targets on the dismiss control', () => {
    const html = renderStrip([reminder()], [convo()]);
    expect(html).toContain('min-h-[44px]');
    expect(html).toContain('min-w-[44px]');
  });

  it('is NEVER a positioned overlay — in normal document flow above the list', () => {
    const c = convo({ messages: [{ id: 'm1', threadId: 't1' }] });
    const html = renderStrip([reminder()], [c]);
    const sectionClass = html.match(/<section[^>]*class="([^"]*)"/)?.[1] ?? '';
    expect(sectionClass).not.toContain('fixed');
    expect(sectionClass).not.toContain('absolute');
    expect(sectionClass).not.toContain('sticky');
  });
});
