/**
 * CUST-P0-3 — /compose Send silently destroyed the message.
 *
 * Root cause: `isFullPageCompose` required `!onDiscard`, but the /compose
 * page passes `onDiscard` (for its Discard button), so it was always false
 * on the real /compose page. Send then:
 *   1. called `onDiscard()` → the page's discard handler DELETED the server
 *      draft and `router.back()`-ed away (to /settings, /drafts, /sent…),
 *   2. parked the real send on `queueSend`'s 10s countdown, which died when
 *      the navigation unmounted the page's UndoSendProvider.
 * Result: silent navigation, no toast, draft consumed, nothing in /sent.
 *
 * Regression contract:
 *   a. Full-page detection depends ONLY on the route (never on callbacks).
 *   b. The send path must NEVER invoke `onDiscard` (draft deletion).
 *   c. The full-page path navigates only after a successful send; on
 *      failure the error toast is shown and the user stays on the page.
 *      (c) is enforced by code review + the `sendNow(): Promise<boolean>`
 *      contract; (a) and (b) are asserted here.
 */
import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---- module mocks for importing the composer module (mirrors
// EmailComposerSendValidation.test.tsx) ----

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

import { isFullPageComposePath } from '../EmailComposer';

describe('isFullPageComposePath (CUST-P0-3 single source of truth)', () => {
  it('is true on the /compose page regardless of which callbacks the host passes', () => {
    // The /compose page passes onDiscard/onSend/onSaveDraft — detection must
    // not depend on any of that, only the route.
    expect(isFullPageComposePath('/compose')).toBe(true);
  });

  it('is true with query params (draftId, replyTo, kind)', () => {
    expect(isFullPageComposePath('/compose?draftId=abc123')).toBe(true);
    expect(isFullPageComposePath('/compose?replyTo=xyz&kind=chat')).toBe(true);
  });

  it('is false everywhere else', () => {
    expect(isFullPageComposePath('/')).toBe(false);
    expect(isFullPageComposePath('/inbox')).toBe(false);
    expect(isFullPageComposePath('/drafts')).toBe(false);
    expect(isFullPageComposePath('/sent')).toBe(false);
    expect(isFullPageComposePath('/settings')).toBe(false);
  });

  it('is false without a pathname', () => {
    expect(isFullPageComposePath(null)).toBe(false);
    expect(isFullPageComposePath(undefined)).toBe(false);
    expect(isFullPageComposePath('')).toBe(false);
  });
});

describe('send path never discards (CUST-P0-3 structural invariant)', () => {
  const composerPath = path.resolve(__dirname, '../EmailComposer.tsx');
  const source = fs.readFileSync(composerPath, 'utf8');

  // Extract the handleSend arrow-function body: from its declaration to the
  // Save-Draft handler section that follows it.
  const handleStart = source.indexOf('const handleSend = async (scheduledAt');
  const handleEnd = source.indexOf('// Save Draft Handler', handleStart);
  const body = source.slice(handleStart, handleEnd);
  // Strip comments so prose mentions (e.g. in the CUST-P0-3 explanation)
  // don't trip the code-pattern assertions below.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');

  it('locates the handleSend body for the invariant check', () => {
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
  });

  it('never calls onDiscard() inside handleSend', () => {
    // `onDiscard` (the page's discard handler) deletes the server draft.
    // Calling it on the SEND path silently destroyed the message (CUST-P0-3).
    // The only legitimate onDiscard() call lives in handleBack (back nav).
    expect(
      code.includes('onDiscard('),
      'handleSend must never invoke onDiscard() — that deletes the draft on send',
    ).toBe(false);
  });

  it('routes the full-page decision through isFullPageComposePath', () => {
    expect(code.includes('isFullPageComposePath(')).toBe(true);
    // The old broken condition required !onDiscard — it must not come back.
    expect(code.includes('!onDiscard')).toBe(false);
  });

  it('only navigates after a successful send on the full-page path', () => {
    // sendNow reports success so the page can stay put (with the draft
    // intact and the error toast visible) when the send fails.
    expect(code.includes('const sent = await sendNow()')).toBe(true);
    expect(code.includes('if (sent)')).toBe(true);
  });
});
