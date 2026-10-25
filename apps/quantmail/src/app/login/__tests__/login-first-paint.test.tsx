// @vitest-environment jsdom
// ===========================================================================
// Login first paint — mobile sign-in CTA render-state race (queue 2026-10-12
// P2 [auth-sso]): on a signed-out first paint the submit button rendered
// disabled as "Authenticating…" even though no interaction had happened and
// no session restore was pending. Root cause: AuthProvider always started
// `isLoading` as true, so the server-rendered document itself — the bytes a
// slow mobile viewport paints before hydration — carried the disabled
// "Authenticating…" button. The post-hydration effect later flipped it to
// "Sign in", which is why desktop captures (fast hydration) looked fine and
// the 01:57 mobile frame looked stuck: it was the pre-hydration paint, not a
// stuck state, but first paint must still show a tappable "Sign in".
//
// These tests pin the fix with renderToStaticMarkup (effects never run under
// SSR, so the markup IS the first paint):
//   1. skipSessionRestore=true (server proved no refresh cookie) → the
//      server HTML must already show an enabled "Sign in" button.
//   2. skipSessionRestore=false (a refresh cookie may exist, restore is
//      genuinely pending) → the server HTML keeps the disabled
//      "Authenticating…" button until the restore settles.
// ===========================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// LoginForm calls useRouter/useSearchParams — stub the router context the
// way the sibling login-shell suite does.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

import { AuthProvider } from '../../../providers/auth-provider';
import { LoginForm } from '../login-form';

function firstPaintHtml(skipSessionRestore: boolean): string {
  return renderToStaticMarkup(
    <AuthProvider skipSessionRestore={skipSessionRestore}>
      <LoginForm />
    </AuthProvider>,
  );
}

describe('login first paint', () => {
  it('signed-out visitor (no refresh cookie): first paint shows an enabled "Sign in" button', () => {
    const html = firstPaintHtml(true);
    expect(html).toContain('>Sign in</button>');
    expect(html).not.toContain('Authenticating');
    // The submit button must not carry the disabled attribute (match the
    // attribute itself — the class list legitimately contains Tailwind
    // `disabled:` variants).
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/);
    expect(submit).not.toBeNull();
    expect(submit![0]).not.toContain('disabled=""');
  });

  it('cookie present (restore pending): first paint keeps the disabled "Authenticating…" button', () => {
    const html = firstPaintHtml(false);
    expect(html).toContain('>Authenticating…</button>');
    const submit = html.match(/<button[^>]*type="submit"[^>]*>/);
    expect(submit).not.toBeNull();
    expect(submit![0]).toContain('disabled=""');
  });
});
