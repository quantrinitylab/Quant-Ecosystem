// @vitest-environment jsdom
// ============================================================================
// QM-SCREEN-005 R2 — EmailSafetyBanner honesty pins.
//
// The wired safety banner must: show the external-sender indicator for mail
// from outside the user's domain, surface the real backend phishing warning
// (with the detector's own indicators), show a loading state while the scan
// runs, and say "Safety check unavailable" — never an all-clear — when the
// scan fails. Outbound messages and same-domain mail show nothing.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';

// Silence React 19's "not configured to support act(...)" warning under vitest.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot, type Root } from 'react-dom/client';

import type { PhishingCheckResult } from '../hooks/usePhishingCheck';

const usePhishingCheckMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks/usePhishingCheck', () => ({
  usePhishingCheck: (...args: unknown[]) => usePhishingCheckMock(...args),
}));

import { EmailSafetyBanner } from '../components/EmailSafetyBanner';
import type { Email } from '../types';

const ME = 'me@quantmail.in';

function makeEmail(partial: Partial<Email> & { id: string }): Email {
  return {
    id: partial.id,
    createdAt: new Date('2026-10-10T08:00:00Z'),
    updatedAt: new Date('2026-10-10T08:00:00Z'),
    threadId: 'thread-1',
    userId: 'user-1',
    from: { email: 'stranger@evil.example', name: 'Stranger' },
    to: [{ email: ME }],
    cc: [],
    bcc: [],
    subject: 'Hello',
    bodyText: 'hi',
    bodyHtml: '',
    snippet: 'hi',
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

function scanResult(overrides: Partial<PhishingCheckResult> = {}): PhishingCheckResult {
  return {
    status: 'clear',
    isPhishing: false,
    confidence: 0,
    indicators: [],
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function renderBanner(email: Email, props: { currentUserEmail?: string; isOutbound?: boolean } = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container!);
    root.render(
      React.createElement(EmailSafetyBanner, {
        email,
        currentUserEmail: props.currentUserEmail ?? ME,
        isOutbound: props.isOutbound ?? false,
      }),
    );
  });
  return container;
}

beforeEach(() => {
  usePhishingCheckMock.mockReset();
  usePhishingCheckMock.mockReturnValue(scanResult());
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

describe('EmailSafetyBanner', () => {
  it('shows the external-sender indicator for mail outside the user domain', () => {
    const el = renderBanner(makeEmail({ id: 'm1' }));
    const external = el.querySelector('[data-testid="safety-banner-external"]');
    expect(external).not.toBeNull();
    expect(external!.textContent).toContain('External sender');
    expect(external!.textContent).toContain('evil.example');
  });

  it('shows nothing for same-domain mail with a clean scan', () => {
    const el = renderBanner(
      makeEmail({ id: 'm2', from: { email: 'boss@quantmail.in', name: 'Boss' } }),
    );
    expect(el.querySelector('[data-testid="safety-banner-external"]')).toBeNull();
    expect(el.querySelector('[data-testid="safety-banner-warning"]')).toBeNull();
    expect(el.textContent).toBe('');
  });

  it('shows the phishing warning with the detector indicators when the scan flags it', () => {
    usePhishingCheckMock.mockReturnValue(
      scanResult({
        status: 'warning',
        isPhishing: true,
        confidence: 94,
        indicators: ['mismatched reply-to', 'urgent money request'],
      }),
    );
    const el = renderBanner(makeEmail({ id: 'm3' }));
    const warning = el.querySelector('[data-testid="safety-banner-warning"]');
    expect(warning).not.toBeNull();
    expect(warning!.getAttribute('role')).toBe('alert');
    expect(warning!.textContent).toContain('This message looks suspicious');
    expect(warning!.textContent).toContain('mismatched reply-to');
    expect(warning!.textContent).toContain('urgent money request');
  });

  it('shows a loading state while the scan runs', () => {
    usePhishingCheckMock.mockReturnValue(scanResult({ status: 'loading' }));
    const el = renderBanner(makeEmail({ id: 'm4' }));
    const checking = el.querySelector('[data-testid="safety-banner-checking"]');
    expect(checking).not.toBeNull();
    expect(checking!.textContent).toContain('Checking sender safety');
  });

  it('shows "Safety check unavailable" — never an all-clear — when the scan fails', () => {
    usePhishingCheckMock.mockReturnValue(
      scanResult({ status: 'unavailable', errorCode: 'AI_UNAVAILABLE' }),
    );
    const el = renderBanner(makeEmail({ id: 'm5' }));
    const unavailable = el.querySelector('[data-testid="safety-banner-unavailable"]');
    expect(unavailable).not.toBeNull();
    expect(unavailable!.textContent).toContain('Safety check unavailable');
    expect(el.querySelector('[data-testid="safety-banner-warning"]')).toBeNull();
    // The external-sender indicator still shows: it is computed locally and
    // is not a verdict on the phishing scan.
    expect(el.querySelector('[data-testid="safety-banner-external"]')).not.toBeNull();
  });

  it('never scans or renders for outbound messages', () => {
    const el = renderBanner(
      makeEmail({ id: 'm6', from: { email: ME, name: 'Me' } }),
      { isOutbound: true },
    );
    // The hook still mounts (React rules) but stays disabled — no scan fires.
    expect(usePhishingCheckMock).toHaveBeenCalledWith('m6', { enabled: false });
    expect(el.textContent).toBe('');
  });

  it('asks the hook for a scan on inbound messages with an id', () => {
    renderBanner(makeEmail({ id: 'm7' }));
    expect(usePhishingCheckMock).toHaveBeenCalledWith('m7', { enabled: true });
  });

  it('renders a real unsubscribe link only when the header carries a real URL', () => {
    const withUrl = renderBanner(
      makeEmail({
        id: 'm8',
        headers: { 'list-unsubscribe': '<https://evil.example/unsub?id=9>' },
      }),
    );
    const link = withUrl.querySelector('[data-testid="safety-banner-unsubscribe"] a');
    expect(link).not.toBeNull();
    expect(link!.getAttribute('href')).toBe('https://evil.example/unsub?id=9');

    // No header → no unsubscribe row at all (no fake button).
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    const withoutUrl = renderBanner(makeEmail({ id: 'm9' }));
    expect(withoutUrl.querySelector('[data-testid="safety-banner-unsubscribe"]')).toBeNull();
  });
});
