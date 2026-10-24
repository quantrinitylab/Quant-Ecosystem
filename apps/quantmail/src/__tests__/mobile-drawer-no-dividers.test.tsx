// @vitest-environment node
// QM-FIX-LOOP — Mobile drawer pure-black / no-divider-lines design lock
// (fix/qm-mobile-drawer-dividers-r2).
// The user-locked QuantMail rule: pure-black surfaces, NO divider lines;
// separation comes from spacing, never border-t/b or a bordered track.
// This suite fails loudly if the mobile navigation drawer (AppSidebar, the
// surface the hamburger opens) reintroduces any of the three dividers this
// fix removed:
//   - SidebarStorage section `border-t`,
//   - drawer brand header `border-b`,
//   - storage progressbar track `border`.
// It also covers the stylesheet side of the brand divider: the Tailwind
// `border-b` removal alone would NOT have removed the line, because
// globals.css `.sidebar-brand` carried its own `border-bottom` — so the
// base stylesheet rule is asserted here too. The `.desktop-sidebar
// .sidebar-brand { border-bottom: none; }` override is untouched and
// unaffected (the desktop rail already rendered without the line).
// Deliberately OUT of this fix (queued as related findings, not changed
// here): `.quant-sidebar`'s right edge, `.sidebar-labels`' top rule, and
// `.sidebar-footer`'s top rule in globals.css — same defect class, but
// separate drawer elements needing their own review.

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

// The local pnpm `next` entry is gutted (no package.json — see run notes),
// so `next/link` cannot resolve in this environment even on unmodified code.
// Stub it like the other next mocks above; the footer links it renders carry
// no divider classes, so no assertion below depends on the real Link.
vi.mock('next/link', () => ({
  default: () => null,
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { used: 1024, total: 1024 * 1024 * 1024 },
    known: true,
    usedPct: 1,
  }),
}));

vi.mock('../components/QuantMailLogoStatic', () => ({
  QuantMailLogoStatic: () => null,
}));

vi.mock('../components/BrandWordmark', () => ({
  BrandWordmark: () => null,
}));

vi.mock('../components/AccountBadge', () => ({
  AccountBadge: () => null,
}));

vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [] }),
}));

import { AppSidebar } from '../components/AppSidebar';

// Same divider-utility regex as calendar-pureblack-no-dividers.test.tsx:
// matches border-t / border-b / border-r / divide-x / divide-y, ignoring
// substring false positives like `border-transparent`.
const DIVIDER_CLASS_RE = /(^|["'`\s])((border-[tbr](?![a-z-])|divide-[xy](?![a-z-])))/;

const SIDEBAR_SRC = path.resolve(__dirname, '../components/AppSidebar.tsx');
const GLOBALS_CSS = path.resolve(__dirname, '../app/globals.css');

function sidebarBrandBaseRule(): string {
  const css = fs.readFileSync(GLOBALS_CSS, 'utf8');
  const line = css
    .split('\n')
    .find((l) => l.startsWith('.sidebar-brand {'));
  expect(line, 'base .sidebar-brand rule must exist in globals.css').toBeDefined();
  return line!;
}

describe('Mobile drawer design lock: no divider lines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AppSidebar source carries no divider utility classes', () => {
    const hits = fs
      .readFileSync(SIDEBAR_SRC, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => DIVIDER_CLASS_RE.test(line));
    expect(hits, 'divider classes violate the no-divider-lines lock').toEqual([]);
  });

  it('globals.css base .sidebar-brand rule carries no border-bottom', () => {
    expect(sidebarBrandBaseRule()).not.toContain('border-bottom');
  });

  it('rendered drawer has no divider classes, and the three fixed elements keep spacing-only separation', () => {
    const html = renderToStaticMarkup(createElement(AppSidebar));
    expect(DIVIDER_CLASS_RE.test(html), 'no divider classes in rendered drawer').toBe(
      false,
    );

    // Storage section: spacing (mt-4 + padding) kept, divider gone.
    const storage = html.match(/<section[^>]*aria-label="Storage status"[^>]*>/);
    expect(storage, 'storage section must render').not.toBeNull();
    expect(storage![0]).toContain('mt-4 px-2.5 py-3');
    expect(storage![0]).not.toContain('border');

    // Brand header: layout classes kept, divider gone.
    const header = html.match(/<header[^>]*sidebar-brand[^>]*>/);
    expect(header, 'brand header must render').not.toBeNull();
    expect(header![0]).toContain('px-3.5 py-3');
    expect(header![0]).not.toContain('border');

    // Storage track: rounded track + surface fill kept, border gone.
    const track = html.match(/<div[^>]*role="progressbar"[^>]*>/);
    expect(track, 'storage progressbar must render').not.toBeNull();
    expect(track![0]).toContain('rounded-full bg-[var(--quant-surface-elevated)]');
    expect(track![0]).not.toContain('border');
  });
});
