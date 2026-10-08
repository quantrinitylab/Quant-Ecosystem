/**
 * QM-UIUX-024 — Compose P0: Send button looks live but rejects on tap.
 *
 * Regression contract: the Send button's `disabled` state must mirror
 * `handleSend`'s validation EXACTLY. The button must be disabled exactly
 * when tapping it would toast an error, and enabled exactly when the tap
 * would proceed. Both derive from the single source of truth
 * `getSendBlockReason`, so they cannot drift apart.
 */
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { getSendBlockReason, EmailComposer } from '../EmailComposer';

// ---- module mocks for a server-side render of the full composer ----

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@quant/shared-ui', () => ({
  nextRovingIndex: () => 0,
  rovingTabIndex: () => 0,
}));

vi.mock('../Quanty', () => ({
  Quanty: () => null,
}));

vi.mock('../../lib/quanty/reactions', () => ({
  quantyReact: vi.fn(),
  useQuantyMood: () => 'neutral',
}));

vi.mock('../InboxToast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../../lib/email-body', () => ({
  composeMessageBodies: (text: string) => ({ bodyText: text, bodyHtml: text }),
  htmlToPlainText: (html: string) => html,
}));

vi.mock('../../lib/email-signature-preference', () => ({
  loadDefaultSignatureHtml: async () => '',
}));

vi.mock('../../lib/safe-html', () => ({
  useSafeEmailHtml: (html: string) => html,
}));

vi.mock('../../providers/auth-provider', () => ({
  useAuth: () => ({ user: null }),
}));

vi.mock('../../hooks/useDeferredMount', () => ({
  useDeferredMount: () => false,
}));

vi.mock('../useDraftAutosave', () => ({
  useDraftAutosave: () => ({}),
  draftSaveStateLabel: () => '',
}));

vi.mock('../RecipientChipInput', () => ({
  RecipientChipInput: () => null,
  // Minimal faithful parser: the component derives `to` from
  // `toRecipients.map(r => r.email).join(', ')`, and handleSend splits the
  // raw string on /[,;\s]+/ — so parse like the real one does.
  parseEmailString: (s: string) =>
    String(s)
      .split(/[,;\s]+/)
      .filter(Boolean)
      .map((email) => ({ email })),
}));

vi.mock('../../hooks/useContacts', () => ({
  useContacts: () => ({ data: [] }),
}));

vi.mock('../../hooks/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn(), dialog: null }),
}));

vi.mock('../UndoSendCountdownBar', () => ({
  useUndoSend: () => ({ queueSend: vi.fn() }),
}));

vi.mock('../../services/api-client', () => ({
  apiClient: {},
}));

vi.mock('@quant/api-client', () => ({
  apiFetchRaw: vi.fn(),
}));

// ---- pure validation contract ----

describe('getSendBlockReason (QM-UIUX-024 single source of truth)', () => {
  it('blocks an empty To first', () => {
    expect(getSendBlockReason('', '', '')).toBe('Please specify at least one recipient (To:)');
    expect(getSendBlockReason('   ', 's', 'b')).toBe('Please specify at least one recipient (To:)');
  });

  it('blocks an empty subject once To is present', () => {
    expect(getSendBlockReason('a@b.com', '', 'b')).toBe('Please enter an email subject');
    expect(getSendBlockReason('a@b.com', '  \n ', 'b')).toBe('Please enter an email subject');
  });

  it('blocks an empty body once To and subject are present', () => {
    expect(getSendBlockReason('a@b.com', 's', '')).toBe('Please enter your message body');
    expect(getSendBlockReason('a@b.com', 's', '   ')).toBe('Please enter your message body');
  });

  it('returns null when To, subject and body are all present', () => {
    expect(getSendBlockReason('a@b.com', 'Hello', 'World')).toBeNull();
  });

  it('checks in the same order handleSend toasts: To, then subject, then body', () => {
    // To missing dominates even when everything else is missing too.
    expect(getSendBlockReason('', '', '')).toBe('Please specify at least one recipient (To:)');
    // Subject missing dominates a missing body.
    expect(getSendBlockReason('a@b.com', '', '')).toBe('Please enter an email subject');
  });
});

// ---- rendered disabled-state contract ----

/** Extract the opening tag of the primary Send button from static markup. */
function sendButtonTag(html: string): string | null {
  // The primary Send button is the only button whose label starts with
  // the literal text "Send" (the dropup toggle is aria-labeled "Send options").
  const matches = [...html.matchAll(/<button\b[^>]*>/g)];
  for (const m of matches) {
    const start = m.index ?? 0;
    const after = html.slice(start + m[0].length, start + m[0].length + 120);
    if (/^\s*<span>Send<\/span>/.test(after)) return m[0];
  }
  return null;
}

function isSendDisabled(html: string): boolean {
  const tag = sendButtonTag(html);
  expect(tag).not.toBeNull();
  // Match a real `disabled` attribute only — not `aria-disabled` (hyphenated)
  // and not the `disabled:opacity-40` Tailwind variant in class names.
  return /(?:^|\s)disabled(?:=|\s|>)/.test(tag!);
}

function sendTitle(html: string): string | null {
  const tag = sendButtonTag(html);
  expect(tag).not.toBeNull();
  const m = tag!.match(/title="([^"]*)"/);
  return m ? m[1] : null;
}

describe('Send button disabled state mirrors validation (QM-UIUX-024)', () => {
  it('is disabled on a fresh composer (nothing filled)', () => {
    const html = renderToStaticMarkup(<EmailComposer isOpen={true} onClose={() => {}} />);
    expect(isSendDisabled(html)).toBe(true);
    expect(sendTitle(html)).toBe('Please specify at least one recipient (To:)');
  });

  it('stays disabled with only To filled', () => {
    const html = renderToStaticMarkup(
      <EmailComposer isOpen={true} onClose={() => {}} initialTo="a@b.com" />
    );
    expect(isSendDisabled(html)).toBe(true);
    expect(sendTitle(html)).toBe('Please enter an email subject');
  });

  it('stays disabled with only To and subject filled', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo="a@b.com"
        initialSubject="Hello"
      />
    );
    expect(isSendDisabled(html)).toBe(true);
    expect(sendTitle(html)).toBe('Please enter your message body');
  });

  it('is enabled exactly when To, subject and body are all present', () => {
    const html = renderToStaticMarkup(
      <EmailComposer
        isOpen={true}
        onClose={() => {}}
        initialTo="a@b.com"
        initialSubject="Hello"
        initialBody="World"
      />
    );
    expect(isSendDisabled(html)).toBe(false);
  });
});
