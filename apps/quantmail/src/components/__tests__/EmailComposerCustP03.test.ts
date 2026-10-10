/**
 * CUST-P0-3 — "/compose Send SILENTLY FAILS".
 *
 * Root cause: `EmailComposer.handleSend` treated the host's `onDiscard` prop
 * as a "close the composer" callback and invoked it on the SEND path. But on
 * the real `/compose` page `onDiscard` is the page's DISCARD handler: it
 * deleted the server draft (when `currentDraftId` was set, which autosave
 * ensures) and called `router.back()`. That navigation unmounted the page,
 * whose `UndoSendProvider` cleanup (`UndoSendManager.destroy()` →
 * `clearTimers()`) silently cancelled the `queueSend` countdown before
 * `sendNow` ever fired. Result: no toast, no error, draft deleted, message
 * never sent — and the landing page varied with browser history (/settings,
 * /drafts, /sent). The intended `isFullPageCompose` immediate-send branch was
 * dead code on top of that, because its `!onDiscard` clause could never be
 * true on the page that passes `onDiscard`.
 *
 * Regression contract pinned here:
 *  1. `isFullPageComposePath` is true on `/compose` without an `onClose`
 *     handler — `onDiscard` (which the page passes for its back/edge-swipe
 *     affordance) must not disable the full-page send path.
 *  2. The send path never invokes the host's `onDiscard`. Exactly one
 *     `onDiscard()` call site remains in the component: `handleBack`
 *     (the back button), which is the legitimate discard flow.
 *  3. A failed send fails HONESTLY (CUST-P0-2 precedent): the error toast
 *     fires, the draft is preserved (nothing deletes it), and the full-page
 *     branch navigates to `/` ONLY when the send was accepted — on failure
 *     the composer re-opens on the draft instead of navigating silently.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isFullPageComposePath } from '../EmailComposer';

// ---- module mocks for loading the full composer module ----
// (Same harness as EmailComposerSendValidation.test.tsx / QM-UIUX-024.)

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

// ---- 1. the full-page path must be live on the real /compose page ----

describe('isFullPageComposePath (CUST-P0-3)', () => {
  it('is true on /compose with no modal host — even though the page passes onDiscard', () => {
    // The real /compose page passes onDiscard (its discard handler for the
    // back button / edge-swipe). That must not matter here: the helper takes
    // no onDiscard input at all, so the old `!onDiscard` kill-switch cannot
    // regress.
    expect(isFullPageComposePath({ hasOnCloseHandler: false, pathname: '/compose' })).toBe(true);
  });

  it('is true on /compose sub-paths', () => {
    expect(isFullPageComposePath({ hasOnCloseHandler: false, pathname: '/compose/' })).toBe(true);
  });

  it('is false for a modal/popover host (onClose passed)', () => {
    expect(isFullPageComposePath({ hasOnCloseHandler: true, pathname: '/compose' })).toBe(false);
  });

  it('is false off the /compose route', () => {
    expect(isFullPageComposePath({ hasOnCloseHandler: false, pathname: '/' })).toBe(false);
    expect(isFullPageComposePath({ hasOnCloseHandler: false, pathname: '/drafts' })).toBe(false);
  });
});

// ---- 2 + 3. source contracts: the send path can never go silent ----

const composerSource = readFileSync(
  fileURLToPath(new URL('../EmailComposer.tsx', import.meta.url)),
  'utf8',
);

describe('send path never goes silent (CUST-P0-3 source contracts)', () => {
  it('the send path never invokes the host onDiscard — only handleBack may', () => {
    const callSites = composerSource.match(/onDiscard\(\)/g) ?? [];
    // One legitimate call site: handleBack (the back-button discard flow).
    // handleSend must not call it — doing so deleted the draft and
    // router.back()'d mid-send, silently cancelling the queued send.
    expect(callSites.length).toBe(1);

    const handleBackIdx = composerSource.indexOf('const handleBack');
    const handleSendIdx = composerSource.indexOf('const handleSend = async');
    const callIdx = composerSource.indexOf('onDiscard()');
    expect(handleBackIdx).toBeGreaterThan(-1);
    expect(handleSendIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(handleBackIdx);
    expect(callIdx).toBeLessThan(handleSendIdx);
  });

  it('a failed send fails honestly: error toast + no silent navigation', () => {
    // sendNow reports the outcome so the caller can stay honest…
    expect(composerSource).toContain('const sendNow = async (): Promise<boolean>');
    // …the failure branch announces itself and reports false…
    expect(composerSource).toContain("showToast({ text: err.message || 'Failed to send message', type: 'error' })");
    // …and the full-page branch only navigates home when the send was
    // accepted; on failure the composer re-opens on the preserved draft.
    expect(composerSource).toContain('const sent = await sendNow();');
    expect(composerSource).toContain('if (sent) {');
    expect(composerSource).toContain('setIsDismissed(false);');
    // The old unconditional fire-and-navigate must be gone.
    expect(composerSource).not.toMatch(/await sendNow\(\);\s*\n\s*router\.push\('\/'\);/);
  });
});
