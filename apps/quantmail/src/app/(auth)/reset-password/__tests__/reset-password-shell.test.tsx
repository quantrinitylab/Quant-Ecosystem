// @vitest-environment jsdom
// ============================================================================
// Reset-password shell — server-rendered auth shell (fix/qm-auth-pages-paint)
//
// Finding (queue 2026-10-13, P1 perf-competitor): /reset-password was a
// whole-page 'use client' SPA shell (empty HTML + fat JS + spinner wall),
// like /login was before fix/qm-login-paint-vs-gmail — and it statically
// imported the 2352-line services/api-client into the page chunk for a
// single submit call.
//
// The fix splits the page: page.tsx is a SERVER component rendering the
// static auth shell (AuthShell + AuthBrandPanel + AuthPageTransition, zero
// client JS), only the interactive form island (reset-password-form.tsx)
// ships JS, and the island dynamically imports api-client inside the submit
// handler so it never lands in the page chunk. Navigations to
// /reset-password show an instant skeleton, never the "Loading QuantMail…"
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
  usePathname: () => '/reset-password',
}));

import {
  ResetPasswordBrand,
  ResetPasswordSkeleton,
  ResetPasswordSkeletonBody,
} from '../reset-password-skeleton';

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

describe('reset-password skeleton markup', () => {
  it('renders an accessible busy status, not a spinner', () => {
    const html = renderToStaticMarkup(<ResetPasswordSkeletonBody />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading the new password form');
    // The old spinner wall text must be gone.
    expect(html).not.toContain('Loading QuantMail');
  });

  it('mirrors the real form geometry (heading + two fields + primary action)', () => {
    const html = renderToStaticMarkup(<ResetPasswordSkeletonBody />);
    expect(html).toContain('Set a new password');
    expect(html).toContain('Choose a password of at least 8 characters. The link works once.');
    // Two 46px field blocks + the primary-action block.
    expect(html.match(/h-\[46px\]/g)?.length).toBe(3);
    expect(html).toContain('auth-primary-action');
  });

  it('full skeleton renders inside the auth shell with the brand panel', () => {
    const html = renderToStaticMarkup(<ResetPasswordSkeleton />);
    expect(html).toContain('auth-shell');
    expect(html).toContain('auth-brand-panel');
    expect(html).toContain('role="status"');
  });

  it('brand copy is the shared ResetPasswordBrand', () => {
    const html = renderToStaticMarkup(<ResetPasswordBrand />);
    expect(html).toContain('Account recovery');
    expect(html).toContain('Pick something only you know.');
  });
});

describe('server-rendered shell structure (source scans)', () => {
  it('page.tsx is a server component (no use-client directive)', () => {
    const src = readSource('app/reset-password/page.tsx');
    expect(src).not.toMatch(/^'use client'/m);
    expect(src).toContain("from './reset-password-form'");
    expect(src).toContain("from './reset-password-skeleton'");
    expect(src).toContain('<Suspense');
    expect(src).toContain('<ResetPasswordForm');
  });

  it('reset-password-form.tsx is the single client island', () => {
    const src = readSource('app/reset-password/reset-password-form.tsx');
    expect(src).toMatch(/^'use client'/m);
    expect(src).toContain('export function ResetPasswordForm');
    // The island must not drag the static shell into the client bundle.
    expect(src).not.toContain('AuthShell');
    expect(src).not.toContain('AuthBrandPanel');
  });

  it('api-client is dynamically imported on submit, not in the page chunk', () => {
    const src = readSource('app/reset-password/reset-password-form.tsx');
    // The 2352-line api-client must not be a static import (page chunk).
    expect(src).not.toMatch(/^import\s+.*\bfrom\s+['"][^'"]*services\/api-client['"]/m);
    // It loads only when the user submits the form.
    expect(src).toContain("import('../../../services/api-client')");
  });

  it('reset-password-skeleton.tsx is server-safe (no use-client directive)', () => {
    const src = readSource('app/reset-password/reset-password-skeleton.tsx');
    expect(src).not.toMatch(/^'use client'/m);
  });

  it('loading.tsx shows the instant skeleton, not the RouteSplash spinner', () => {
    const src = readSource('app/reset-password/loading.tsx');
    expect(src).toContain('ResetPasswordSkeleton');
    expect(src).not.toContain('RouteSplash');
  });
});
