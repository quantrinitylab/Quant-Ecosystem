// ============================================================================
// Regression tests: /compose send confirmation, auth hydrate timeout,
// inbox heading spacing.
//
// 1. /compose must confirm the send honestly: "Sending… (10s to undo)" at t=0
//    (QM-UIUX-025 — the message is not sent yet during the recall window),
//    then "Email sent" when the 10s window closes, unless the user undid.
//    Before this fix the page navigated home with no confirmation that the
//    message actually went out.
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
    expect(composePageSource).toContain("text: 'Sending… (10s to undo)'");
  });

  it('confirms "Email sent" after the recall window closes', () => {
    expect(composePageSource).toContain("text: 'Email sent'");
  });

  it('does not claim "Email sent" when the user undid the send', () => {
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
    expect(authProviderSource).toMatch(/Promise\.race\(\[loadProfile\(\), timeout/);
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
