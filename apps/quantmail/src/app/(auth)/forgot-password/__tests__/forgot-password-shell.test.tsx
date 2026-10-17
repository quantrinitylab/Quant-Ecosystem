// @vitest-environment jsdom
// ============================================================================
// Forgot-password shell — server-rendered auth shell (fix/qm-auth-pages-paint)
//
// Finding (queue 2026-10-13, P1 perf-competitor): /forgot-password was a
// whole-page 'use client' SPA shell (empty HTML + fat JS + spinner wall),
// like /login was before fix/qm-login-paint-vs-gmail — and it statically
// imported the 2352-line services/api-client into the page chunk for a
// single submit call.
//
// The fix splits the page: page.tsx is a SERVER component rendering the
// static auth shell (AuthShell + AuthBrandPanel + AuthPageTransition, zero
// client JS), only the interactive form island (forgot-password-form.tsx)
// ships JS, and the island dynamically imports api-client inside the submit
// handler so it never lands in the page chunk. Navigations to
// /forgot-password show an instant skeleton, never the "Loading QuantMail…"
// brand splash.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. Skeleton contract: role=status, aria-busy, form-shaped geometry,
//      no spinner text.
//   2. Source scans: page.tsx stays a server component; the island stays the
//      only client module; api-client is dynamically imported on submit and
//      not statically imported in the page chunk; loading.tsx uses the
//      skeleton, not RouteSplash.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep parity with the sibling login-shell suite's router stub.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/forgot-password',
}));

import {
  ForgotPasswordBrand,
  ForgotPasswordSkeleton,
  ForgotPasswordSkeletonBody,
} from '../forgot-password-skeleton';

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

const readSource = (relApp: string): string =>
  readFileSync(findSource(relApp), 'utf8');

describe('forgot-password skeleton markup', () => {
  it('renders an accessible busy status, not a spinner', () => {
    const html = renderToStaticMarkup(<ForgotPasswordSkeletonBody />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading the password reset form');
    // The old spinner wall text must be gone.
    expect(html).not.toContain('Loading QuantMail');
  });

  it('mirrors the real form geometry (heading + one field + primary action)', () => {
    const html = renderToStaticMarkup(<ForgotPasswordSkeletonBody />);
    expect(html).toContain('Reset your password');
    expect(html).toContain('Enter your full QuantMail address to request reset instructions.');
    // One 46px field block + the primary-action block.
    expect(html.match(/h-\[46px\]/g)?.length).toBe(2);
    expect(html).toContain('auth-primary-action');
  });

  it('full skeleton renders inside the auth shell with the brand panel', () => {
    const html = renderToStaticMarkup(<ForgotPasswordSkeleton />);
    expect(html).toContain('auth-shell');
    expect(html).toContain('auth-brand-panel');
    expect(html).toContain('role="status"');
  });

  it('brand copy is the shared ForgotPasswordBrand', () => {
    const html = renderToStaticMarkup(<ForgotPasswordBrand />);
    expect(html).toContain('Account recovery');
    expect(html).toContain('A calm path back in.');
  });
});

describe('server-rendered shell structure (source scans)', () => {
  it('page.tsx is a server component (no use-client directive)', () => {
    const src = readSource('app/forgot-password/page.tsx');
    expect(src).not.toMatch(/^'use client'/m);
    expect(src).toContain("from './forgot-password-form'");
    expect(src).toContain("from './forgot-password-skeleton'");
    expect(src).toContain('<Suspense');
    expect(src).toContain('<ForgotPasswordForm');
  });

  it('forgot-password-form.tsx is the single client island', () => {
    const src = readSource('app/forgot-password/forgot-password-form.tsx');
    expect(src).toMatch(/^'use client'/m);
    expect(src).toContain('export function ForgotPasswordForm');
    // The island must not drag the static shell into the client bundle.
    expect(src).not.toContain('AuthShell');
    expect(src).not.toContain('AuthBrandPanel');
  });

  it('api-client is dynamically imported on submit, not in the page chunk', () => {
    const src = readSource('app/forgot-password/forgot-password-form.tsx');
    // The 2352-line api-client must not be a static import (page chunk).
    expect(src).not.toMatch(/^import\s+.*\bfrom\s+['"][^'"]*services\/api-client['"]/m);
    // It loads only when the user submits the form.
    expect(src).toContain("import('../../../services/api-client')");
  });

  it('forgot-password-skeleton.tsx is server-safe (no use-client directive)', () => {
    const src = readSource('app/forgot-password/forgot-password-skeleton.tsx');
    expect(src).not.toMatch(/^'use client'/m);
  });

  it('loading.tsx shows the instant skeleton, not the RouteSplash spinner', () => {
    const src = readSource('app/forgot-password/loading.tsx');
    expect(src).toContain('ForgotPasswordSkeleton');
    expect(src).not.toContain('RouteSplash');
  });
});
