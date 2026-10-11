// @vitest-environment jsdom
// ============================================================================
// QM-SCREEN-005 R2 P2 bundle — ThreadRelatedPanel contract pins.
//
// 1. Subject-change separator parity: "Naya vishay: <subject>" only on genuine
//    subject changes (Re:/Fwd: prefixes ignored), same contract as PersonThread.
// 2. QuantyThreadEvidence: honest hidden state — no drafts means no DOM at all;
//    real draft rows render the compact evidence section.
// 3. ThreadRelatedSection: real relations only — thread attachments aggregate,
//    calendar events come from GET /events filtered by attendee overlap, and the
//    honest "No related items" empty state appears when both are empty.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';
import {
  aggregateThreadFiles,
  filterEventsByAttendees,
  normalizeSubjectForChange,
  QuantyThreadEvidence,
  SubjectChangeSeparator,
  subjectChangedNewSubject,
  ThreadRelatedSection,
  type QuantyThreadDraft,
} from '../components/ThreadRelatedPanel';
import type { CalendarEvent, Email, EmailAttachment } from '../types';

const { getEventsMock } = vi.hoisted(() => ({ getEventsMock: vi.fn() }));

vi.mock('../services/api-client', () => ({
  apiClient: { getEvents: getEventsMock },
}));

const ME = 'me@quantmail.in';
const FRIEND = 'friend@example.com';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: FRIEND, name: 'Friend' },
    to: [{ email: ME }],
    cc: [],
    bcc: [],
    subject: 'Hello',
    bodyText: '',
    bodyHtml: '',
    snippet: '',
    priority: 'normal',
    category: 'primary',
    status: 'delivered',
    isRead: true,
    isStarred: false,
    isArchived: false,
    isDraft: false,
    labels: [],
    attachments: [],
    receivedAt: new Date('2026-10-10T08:00:00Z'),
    ...partial,
  };
}

function makeAttachment(partial: Partial<EmailAttachment> & { id: string }): EmailAttachment {
  return {
    id: partial.id,
    emailId: 'm1',
    filename: partial.filename ?? 'file.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    url: 'https://example.com/file.pdf',
    isInline: false,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    ...partial,
  } as EmailAttachment;
}

function makeEvent(partial: {
  id: string;
  title: string;
  attendees: string[];
  startTime: string;
  location?: string;
}): CalendarEvent {
  return {
    id: partial.id,
    title: partial.title,
    location: partial.location,
    startTime: new Date(partial.startTime),
    endTime: new Date(partial.startTime),
    attendees: partial.attendees.map((email) => ({
      email,
      rsvp: 'needsAction',
      isOrganizer: false,
    })),
  } as unknown as CalendarEvent;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(node: React.ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
    root = null;
  }
  container?.remove();
  container = null;
});

beforeEach(() => {
  getEventsMock.mockReset();
});

// ---------------------------------------------------------------------------
// Subject-change detection
// ---------------------------------------------------------------------------

describe('normalizeSubjectForChange', () => {
  it('strips Re:/Fwd: prefixes repeatedly and case-insensitively', () => {
    expect(normalizeSubjectForChange('Re: Budget')).toBe('budget');
    expect(normalizeSubjectForChange('FWD: re:  Budget')).toBe('budget');
    expect(normalizeSubjectForChange('re:re:Budget')).toBe('budget');
  });

  it('trims and lowercases without touching the core', () => {
    expect(normalizeSubjectForChange('  Project X  ')).toBe('project x');
    expect(normalizeSubjectForChange('Review')).toBe('review');
  });

  it('handles empty/undefined', () => {
    expect(normalizeSubjectForChange('')).toBe('');
    expect(normalizeSubjectForChange(undefined)).toBe('');
    expect(normalizeSubjectForChange(null)).toBe('');
  });
});

