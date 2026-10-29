import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Settings header-comment honesty (fix/qm-settings-phone-comment).
 *
 * The settings page's header docblock used to claim "Phone verification on
 * the General tab. It is still here, once, under Security" — but no
 * phone-verification control exists anywhere in src/: the Security tab
 * renders encrypted-in-transit, session & credentials, and privacy sections
 * only, and recovery is email-based (see the account recovery settings).
 * Per the locked phone-removal design the control must not return, so the
 * docblock now records the removal instead of pointing at a control that
 * renders nowhere.
 *
 * These tests pin that: the removal is recorded in the docblock, the stale
 * "still here under Security" claim is gone, and no phone-verification
 * control exists in the page's executable code (comments stripped).
 */
function settingsPageSource(): string {
  return readFileSync(new URL('../app/settings/page.tsx', import.meta.url), 'utf8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('settings page header comment: phone verification removal', () => {
  it('records phone verification as removed, not as a live control', () => {
    const src = settingsPageSource();
    expect(src).toContain('Phone verification');
    expect(src.toLowerCase()).toContain('removed');
    expect(src.toLowerCase()).toContain('must not return');
  });

  it('no longer claims a phone-verification control survives under Security', () => {
    const src = settingsPageSource();
    expect(src).not.toContain('It is still here, once, under');
    expect(src).not.toContain('still here, once');
  });

  it('renders no phone-verification control in executable code', () => {
    const code = stripComments(settingsPageSource());
    expect(code.toLowerCase()).not.toContain('phone verification');
    expect(code.toLowerCase()).not.toContain('phoneverification');
    expect(code.toLowerCase()).not.toContain('verifyphone');
  });
});
