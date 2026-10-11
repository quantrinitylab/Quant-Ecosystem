// @vitest-environment jsdom
// ============================================================================
// QM-SCREEN-005 R2 — PersonThread mounts the sender-safety banner.
//
// The people-view thread must render EmailSafetyBanner for inbound messages
// (wired to the real phishing scan via usePhishingCheck) and nothing for the
// user's own sends.
// ============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';

import type { PhishingCheckResult } from '../hooks/usePhishingCheck';

const usePhishingCheckMock = vi.hoisted(() =>
  vi.fn((emailId: string): PhishingCheckResult => ({
    status: emailId === 'm-phish' ? 'warning' : 'clear',
    isPhishing: emailId === 'm-phish',
    confidence: emailId === 'm-phish' ? 91 : 2,
    indicators: emailId === 'm-phish' ? ['lookalike domain'] : [],
  })),
);
vi.mock('../hooks/usePhishingCheck', () => ({
  usePhishingCheck: (...args: unknown[]) => usePhishingCheckMock(...args),
}));

import { PersonThread, type PersonConversation } from '../components/PersonThread';
import type { Email } from '../types';

const ME = 'me@quantmail.in';
const SPOOFER = 'spoofer@evil.example';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: SPOOFER, name: 'Spoofer' },
    to: [{ email: ME }],
    cc: [],
    bcc: [],
    subject: 'Urgent',
    bodyText: 'send money now',
    bodyHtml: '',
    snippet: 'send money now',
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
    headers: {},
    ...partial,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderThread(conversation: PersonConversation) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      React.createElement(PersonThread, {
        conversation,
        currentUserEmail: ME,
      }),
    );
  });
  return container;
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('PersonThread sender-safety wiring', () => {
  it('mounts the safety banner on inbound messages, with the real scan result', () => {
    const messages = [
      makeEmail({ id: 'm-phish', receivedAt: new Date('2026-10-10T08:00:00Z') }),
      makeEmail({
        id: 'm-clean',
        from: { email: 'pal@example.com', name: 'Pal' },
        receivedAt: new Date('2026-10-10T08:01:00Z'),
      }),
    ];
    const el = renderThread({
      personKey: SPOOFER,
      name: 'Spoofer',
      email: SPOOFER,
      messages,
      lastMessage: messages[1],
      lastActivityAt: new Date('2026-10-10T08:01:00Z'),
      unreadCount: 0,
      lastMessageFromMe: false,
      world: 'log',
      participantEmails: [ME, SPOOFER],
      hasGroupMessages: false,
    });

    // The clean inbound message gets the external-sender indicator. The
    // flagged one shows the phishing warning instead — the external note is
    // redundant next to a red alert.
    const externals = el.querySelectorAll('[data-testid="safety-banner-external"]');
    expect(externals.length).toBe(1);

    // The flagged message carries the phishing warning with its indicators.
    const warnings = el.querySelectorAll('[data-testid="safety-banner-warning"]');
    expect(warnings.length).toBe(1);
    expect(warnings[0].textContent).toContain('This message looks suspicious');
    expect(warnings[0].textContent).toContain('lookalike domain');

    // The hook was asked to scan each inbound message id.
    expect(usePhishingCheckMock).toHaveBeenCalledWith('m-phish', { enabled: true });
    expect(usePhishingCheckMock).toHaveBeenCalledWith('m-clean', { enabled: true });
  });

  it('renders no safety banner on the user\u2019s own sends', () => {
    const messages = [
      makeEmail({
        id: 'm-mine',
        from: { email: ME, name: 'Me' },
        to: [{ email: SPOOFER }],
        receivedAt: new Date('2026-10-10T08:02:00Z'),
      }),
    ];
    const el = renderThread({
      personKey: SPOOFER,
      name: 'Spoofer',
      email: SPOOFER,
      messages,
      lastMessage: messages[0],
      lastActivityAt: new Date('2026-10-10T08:02:00Z'),
      unreadCount: 0,
      lastMessageFromMe: true,
      world: 'log',
      participantEmails: [ME, SPOOFER],
      hasGroupMessages: false,
    });
    expect(el.querySelector('[data-testid="safety-banner-warning"]')).toBeNull();
    expect(el.querySelector('[data-testid="safety-banner-external"]')).toBeNull();
    expect(el.querySelector('[data-testid="safety-banner-checking"]')).toBeNull();
  });
});
