// @vitest-environment jsdom
// ============================================================================
// PeopleList — the conversation list of the unified People view.
//
// Renders the REAL component and drives the REAL controls, asserting only
// observable behaviour: rows render, the search box filters them, the unread
// pill appears exactly when the real unread count is above zero, and tapping a
// row calls onSelect with that conversation.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PeopleList, formatRelativeTime } from '../components/PeopleList';
import { groupEmailsByPerson, type PersonConversation } from '../lib/peopleGrouping';
import type { Email } from '../types';

// React 19's act(...) requires this flag in the test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// framer-motion's useReducedMotion (used by Skeleton) reads matchMedia, which
// jsdom does not implement. The shim is a test-environment concern, not product
// behaviour: reduced-motion is off so skeletons render their default markup.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const ME = 'me@quantmail.in';

let seq = 0;
const at = (iso: string) => new Date(iso);

const email = (over: Partial<Email> & { isSent?: boolean }): Email =>
  ({
    id: `m${++seq}`,
    threadId: `t${seq}`,
    userId: 'u1',
    from: { email: ME },
    to: [],
    cc: [],
    bcc: [],
    subject: '',
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
    references: [],
    headers: {},
    receivedAt: at('2026-10-10T10:00:00Z'),
    createdAt: at('2026-10-10T10:00:00Z'),
    updatedAt: at('2026-10-10T10:00:00Z'),
    ...over,
  }) as Email;

function fixtureConversations(): PersonConversation[] {
  const aliceInbound = email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'are we still on for friday?',
    isRead: false,
    receivedAt: at('2026-10-10T09:00:00Z'),
  });
  const aliceInboundRead = email({
    from: { email: 'alice@example.com', name: 'Alice' },
    to: [{ email: ME }],
    subject: 'Dinner',
    snippet: 'let me know',
    isRead: true,
    receivedAt: at('2026-10-10T09:01:00Z'),
  });
  const bobInbound = email({
    from: { email: 'bob@example.com', name: 'Bob' },
    to: [{ email: ME }],
    subject: 'Report',
    snippet: 'the quarterly report is ready',
    isRead: true,
    receivedAt: at('2026-10-10T08:00:00Z'),
  });
  // Alice: 1 real unread. Bob: 0.
  return groupEmailsByPerson([aliceInbound, aliceInboundRead, bobInbound], ME);
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(ui: React.ReactElement): HTMLDivElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(ui);
  });
  return host;
}

afterEach(() => {
  if (root) {
    act(() => {
      root!.unmount();
    });
  }
  root = null;
  host?.remove();
  host = null;
});

function rowButtons(container: ParentNode): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('li > button'));
}

function setSearchValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Stateful harness: the search box is controlled, like the real parent. */
function Harness({
  conversations,
  onSelect,
}: {
  conversations: PersonConversation[];
  onSelect: (c: PersonConversation) => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <PeopleList
      conversations={conversations}
      onSelect={onSelect}
      searchQuery={query}
      onSearchQuery={setQuery}
    />
  );
}

describe('PeopleList', () => {
  it('renders one row per conversation with name, snippet, and relative time', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    const rows = rowButtons(el);
    expect(rows).toHaveLength(2);
    expect(el.textContent).toContain('Alice');
    expect(el.textContent).toContain('Bob');
    // Snippet of the latest message per conversation (1-line preview).
    expect(el.textContent).toContain('let me know');
    expect(el.textContent).toContain('the quarterly report is ready');
    // Placeholder copy is honest, not marketing.
    expect(el.querySelector('input')?.placeholder).toBe('Search people and messages');
  });

  it('shows the unread pill with the real count only when it is above zero', () => {
    const conversations = fixtureConversations();
    const el = render(
      <PeopleList
        conversations={conversations}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
      />,
    );

    const pills = el.querySelectorAll('[data-testid="unread-count"]');
    // Alice has exactly 1 real unread; Bob has 0 and renders no pill.
    expect(pills).toHaveLength(1);
    expect(pills[0].textContent).toBe('1');
    const aliceRow = rowButtons(el).find((b) => b.textContent?.includes('Alice'))!;
    expect(aliceRow.getAttribute('aria-label')).toBe('Alice, 1 unread');
    const bobRow = rowButtons(el).find((b) => b.textContent?.includes('Bob'))!;
    expect(bobRow.getAttribute('aria-label')).toBe('Bob');
  });

  it('filters rows as the search query changes (name, email, subject, snippet)', () => {
    const conversations = fixtureConversations();
    const el = render(<Harness conversations={conversations} onSelect={() => {}} />);
    const input = el.querySelector('input')!;

    setSearchValue(input, 'quarterly');
    expect(rowButtons(el)).toHaveLength(1);
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).not.toContain('Alice');

    setSearchValue(input, 'alice@example.com');
    expect(rowButtons(el)).toHaveLength(1);
    expect(el.textContent).toContain('Alice');
  });

  it('shows the honest empty states', () => {
    const empty = render(
      <PeopleList conversations={[]} onSelect={() => {}} searchQuery="" onSearchQuery={() => {}} />,
    );
    expect(empty.textContent).toContain('No conversations yet');

    const noMatch = render(
      <Harness conversations={fixtureConversations()} onSelect={() => {}} />,
    );
    setSearchValue(noMatch.querySelector('input')!, 'zzz-no-such-person');
    expect(rowButtons(noMatch)).toHaveLength(0);
    expect(noMatch.textContent).toContain('No matches');
  });

  it('calls onSelect with the tapped conversation', () => {
    const conversations = fixtureConversations();
    const onSelect = vi.fn();
    const el = render(<Harness conversations={conversations} onSelect={onSelect} />);

    const bobRow = rowButtons(el).find((b) => b.textContent?.includes('Bob'))!;
    act(() => {
      bobRow.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ personKey: 'bob@example.com' }),
    );
    // The exact conversation object, not a copy.
    expect(onSelect.mock.calls[0][0]).toBe(
      conversations.find((c) => c.personKey === 'bob@example.com'),
    );
  });

  it('renders skeleton rows while loading', () => {
    const el = render(
      <PeopleList
        conversations={[]}
        onSelect={() => {}}
        searchQuery=""
        onSearchQuery={() => {}}
        loading
      />,
    );
    expect(el.querySelector('[role="status"]')).not.toBeNull();
    expect(rowButtons(el)).toHaveLength(0);
  });
});

describe('formatRelativeTime', () => {
  it('says "now" for the last minute and "Xm"/"Xh" within the day', () => {
    expect(formatRelativeTime(new Date(Date.now() - 30_000))).toBe('now');
    expect(formatRelativeTime(new Date(Date.now() - 5 * 60_000))).toBe('5m');
    expect(formatRelativeTime(new Date(Date.now() - 2 * 3_600_000))).toBe('2h');
  });

  it('says "Yesterday" for the previous calendar day', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(12, 0, 0, 0);
    expect(formatRelativeTime(yesterday)).toBe('Yesterday');
  });
});
