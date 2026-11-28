// ============================================================================
// Regression tests: /compose send confirmation, auth hydrate timeout,
// inbox heading spacing.
//
// 1. /compose must confirm the send honestly: "Sending… (Ns to undo)" at t=0
//    (QM-UIUX-025 — the message is not sent yet during the recall window),
//    then "Send confirmed — delivering" when the recall window closes, unless
//    the user undid. The window is the stored undo-send setting (default
//    10s), not a hardcoded literal. The window closing is only the moment
//    the send becomes un-undoable and the worker STARTS transmitting —
//    delivery itself is still unconfirmed (the server answers 202 "Email
//    queued for delivery" and SES can still fail afterwards), so the page
//    must NEVER claim "Email sent" on that timer. Before the honesty fixes
//    the page navigated home with no confirmation that the message actually
//    went out, then a later fix added the timer toast but with the
//    unqualified "Email sent" lie.
//
// 2. Auth hydrate must bound BOTH legs: the refresh AND the profile load.
//    Before this fix only `browserAuthSession.refresh()` was raced with a
//    timeout — a slow `/oauth/userinfo` left first visits to authenticated
//    routes (e.g. /settings) on "Authenticating..." for up to 30s.
//
// 3. Inbox hero summary must separate the count and the word with a space
//    ("15 conversations", never "15conversations").
//
// Wiring-pin style: readFileSync source assertions, as in the other honesty
// suites — these fail on the pre-fix code.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const composePageSource = readFileSync(
  fileURLToPath(new URL('../app/compose/page.tsx', import.meta.url)),
  'utf8',
);

const authProviderSource = readFileSync(
  fileURLToPath(new URL('../providers/auth-provider.tsx', import.meta.url)),
  'utf8',
);

const inboxPageSource = readFileSync(
  fileURLToPath(new URL('../app/page.tsx', import.meta.url)),
  'utf8',
);

describe('/compose send confirmation', () => {
  it('shows the honest "Sending…" toast during the recall window (QM-UIUX-025)', () => {
    // The toast counts the stored undo-send setting, not a hardcoded 10s:
    // the template carries the variable, and the page reads the setting.
    expect(composePageSource).toContain('text: `Sending… (${undoDelaySec}s to undo)`');
    expect(composePageSource).toContain('readUndoSendDelay()');
  });

  it('confirms honestly after the recall window closes — never claims "Email sent" on the timer', () => {
    // At t=10s the undo window closes and transmission STARTS; delivery is
    // still unconfirmed (202 "Email queued for delivery" → the worker
    // transmits afterwards, SES can still fail). The only honest copy is
    // the confirmed-but-in-flight one — the unqualified "Email sent" claim
    // must be gone from the page source entirely.
    expect(composePageSource).toContain("text: 'Send confirmed — delivering'");
    expect(composePageSource).not.toContain("text: 'Email sent'");
  });

  it('does not claim anything after the window when the user undid the send', () => {
    // The delayed confirmation is guarded by the undo flag.
    expect(composePageSource).toMatch(/let sendUndone = false/);
    expect(composePageSource).toMatch(/sendUndone = true/);
    expect(composePageSource).toMatch(/if \(!sendUndone\)/);
  });

  it('keeps the existing undo behavior intact', () => {
    expect(composePageSource).toContain('undoAction:');
    expect(composePageSource).toContain('apiClient.undoSend');
    expect(composePageSource).toContain('Sending undone. Message restored to Drafts.');
  });
});

describe('auth hydrate timeout', () => {
  it('races the profile load with a timeout, not just the refresh', () => {
    // Pre-fix: only `browserAuthSession.refresh()` was inside Promise.race;
    // `await loadProfile()` hung unbounded on a slow /oauth/userinfo.
    // The profile leg is now `applySessionUser` (embedded profile, or the
    // /oauth/userinfo fallback) — still timeout-bound either way.
    expect(authProviderSource).toMatch(/Promise\.race\(\[applySessionUser\(session\.data\), timeout/);
  });

  it('still fails closed on timeout (no weakened auth check)', () => {
    expect(authProviderSource).toContain('clearMemorySession()');
    expect(authProviderSource).toContain('setIsLoading(false)');
  });
});

describe('inbox hero summary spacing', () => {
  it('separates the count and "conversations" with a space', () => {
    // The template must render "15 conversations", never "15conversations".
    expect(inboxPageSource).toMatch(/\$\{total\} conversation\$\{total === 1/);
    // And the summary variants built on it keep the space.
    expect(inboxPageSource).toContain('${conversations}, all read.');
    expect(inboxPageSource).toContain('${conversations} out of the way.');
  });
});
