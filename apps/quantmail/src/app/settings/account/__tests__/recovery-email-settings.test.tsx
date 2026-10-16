// @vitest-environment jsdom
// ============================================================================
// Recovery email settings (fix/qm-account-recovery-3)
//
// The finding this fixes: password-reset links went to the QuantMail inbox
// only, which is unreachable when locked out. The settings surface lets a
// signed-in user set an out-of-band recovery email that reset links are mailed
// to as well.
//
// These tests pin (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. The loading state renders the section's honest contract (title +
//      out-of-band description + loading copy), with no invented delivery
//      claims.
//   2. Source scans: the section is wired to the real api-client recovery
//      methods (not a stub), re-reads after actions, and offers no phone/SMS
//      channel (locked design: no phone OTP infra).
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../../services/api-client', () => ({
  apiClient: {
    getRecoveryEmail: vi.fn(),
    setRecoveryEmail: vi.fn(),
  },
}));

import { RecoveryEmailSettings } from '../RecoveryEmailSettings';

function readSource(relApp: string): string {
  const rels = [`src/${relApp}`, `apps/quantmail/src/${relApp}`];
  let dir = process.cwd();
  for (let depth = 0; depth < 8; depth++) {
    for (const rel of rels) {
      const candidate = join(dir, rel);
      try {
        return readFileSync(candidate, 'utf8');
      } catch {
        /* try the next candidate */
      }
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate ${relApp} from ${process.cwd()}`);
}

describe('RecoveryEmailSettings loading state', () => {
  it('renders the section title and the honest out-of-band contract', () => {
    // useEffect never runs under renderToStaticMarkup, so this is the loading
    // paint — the first thing a user sees.
    const html = renderToStaticMarkup(<RecoveryEmailSettings />);
    expect(html).toContain('Recovery email');
    expect(html).toContain('out-of-band');
    expect(html).toContain('Loading your recovery email');
    // No delivery claim the UI cannot prove.
    expect(html).not.toContain('will be delivered');
    expect(html).not.toMatch(/sent (successfully|instantly)/i);
  });
});

describe('recovery email wiring (source scans)', () => {
  const src = () => readSource('app/settings/account/RecoveryEmailSettings.tsx');

  it('is a client island using the real api-client recovery methods', () => {
    expect(src()).toMatch(/^'use client'/m);
    expect(src()).toContain('apiClient.getRecoveryEmail');
    expect(src()).toContain('apiClient.setRecoveryEmail');
    expect(src()).not.toContain('TODO');
    expect(src()).not.toContain('not wired');
  });

  it('re-reads the value after actions instead of trusting local state', () => {
    // The value displayed is set from the GET response after save/remove...
    expect(src()).toContain('setRecoveryEmail(response.data.recoveryEmail)');
  });

  it('offers no phone/SMS channel (locked design: no phone OTP infra)', () => {
    expect(src().toLowerCase()).not.toContain('sms');
    expect(src().toLowerCase()).not.toContain('phone otp');
  });

  it('the account page mounts the section', () => {
    const page = readSource('app/settings/account/page.tsx');
    expect(page).toContain('RecoveryEmailSettings');
    expect(page).toContain('<RecoveryEmailSettings />');
  });
});

describe('forgot-password form recovery copy (source scans)', () => {
  const src = () => readSource('app/forgot-password/forgot-password-form.tsx');

  it('tells the user where the link goes, honestly', () => {
    // The recovery channel is named before submit (no post-submit surprise),
    // and the completion state does not say "inbox" (the link may have gone
    // to the recovery mailbox instead).
    expect(src()).toContain('recovery email, if one was set');
    expect(src()).toContain('Check your email');
    expect(src()).not.toContain('Check your inbox');
  });

  it('stays non-committal about account existence', () => {
    expect(src()).toContain('We do not confirm whether an account exists.');
  });
});
