// ============================================================================
// SSO chooser — zero-JS brand mark on the signed-out SSO shell.
//
// Finding (queue 2026-10-13, P1 perf-load): SsoChooserContent rendered the
// canvas <QuantMailLogo interactive={false}> on the signed-out /sso chooser
// card — the same bug class as the 2026-10-12 auth-panel finding (fixed in
// fix/qm-auth-brand-motion-r2). The mark can never animate (no hover, no
// spin, no blink with interactive={false}), yet the import drags the
// marks/living-logo canvas pipeline + rAF repaint loop into the signed-out
// SSO shell, painting nothing until its first rAF frame.
//
// The fix renders <QuantMailLogoStatic> instead — the pure-SVG twin whose
// geometry is derived bezier-for-bezier from QuantMailLogo's own markMPath
// (the sanctioned "SVG matches the Canvas-2D M-mark design" brand lock;
// BrandLoader ships the same mark on the splash loader). Same locked mark,
// zero JS, paints on first paint.
//
// These tests pin the fix (renderToStaticMarkup — apps/quantmail has no
// @testing-library/react):
//   1. The chooser renders the static SVG mark: the ember gradient is
//      present, and there is no <canvas>, no qm-logo-motion class, no
//      framer-motion in the markup.
//   2. The rendered mark carries the locked M silhouette + eyes, and keeps
//      its accessible name.
//   3. Source scan: SsoChooserContent.tsx must import QuantMailLogoStatic
//      and must NOT import the canvas QuantMailLogo — a regression silently
//      re-adds the canvas loop to the public SSO shell.
// ============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('?returnTo=/dashboard'),
}));

vi.mock('../../../services/browser-auth-session', () => ({
  browserAuthSession: {
    getAccessToken: () => 'mock-token',
  },
}));

import * as AuthProviderModule from '../../../../providers/auth-provider';
import { SsoChooserContent } from '../SsoChooserContent';

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

/** Source with block and line comments stripped (the fix is documented in prose). */
function readSourceStripped(relApp: string): string {
  return readFileSync(findSource(relApp), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}

function renderChooser(): string {
  return renderToStaticMarkup(<SsoChooserContent />);
}

beforeEach(() => {
  vi.spyOn(AuthProviderModule, 'useAuth').mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    error: null,
    isTwoFactorPending: false,
    login: vi.fn(),
    completeTwoFactor: vi.fn(),
    cancelTwoFactor: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof AuthProviderModule.useAuth>);
  // renderToStaticMarkup never runs effects, so no session/fetch wiring is
  // needed — the chooser's sign-in brand card (the logo surface) renders.
});

describe('SSO chooser brand mark is zero-JS', () => {
  it('renders the static SVG mark — the brand header has no canvas logo, no motion wrapper, no framer-motion', () => {
    const html = renderChooser();
    // QuantMailLogoStatic's ember plate gradient.
    expect(html).toContain('qm-static-plate');
    // The interactive canvas QuantMailLogo renders its <canvas> inside a
    // `qm-logo-motion` wrapper span; neither the canvas nor the wrapper may
    // survive in the brand header of the signed-out SSO shell. (The page's
    // other <canvas> belongs to TitaniumGridCanvas — the intentional ambient
    // background — and is out of scope.)
    expect(html).not.toContain('qm-logo-motion');
    const logoStart = html.indexOf('mb-6 flex flex-col items-center');
    expect(logoStart).toBeGreaterThan(-1);
    const logoHtml = html.slice(logoStart, html.indexOf('</div>', logoStart));
    expect(logoHtml).toContain('<svg');
    expect(logoHtml).not.toContain('<canvas');
    expect(html).not.toContain('framer-motion');
  });

  it('renders the locked M silhouette with eyes and an accessible name', () => {
    const html = renderChooser();
    // M_PATH bezier silhouette from the static mark (start of the path data).
    expect(html).toContain('M 30 74 A 7 7');
    // Eyes from the static mark's locked geometry (pupil circles).
    expect(html).toContain('<circle cx="40.5" cy="60" r="3.5"');
    // Accessible name via <title> (role="img").
    expect(html).toContain('role="img"');
    expect(html).toContain('<title>QuantMail</title>');
  });

  it('source scan: SsoChooserContent imports QuantMailLogoStatic, never the canvas QuantMailLogo', () => {
    const src = readSourceStripped('app/sso/SsoChooserContent.tsx');
    expect(src).toContain('QuantMailLogoStatic');
    expect(src).not.toMatch(/from ['"]\.\.\/\.\.\/components\/QuantMailLogo['"]/);
  });
});
