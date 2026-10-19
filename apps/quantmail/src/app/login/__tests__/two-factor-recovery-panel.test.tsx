// @vitest-environment jsdom
// ============================================================================
// Two-factor recovery panel (fix/qm-2fa-challenge-recovery-link)
//
// Finding (queue 2026-10-18, P1 [auth-sso] [ui]): the login 2FA challenge
// screen had no lost-authenticator entry point to the recovery API — a
// locked-out user (lost phone + lost backup codes) sat at a dead prompt.
//
// The fix adds a "Can't use your authenticator?" entry on the challenge
// screen plus this recovery panel (account email → code to the VERIFIED
// recovery address → password → confirm), wired to the real
// POST /auth/2fa/recover + POST /auth/2fa/recover/confirm endpoints.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. Request step: honest copy (verified recovery address, not the QuantMail
//      inbox), prefilled email, send button — never a fake "code sent" promise.
//   2. Confirm step: code + password fields, turn-off button, resend entry.
//   3. Done step: success copy says to sign in with the password (no session
//      is issued) — and the panel never mentions SMS/phone OTP.
//   4. Source scans: login-form wires the "Can't use your authenticator?"
//      link on the 2FA stage and renders the recovery panel; the service
//      posts to the real endpoints through the /api proxy.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TwoFactorRecoveryPanel } from '../two-factor-recovery-panel';

const noop = () => undefined;

/** Walk up from cwd to find a repo-relative source file. */
function findSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      if (existsSync(candidate)) return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

const readSource = (relApp: string): string => readFileSync(findSource(relApp), 'utf8');

describe('two-factor recovery panel — request step', () => {
  it('renders the honest recovery copy with the prefilled account email', () => {
    const html = renderToStaticMarkup(
      <TwoFactorRecoveryPanel
        accountEmail="user@quantmail.in"
        onBackToChallenge={noop}
        onRecovered={noop}
      />,
    );

    expect(html).toContain('Recover sign-in access');
    expect(html).toContain('verified recovery email');
    expect(html).toContain('user@quantmail.in');
    expect(html).toContain('Send recovery code');
    expect(html).toContain('Back to authenticator code');
    // The code goes to the verified recovery address, never the primary
    // inbox — the panel must say so (the primary inbox is unreachable in
    // the lockout, so "check your inbox" would be a dead end).
    expect(html).toContain('not to your QuantMail inbox');
  });

  it('never promises a code was sent and never mentions phone/SMS OTP', () => {
    const html = renderToStaticMarkup(
      <TwoFactorRecoveryPanel
        accountEmail=""
        onBackToChallenge={noop}
        onRecovered={noop}
      />,
    );
    expect(html).not.toMatch(/code (was|has been) sent/i);
    expect(html).not.toMatch(/sms/i);
    expect(html).not.toMatch(/phone/i);
  });
});

describe('two-factor recovery panel — confirm step', () => {
  it('asks for the recovery code and the account password', () => {
    const html = renderToStaticMarkup(
      <TwoFactorRecoveryPanel
        accountEmail="user@quantmail.in"
        onBackToChallenge={noop}
        onRecovered={noop}
        initialStep="confirm"
      />,
    );

    expect(html).toContain('Recovery code');
    expect(html).toContain('Account password');
    expect(html).toContain('Turn off two-factor');
    expect(html).toContain('Send it again');
    expect(html).toContain('Expires in 15 minutes');
  });
});

describe('two-factor recovery panel — done step', () => {
  it('says to sign in with the password again (no session is issued)', () => {
    const html = renderToStaticMarkup(
      <TwoFactorRecoveryPanel
        accountEmail="user@quantmail.in"
        onBackToChallenge={noop}
        onRecovered={noop}
        initialStep="done"
      />,
    );

    expect(html).toContain('Two-factor authentication is off');
    expect(html).toContain('Sign in with your password');
    expect(html).toContain('Back to sign in');
  });
});

describe('login form wiring (source scans)', () => {
  it('offers "Can\'t use your authenticator?" on the 2FA challenge stage', () => {
    const source = readSource('app/login/login-form.tsx');
    // JSX escapes the apostrophe: `Can&apos;t use your authenticator?`
    expect(source).toMatch(/Can(&apos;|')t use your authenticator\?/);
    expect(source).toContain('<TwoFactorRecoveryPanel');
    expect(source).toContain('onBackToChallenge');
    expect(source).toContain('onRecovered');
  });

  it('posts to the real recovery endpoints through the /api proxy, never bare /auth/*', () => {
    const source = readSource('services/browser-auth-session.ts');
    expect(source).toContain("'/auth/2fa/recover'");
    expect(source).toContain("'/auth/2fa/recover/confirm'");
  });
});
