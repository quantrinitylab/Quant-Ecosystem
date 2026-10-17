// @vitest-environment jsdom
// ============================================================================
// Login shell — server-rendered auth shell (fix/qm-login-paint-vs-gmail)
//
// Finding (queue 2026-10-12, P1 perf-competitor): /login painted ~2.5s slower
// than Gmail sign-in on mobile — the whole page was a 'use client' SPA shell
// (empty HTML + 659.8KB JS + spinner wall) instead of a server-rendered form.
//
// The fix splits the page: page.tsx is a SERVER component rendering the
// static auth shell (AuthShell + AuthBrandPanel + AuthPageTransition, zero
// client JS), and only the interactive form island (login-form.tsx) ships
// JS. Navigations to /login show an instant skeleton, never the
// "Loading QuantMail…" brand splash.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. Skeleton contract: role=status, aria-busy, form-shaped geometry,
//      no spinner text.
//   2. Source scans: page.tsx stays a server component; the island stays the
//      only client module; loading.tsx uses the skeleton, not RouteSplash;
//      auth-provider keeps the offline stores out of the static import graph.
// ============================================================================

import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// QuantMailLogo (inside AuthBrandPanel) calls useRouter — stub the router
// context the way the other suites do.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/login',
}));

import { LoginBrand, LoginSkeleton, LoginSkeletonBody } from '../login-skeleton';

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

describe('login skeleton markup', () => {
  it('renders an accessible busy status, not a spinner', () => {
    const html = renderToStaticMarkup(<LoginSkeletonBody />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Loading the sign-in form');
    // The old spinner wall text must be gone.
    expect(html).not.toContain('Loading QuantMail');
  });

  it('mirrors the real form geometry (heading + two fields + primary action)', () => {
    const html = renderToStaticMarkup(<LoginSkeletonBody />);
    expect(html).toContain('Sign in to QuantMail');
    expect(html).toContain('Enter your email address and password.');
    // Two 46px field blocks + the primary-action block.
    expect(html.match(/h-\[46px\]/g)?.length).toBe(3);
    expect(html).toContain('auth-primary-action');
  });

  it('full skeleton renders inside the auth shell with the brand panel', () => {
    const html = renderToStaticMarkup(<LoginSkeleton />);
    expect(html).toContain('auth-shell');
    expect(html).toContain('auth-brand-panel');
    expect(html).toContain('role="status"');
  });

  it('brand copy is the shared LoginBrand', () => {
    const html = renderToStaticMarkup(<LoginBrand />);
    expect(html).toContain('Return to your workspace');
    expect(html).toContain('Your work, back in focus.');
  });
});

describe('server-rendered shell structure (source scans)', () => {
  it('page.tsx is a server component (no use-client directive)', () => {
    const src = readSource('app/login/page.tsx');
    expect(src).not.toMatch(/^'use client'/m);
    expect(src).toContain("from './login-form'");
    expect(src).toContain("from './login-skeleton'");
    expect(src).toContain('<Suspense');
    expect(src).toContain('<LoginForm');
  });

  it('login-form.tsx is the single client island', () => {
    const src = readSource('app/login/login-form.tsx');
    expect(src).toMatch(/^'use client'/m);
    expect(src).toContain('export function LoginForm');
    // The island must not drag the static shell into the client bundle.
    expect(src).not.toContain('AuthShell');
    expect(src).not.toContain('AuthBrandPanel');
  });

  it('login-skeleton.tsx is server-safe (no use-client directive)', () => {
    const src = readSource('app/login/login-skeleton.tsx');
    expect(src).not.toMatch(/^'use client'/m);
  });

  it('loading.tsx shows the instant skeleton, not the RouteSplash spinner', () => {
    const src = readSource('app/login/loading.tsx');
    expect(src).toContain('LoginSkeleton');
    expect(src).not.toContain('RouteSplash');
  });

  it('BrandWordmark is server-renderable (no use-client directive)', () => {
    const src = readSource('components/BrandWordmark.tsx');
    expect(src).not.toMatch(/^'use client'/m);
  });

  it('auth-provider keeps offline stores out of the static import graph', () => {
    const src = readSource('providers/auth-provider.tsx');
    // Static imports would land api-client + IndexedDB + sqlite-fts5 in the
    // /login chunk; logout-only code must load on demand.
    expect(src).not.toMatch(/^import .* from '\.\.\/lib\/offline\/mail-cache';?$/m);
    expect(src).not.toMatch(/^import .* from '\.\.\/lib\/offline\/outbox';?$/m);
    expect(src).toContain("import('../lib/offline/outbox')");
    expect(src).toContain("import('../lib/offline/mail-cache')");
  });
});
