// @vitest-environment jsdom
// ============================================================================
// PersonThread AI summary entry point (fix/qm-mobile-ai-summary).
//
// The finding: Superhuman places a 1-line AI summary above every
// conversation on mobile, but QuantMail's default mobile conversation view
// (PersonThread, the People view) opened with no AI summary at all —
// ConversationalThreadView had ThreadSummaryCard since QM-UIUX-046, while
// AISummaryCard shipped with zero render sites. PersonThread now renders
// ThreadSummaryCard above the message stream, wired to the real backend
// (`POST /api/ai/summarize-thread`) through the same handler shape as the
// thread view, and the dead AISummaryCard component is removed.
//
// Test convention (2026-10-13): apps/quantmail has no @testing-library/react
// and CI installs frozen, so assertions go through renderToStaticMarkup.
// The trigger renders without invoking onSummarize (that only fires on
// click), so no api-client mock is needed here.
// ============================================================================

import { describe, it, expect } from 'vitest';
import React from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// framer-motion (used by ThreadSummaryCard) reads matchMedia, which jsdom
// does not implement. Same test-environment shim as PersonThread.test.tsx.
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
import { renderToStaticMarkup } from 'react-dom/server';
import { PersonThread, type PersonConversation } from '../components/PersonThread';
import type { Email } from '../types';

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
    bodyText: 'hello there',
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

function makeConversation(messages: Email[]): PersonConversation {
  return {
    personKey: 'friend@example.com',
    name: 'Friend',
    email: FRIEND,
    messages,
    lastMessage: messages[messages.length - 1],
    lastActivityAt: new Date('2026-10-10T08:05:00Z'),
    unreadCount: 0,
    lastMessageFromMe: false,
    world: 'log',
    participantEmails: [ME, FRIEND],
    hasGroupMessages: false,
  };
}

function renderConversation(messages: Email[]): string {
  return renderToStaticMarkup(
    <PersonThread conversation={makeConversation(messages)} currentUserEmail={ME} />,
  );
}

describe('PersonThread AI summary entry point (fix/qm-mobile-ai-summary)', () => {
  it('renders the Summarize thread trigger above the conversation', () => {
    const html = renderConversation([makeEmail({ id: 'm1' })]);
    expect(html).toContain('aria-label="Summarize this conversation"');
    expect(html).toContain('Summarize thread');
  });

  it('places the summary trigger before the first message bubble', () => {
    const html = renderConversation([
      makeEmail({ id: 'm1', bodyText: 'first message body' }),
      makeEmail({ id: 'm2', bodyText: 'second message body' }),
    ]);
    const triggerAt = html.indexOf('Summarize thread');
    const firstMessageAt = html.indexOf('data-testid="thread-message"');
    expect(triggerAt).toBeGreaterThan(-1);
    expect(firstMessageAt).toBeGreaterThan(-1);
    expect(triggerAt).toBeLessThan(firstMessageAt);
  });

  it('renders no summary trigger for an empty conversation', () => {
    const html = renderConversation([]);
    expect(html).not.toContain('Summarize thread');
    expect(html).toContain('No messages yet.');
  });

  it('renders the trigger in the updates world too (summaries are not replies)', () => {
    const conversation = makeConversation([makeEmail({ id: 'm1' })]);
    conversation.world = 'updates';
    const html = renderToStaticMarkup(
      <PersonThread conversation={conversation} currentUserEmail={ME} />,
    );
    expect(html).toContain('Summarize thread');
  });
});
