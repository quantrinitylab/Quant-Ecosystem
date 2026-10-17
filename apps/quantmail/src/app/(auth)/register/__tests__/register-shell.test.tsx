// @vitest-environment jsdom
// ============================================================================
// Register shell — server-rendered auth shell (fix/qm-auth-pages-paint)
//
// Finding (queue 2026-10-13, P1 perf-competitor): /register was a whole-page
// 'use client' SPA shell (empty HTML + fat JS + spinner wall), like /login
// was before fix/qm-login-paint-vs-gmail.
//
// The fix splits the page: page.tsx is a SERVER component rendering the
// static auth shell (AuthShell + AuthBrandPanel + AuthPageTransition, zero
// client JS), and only the interactive form island (register-form.tsx) ships
// JS. Navigations to /register show an instant skeleton, never the
// "Loading QuantMail…" brand splash.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. Skeleton contract: role=status, aria-busy, form-shaped geometry,
//      no spinner text.
//   2. Source scans: page.tsx stays a server component; the island stays the
//      only client module; loading.tsx uses the skeleton, not RouteSplash.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Keep parity with the sibling login-shell suite's router stub.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/register',
}));

import { RegisterBrand, RegisterSkeleton, RegisterSkeletonBody } from '../register-skeleton';

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

describe('register skeleton markup', () => {
  it('renders an accessible busy status, not a spinner', () => {
    const html = renderToStaticMarkup(<RegisterSkeletonBody />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading the sign-up form');
    // The old spinner wall text must be gone.
    expect(html).not.toContain('Loading QuantMail');
  });

  it('mirrors the real form geometry (heading + three fields + primary action)', () => {
    const html = renderToStaticMarkup(<RegisterSkeletonBody />);
    expect(html).toContain('Create your QuantMail');
    expect(html).toContain('Pick the handle for your QuantMail address.');
    // Three 46px field blocks + the primary-action block.
    expect(html.match(/h-\[46px\]/g)?.length).toBe(4);
    expect(html).toContain('auth-primary-action');
  });

  it('full skeleton renders inside the auth shell with the brand panel', () => {
    const html = renderToStaticMarkup(<RegisterSkeleton />);
    expect(html).toContain('auth-shell');
    expect(html).toContain('auth-brand-panel');
    expect(html).toContain('role="status"');
  });

  it('brand copy is the shared RegisterBrand', () => {
    const html = renderToStaticMarkup(<RegisterBrand />);
    expect(html).toContain('Create your workspace identity');
    expect(html).toContain('Start with one clear address.');
  });
});

describe('server-rendered shell structure (source scans)', () => {
  it('page.tsx is a server component (no use-client directive)', () => {
    const src = readSource('app/register/page.tsx');
    expect(src).not.toMatch(/^'use client'/m);
    expect(src).toContain("from './register-form'");
    expect(src).toContain("from './register-skeleton'");
    expect(src).toContain('<Suspense');
    expect(src).toContain('<RegisterForm');
  });

  it('register-form.tsx is the single client island', () => {
    const src = readSource('app/register/register-form.tsx');
    expect(src).toMatch(/^'use client'/m);
    expect(src).toContain('export function RegisterForm');
    // The island must not drag the static shell into the client bundle.
    expect(src).not.toContain('AuthShell');
    expect(src).not.toContain('AuthBrandPanel');
  });

  it('register-skeleton.tsx is server-safe (no use-client directive)', () => {
    const src = readSource('app/register/register-skeleton.tsx');
    expect(src).not.toMatch(/^'use client'/m);
  });

  it('loading.tsx shows the instant skeleton, not the RouteSplash spinner', () => {
    const src = readSource('app/register/loading.tsx');
    expect(src).toContain('RegisterSkeleton');
    expect(src).not.toContain('RouteSplash');
  });
});