describe('subjectChangedNewSubject', () => {
  it('returns the new raw subject only on a genuine change', () => {
    const messages = [
      makeEmail({ id: 'm1', subject: 'Kickoff' }),
      makeEmail({ id: 'm2', subject: 'Re: Kickoff' }),
      makeEmail({ id: 'm3', subject: 'Budget v2' }),
    ];
    expect(subjectChangedNewSubject(messages, 0)).toBeNull();
    expect(subjectChangedNewSubject(messages, 1)).toBeNull();
    expect(subjectChangedNewSubject(messages, 2)).toBe('Budget v2');
  });

  it('ignores case and empty subjects', () => {
    expect(
      subjectChangedNewSubject(
        [makeEmail({ id: 'a', subject: 'Kickoff' }), makeEmail({ id: 'b', subject: 'KICKOFF' })],
        1,
      ),
    ).toBeNull();
    expect(
      subjectChangedNewSubject(
        [makeEmail({ id: 'a', subject: 'Kickoff' }), makeEmail({ id: 'b', subject: '' })],
        1,
      ),
    ).toBeNull();
  });

  it('detects a subject appearing after an empty one', () => {
    expect(
      subjectChangedNewSubject(
        [makeEmail({ id: 'a', subject: '' }), makeEmail({ id: 'b', subject: 'Plans' })],
        1,
      ),
    ).toBe('Plans');
  });

  it('returns null out of range', () => {
    const messages = [makeEmail({ id: 'a', subject: 'X' })];
    expect(subjectChangedNewSubject(messages, -1)).toBeNull();
    expect(subjectChangedNewSubject(messages, 1)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Separator render
// ---------------------------------------------------------------------------

describe('SubjectChangeSeparator', () => {
  it('renders the user-locked "Naya vishay:" separator', () => {
    const el = mount(<SubjectChangeSeparator subject="Budget v2" />);
    const separator = el.querySelector('[data-testid="subject-change"]');
    expect(separator).not.toBeNull();
    expect(separator!.textContent).toContain('Naya vishay: Budget v2');
    expect(separator!.getAttribute('aria-label')).toBe('Subject changed to Budget v2');
  });
});

// ---------------------------------------------------------------------------
// Quanty evidence — honest hidden state
// ---------------------------------------------------------------------------

describe('QuantyThreadEvidence', () => {
  it('renders nothing when there are no drafts (no invented UI)', () => {
    const el = mount(<QuantyThreadEvidence drafts={[]} />);
    expect(el.querySelector('[data-testid="quanty-thread-evidence"]')).toBeNull();
    expect(el.innerHTML).toBe('');
  });

  it('renders a compact draft + evidence section for real draft rows', () => {
    const drafts: QuantyThreadDraft[] = [
      {
        id: 'draft-1',
        subject: 'Re: Budget',
        body: 'Thanks for the update — approved.',
        confidence: 0.92,
        evidence: [{ messageId: 'm1', excerpt: 'Please approve the budget' }],
      },
    ];
    const el = mount(<QuantyThreadEvidence drafts={drafts} />);
    expect(el.querySelector('[data-testid="quanty-draft"]')).not.toBeNull();
    expect(el.textContent).toContain('Thanks for the update — approved.');
    expect(el.textContent).toContain('Quanty confidence: 92%');
    const evidence = el.querySelector('[data-testid="quanty-evidence"]');
    expect(evidence).not.toBeNull();
    expect(evidence!.textContent).toContain('Please approve the budget');
  });
});

// ---------------------------------------------------------------------------
// Pure relation helpers
// ---------------------------------------------------------------------------

describe('aggregateThreadFiles', () => {
  it('aggregates attachments thread-wide, deduped by id', () => {
    const a = makeAttachment({ id: 'att-1', filename: 'deck.pdf' });
    const b = makeAttachment({ id: 'att-2', filename: 'notes.txt' });
    const messages = [
      makeEmail({ id: 'm1', attachments: [a] }),
      makeEmail({ id: 'm2', attachments: [a, b] }),
    ];
    const files = aggregateThreadFiles(messages);
    expect(files.map((f) => f.id)).toEqual(['att-1', 'att-2']);
  });

  it('returns [] when no message carries attachments', () => {
    expect(aggregateThreadFiles([makeEmail({ id: 'm1' })])).toEqual([]);
  });
});

describe('filterEventsByAttendees', () => {
  it('keeps events sharing an attendee with the thread, sorted by start time', () => {
    const early = makeEvent({
      id: 'e1',
      title: 'Design review',
      attendees: [FRIEND.toUpperCase()],
      startTime: '2026-10-10T09:00:00Z',
    });
    const late = makeEvent({
      id: 'e2',
      title: 'Lunch',
      attendees: [FRIEND],
      startTime: '2026-10-10T13:00:00Z',
    });
    const unrelated = makeEvent({
      id: 'e3',
      title: 'Dentist',
      attendees: ['dentist@example.com'],
      startTime: '2026-10-10T10:00:00Z',
    });
    const matched = filterEventsByAttendees([late, unrelated, early], [FRIEND, ME]);
    expect(matched.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('returns [] when there are no participants', () => {
    const event = makeEvent({
      id: 'e1',
      title: 'Design review',
      attendees: [FRIEND],
      startTime: '2026-10-10T09:00:00Z',
    });
    expect(filterEventsByAttendees([event], [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Related section render (apiClient mocked — real-data wiring, no invented rows)
// ---------------------------------------------------------------------------

describe('ThreadRelatedSection', () => {
  it('renders thread files and attendee-matched events from real API data', async () => {
    const related = makeEvent({
      id: 'e1',
      title: 'Design review',
      attendees: [FRIEND],
      startTime: '2026-10-10T09:00:00Z',
      location: 'Room 3',
    });
    const unrelated = makeEvent({
      id: 'e2',
      title: 'Dentist',
      attendees: ['dentist@example.com'],
      startTime: '2026-10-10T10:00:00Z',
    });
    getEventsMock.mockResolvedValue({ success: true, data: [related, unrelated] });

    const messages = [
      makeEmail({
        id: 'm1',
        attachments: [makeAttachment({ id: 'att-1', filename: 'deck.pdf', size: 2048 })],
      }),
    ];
    const el = mount(<ThreadRelatedSection messages={messages} currentEmail={ME} />);
    await act(async () => {});

    expect(el.querySelector('[data-testid="thread-related"]')).not.toBeNull();
    const files = el.querySelectorAll('[data-testid="related-file"]');
    expect(files).toHaveLength(1);
    expect(files[0].textContent).toContain('deck.pdf');
    const events = el.querySelectorAll('[data-testid="related-event"]');
    expect(events).toHaveLength(1);
    expect(events[0].textContent).toContain('Design review');

    // The date window covers the thread's messages ±1 day.
    expect(getEventsMock).toHaveBeenCalledTimes(1);
    const args = getEventsMock.mock.calls[0][0] as { start: string; end: string };
    expect(new Date(args.start).getTime()).toBeLessThan(
      new Date('2026-10-10T08:00:00Z').getTime(),
    );
    expect(new Date(args.end).getTime()).toBeGreaterThan(
      new Date('2026-10-10T08:00:00Z').getTime(),
    );
  });

  it('shows the honest empty state when nothing is related', async () => {
    getEventsMock.mockResolvedValue({ success: true, data: [] });
    const el = mount(
      <ThreadRelatedSection messages={[makeEmail({ id: 'm1' })]} currentEmail={ME} />,
    );
    await act(async () => {});
    expect(el.textContent).toContain('No related items');
    expect(el.querySelectorAll('[data-testid="related-file"]')).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="related-event"]')).toHaveLength(0);
  });

  it('degrades gracefully when the events fetch fails', async () => {
    getEventsMock.mockRejectedValue(new Error('network down'));
    const messages = [
      makeEmail({
        id: 'm1',
        attachments: [makeAttachment({ id: 'att-1', filename: 'deck.pdf' })],
      }),
    ];
    const el = mount(<ThreadRelatedSection messages={messages} currentEmail={ME} />);
    await act(async () => {});
    // The section still renders the files the thread already carries.
    expect(el.querySelectorAll('[data-testid="related-file"]')).toHaveLength(1);
    expect(el.textContent).not.toContain('Checking calendar');
  });
});
