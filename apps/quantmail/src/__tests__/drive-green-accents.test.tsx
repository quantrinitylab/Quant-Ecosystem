import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DriveMobileTabStrip } from '../app/drive/components/DriveMobileTabStrip';
import { DriveContextTabsHeader } from '../app/drive/components/DriveContextTabsHeader';
import { DriveSharedByMeSubView } from '../app/drive/components/DriveSharedByMeSubView';
import type { SentShareItem } from '../hooks/useDrive';

/**
 * qm-drive-blue-accent — per-app accent regression tests.
 *
 * Drive is the GREEN app (user-locked 2026-10-09 / pillar-accents.ts:
 * Mail orange, Calendar blue, Drive green #34A853, Contacts amber,
 * QuantGit purple). On /drive routes AppShell sets `--app-accent` to the
 * Drive green, so Drive UI must only use `var(--app-accent)`-derived accents —
 * never the hardcoded sky-blue `#38BDF8` (or its `#0284C7` / rgba(56,189,248,…)
 * companions) that once covered all 8 Drive subviews + both tab strips,
 * and never the Mail-orange `var(--quant-primary)` token that once leaked
 * onto the shared-by-me folder icon (regression pinned 2026-10-12).
 *
 * These tests pin:
 *  - zero hardcoded sky-blue tokens anywhere under app/drive (components +
 *    page.tsx; the doc/[docId] editor was already token-clean);
 *  - the desktop + mobile tab strips render active states with the shared
 *    `var(--app-accent)` token, never the old blue;
 *  - the Drive page's shared-mode tabs / Details button use the token.
 *
 * Decorative file-type colors are intentionally NOT asserted here (that is
 * a separate concern; there are no such palettes in these files today).
 */

const DRIVE_DIR = new URL('../app/drive', import.meta.url);
const COMPONENTS_DIR = join(DRIVE_DIR.pathname, 'components');

const TSX_FILES: { name: string; src: string }[] = [];
for (const f of readdirSync(COMPONENTS_DIR)) {
  if (f.endsWith('.tsx')) {
    TSX_FILES.push({
      name: f,
      src: readFileSync(join(COMPONENTS_DIR, f), 'utf8'),
    });
  }
}
const PAGE = readFileSync(new URL('../app/drive/page.tsx', import.meta.url), 'utf8');

// QM-SCREEN-010/011 R3: these drive-lib files had #60A5FA leaks that are now
// driven to var(--app-accent) (drive green on /drive routes). DriveSubViews
// holds the cross-app pillar chips aligned to PILLAR_ACCENTS.
const readDriveLib = (name: string) =>
  readFileSync(new URL(`../components/drive/${name}`, import.meta.url), 'utf8');
const R3_TOUCHED: { name: string; src: string }[] = [
  'DriveAISearchBar.tsx',
  'FileAISummaryDrawer.tsx',
  'AIDuplicateCleanerModal.tsx',
  'FileActivityModal.tsx',
  'FileVersionHistoryModal.tsx',
  'QuantyFileWorkspace.tsx',
].map((name) => ({ name: `drive/${name}`, src: readDriveLib(name) }));
const DRIVE_SUB_VIEWS = readFileSync(
  new URL('../components/DriveSubViews.tsx', import.meta.url),
  'utf8',
);

/** Sky-blue tokens that must never appear in Drive UI again. */
const FORBIDDEN_TOKENS = ['#38BDF8', '#38bdf8', '#0284C7', 'rgba(56,189,248'];

describe('qm-drive-blue-accent: no hardcoded blue in any drive surface', () => {
  for (const { name, src } of TSX_FILES) {
    describe(`components/${name}`, () => {
      for (const token of FORBIDDEN_TOKENS) {
        it(`does not contain "${token}"`, () => {
          expect(src).not.toContain(token);
        });
      }
    });
  }

  describe('drive/page.tsx', () => {
    for (const token of FORBIDDEN_TOKENS) {
      it(`does not contain "${token}"`, () => {
        expect(PAGE).not.toContain(token);
      });
    }
  });
});

describe('qm-drive-blue-accent: DriveMobileTabStrip uses the green accent token', () => {
  const src = TSX_FILES.find((f) => f.name === 'DriveMobileTabStrip.tsx')!.src;

  it('source references var(--app-accent) for the active tab', () => {
    expect(src).toContain('text-[var(--app-accent)]');
    expect(src).toContain('focus-visible:ring-[var(--app-accent)]');
  });

  it('renders the active tab pill with the accent token, not blue', () => {
    const html = renderToStaticMarkup(
      <DriveMobileTabStrip activeTab="home" onTabChange={() => {}} />,
    );
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('#38BDF8');
    expect(html).not.toContain('38bdf8');
  });
});

describe('qm-drive-blue-accent: DriveContextTabsHeader uses the green accent token', () => {
  const src = TSX_FILES.find((f) => f.name === 'DriveContextTabsHeader.tsx')!.src;

  it('source uses var(--app-accent) for the active tab + focus ring', () => {
    expect(src).toContain('text-[var(--app-accent)]');
    expect(src).toContain('focus-visible:ring-[var(--app-accent)]');
    expect(src).toContain(
      'border-[color-mix(in_srgb,var(--app-accent)_40%,transparent)]',
    );
  });

  it('renders the active tab with the accent token, not blue', () => {
    const html = renderToStaticMarkup(
      <DriveContextTabsHeader activeTab="home" onTabChange={() => {}} />,
    );
    expect(html).toContain('text-[var(--app-accent)]');
    expect(html).not.toContain('#38BDF8');
  });
});

describe('qm-drive-blue-accent: drive page shared-mode tabs use the token', () => {
  it('shared-mode tabs + preview Details button reference var(--app-accent)', () => {
    const matches = PAGE.match(/text-\[var\(--app-accent\)\]/g);
    expect(matches?.length).toBeGreaterThan(0);
  });
});

describe('qm-drive-blue-accent: no #60A5FA leaks in R3-touched drive lib files', () => {
  // #60A5FA (blue) leaks on drive surfaces are routed through var(--app-accent),
  // which resolves to drive green (#34A853) on /drive routes. StorageQuotaBar is
  // intentionally not in this list (dead in production; its own test owns it).
  const LEAK_TOKEN = '#60A5FA';
  for (const { name, src } of R3_TOUCHED) {
    it(`components/${name} does not contain "${LEAK_TOKEN}"`, () => {
      expect(src).not.toContain(LEAK_TOKEN);
      expect(src).not.toContain(LEAK_TOKEN.toLowerCase());
    });
  }

  it('components/DriveSubViews.tsx pillar chips use locked PILLAR_ACCENTS hexes', () => {
    expect(DRIVE_SUB_VIEWS).toContain("#4285F4");
    expect(DRIVE_SUB_VIEWS).toContain("#34A853");
    expect(DRIVE_SUB_VIEWS).toContain("#F59E0B");
    expect(DRIVE_SUB_VIEWS).toContain("#FF6B35");
    expect(DRIVE_SUB_VIEWS).not.toContain("#38BDF8");
    // Note: #10B981 (memory sync-status badge) and #EC4899 (Videos category
    // chip) remain elsewhere in this file by design — those are not pillar
    // chips and are out of the R3 scope.
  });
});

describe('qm-drive-orange-accent: no Mail-orange token in any drive surface', () => {
  // The only legit accent inside Drive UI is var(--app-accent) (green on
  // /drive routes). The Mail-orange var(--quant-primary) leaked onto the
  // shared-by-me folder icon — this pins that out everywhere.
  for (const { name, src } of TSX_FILES) {
    it(`components/${name} does not contain var(--quant-primary)`, () => {
      expect(src).not.toContain('var(--quant-primary)');
    });
  }

  it('drive/page.tsx does not contain var(--quant-primary)', () => {
    expect(PAGE).not.toContain('var(--quant-primary)');
  });
});

describe('qm-drive-orange-accent: DriveSharedByMeSubView folder icon uses the green accent', () => {
  const sharedByMeSrc = TSX_FILES.find(
    (f) => f.name === 'DriveSharedByMeSubView.tsx',
  )!.src;

  it('source renders the folder icon with var(--app-accent), not var(--quant-primary)', () => {
    expect(sharedByMeSrc).toContain('<FolderIcon className="size-5 text-[var(--app-accent)]"');
    expect(sharedByMeSrc).not.toContain('text-[var(--quant-primary)]');
  });

  const folderItem: SentShareItem = {
    id: 'item-folder-1',
    name: 'Design assets',
    type: 'folder',
    mimeType: 'application/vnd.quant.folder',
    size: 0,
    updatedAt: '2026-10-01T10:00:00.000Z',
    sharedCount: 2,
    scanStatus: 'unknown',
    scanReason: null,
    sharedWith: [
      { email: 'teammate@example.com', name: 'Teammate', permission: 'view', status: 'accepted', sharedAt: '2026-10-01T10:00:00.000Z' },
    ],
    linkShare: null,
  };

  const fileItem: SentShareItem = {
    ...folderItem,
    id: 'item-file-1',
    name: 'report.pdf',
    type: 'file',
    mimeType: 'application/pdf',
    size: 123456,
  };

  it('renders folder + file rows without the orange token', () => {
    const html = renderToStaticMarkup(
      <DriveSharedByMeSubView items={[folderItem, fileItem]} loading={false} />,
    );
    expect(html).toContain('Design assets');
    expect(html).toContain('report.pdf');
    // The icon container and folder icon both resolve to the green accent…
    expect(html).toContain('text-[var(--app-accent)]');
    // …and nothing renders the Mail-orange token.
    expect(html).not.toContain('var(--quant-primary)');
  });
});

describe('qm-drive-pressed-accent: New button pressed state uses the per-app token', () => {
  // 2026-10-25 (fix/qm-drive-accent-pressed): the Drive "New" split-button
  // used bg/hover from var(--app-accent) but active:bg from
  // var(--quant-primary-pressed) — the Mail-orange pressed token — so every
  // press flashed orange on the green Drive surface. AppShell defines
  // --app-accent-pressed per app (color-mix of that app's accent), so the
  // pressed state must resolve through it, like Calendar's primary buttons.
  // Note the existing "no var(--quant-primary)" check above does NOT catch
  // this: var(--quant-primary-pressed) lacks the closing paren after
  // "primary", so it slipped past the substring pin.
  it('drive/page.tsx does not contain var(--quant-primary-pressed)', () => {
    expect(PAGE).not.toContain('var(--quant-primary-pressed)');
  });

  it('the New button pressed state resolves through var(--app-accent-pressed)', () => {
    expect(PAGE).toContain('active:bg-[var(--app-accent-pressed)]');
  });

  it('the New button accent chain is consistent: accent / hover / pressed', () => {
    expect(PAGE).toContain(
      'bg-[var(--app-accent)] px-2 text-xs font-semibold text-[#111111] transition-colors hover:bg-[var(--app-accent-hover)] active:bg-[var(--app-accent-pressed)]',
    );
  });
});

describe('qm-drive-new-touch-target: New button meets the >=44px floor on mobile', () => {
  // 2026-10-25 (wave-plan item on PR #1554): the Drive "New" button was
  // `h-8` — 32px tall — on every viewport, below the 44px touch floor
  // (WCAG 2.5.8 / Apple HIG / Material; see globals.css min-h-touch = 44px
  // and tailwind.config.ts touch: '44px'). jsdom does no layout, so no
  // rendered-pixel assertion is possible here; instead these tests pin the
  // exact classes whose Tailwind values NECESSARILY yield >=44px, plus the
  // arithmetic that proves it. Loaded-mobile evidence (real phone: press
  // shows the green pressed state, target comfortably tappable) is owed to
  // the merge pipeline / QA loop, not claimed here.
  //
  // Sizing math (Tailwind spacing scale, 1 unit = 0.25rem = 4px at 16px root):
  //  - height: h-8 = 32px, but on coarse pointers min-h-11 = 2.75rem = 44px
  //    wins (min-height overrides height) -> rendered height 44px >= 44px.
  //  - width: mobile content = IconUpload 14 + gap-1 4 + IconChevronDown 12
  //    = 30px, plus px-2 (16px) = 46px already >= 44px, and min-w-11 = 44px
  //    floors it regardless of icon metrics -> rendered width >= 44px.
  //  - desktop (fine pointer): the coarse-pointer variants do not apply, so
  //    h-8 / md:px-3 are untouched and the toolbar layout is unchanged.
  const NEW_BUTTON_CLASS = (() => {
    const m = PAGE.match(
      /aria-label="New: upload files, create a document or a folder"\s+className="([^"]+)"/,
    );
    return m?.[1] ?? '';
  })();

  it('the New button element is found in drive/page.tsx', () => {
    expect(NEW_BUTTON_CLASS.length).toBeGreaterThan(0);
  });

  it('carries a coarse-pointer min-height of 44px (min-h-11)', () => {
    expect(NEW_BUTTON_CLASS).toContain('[@media(pointer:coarse)]:min-h-11');
  });

  it('carries a coarse-pointer min-width of 44px (min-w-11)', () => {
    expect(NEW_BUTTON_CLASS).toContain('[@media(pointer:coarse)]:min-w-11');
  });

  it('keeps the desktop sizing untouched: h-8 + md:px-3, no unconditional 44px height', () => {
    expect(NEW_BUTTON_CLASS).toContain('h-8');
    expect(NEW_BUTTON_CLASS).toContain('md:px-3');
    // An unconditional min-h-11 / h-11 would grow the desktop toolbar; the
    // floor must arrive via the coarse-pointer variant only.
    expect(NEW_BUTTON_CLASS).not.toMatch(/(^|\s)(min-h-11|h-11)(\s|$)/);
  });

  it('the chevron is an icon inside this one button, not a separate tappable target', () => {
    // Everything from the New button's aria-label to its closing tag must
    // contain the chevron icon, and there must be no second button carrying
    // a New/chevron affordance of its own.
    const buttonBlock = PAGE.slice(
      PAGE.indexOf('aria-label="New: upload files, create a document or a folder"'),
    ).split('</button>')[0];
    expect(buttonBlock).toContain('IconChevronDown');
    expect(PAGE).not.toContain('aria-label="Show New options"');
    expect(PAGE).not.toContain('aria-label="Toggle New menu"');
  });

  it('the sizing change keeps the accent chain intact on this same button', () => {
    expect(NEW_BUTTON_CLASS).toContain('bg-[var(--app-accent)]');
    expect(NEW_BUTTON_CLASS).toContain('hover:bg-[var(--app-accent-hover)]');
    expect(NEW_BUTTON_CLASS).toContain('active:bg-[var(--app-accent-pressed)]');
    expect(NEW_BUTTON_CLASS).not.toContain('var(--quant-primary)');
  });
});

describe('qm-drive-orange-accent: no Mail-orange spinners in components/drive lib', () => {
  // R4-NEW-2: the loading spinners in these drive-lib files leaked the
  // Mail-orange var(--quant-primary) token; they now resolve through
  // var(--app-accent) (drive green on /drive routes).
  const SPINNER_FILES = [
    'FileActivityModal.tsx',
    'FileVersionHistoryModal.tsx',
    'QuantyFileWorkspace.tsx',
  ];
  for (const file of SPINNER_FILES) {
    const src = readDriveLib(file);
    it(`${file}: no var(--quant-primary) adjacent to an animate-spin`, () => {
      expect(src).not.toMatch(/var\(--quant-primary\)[^"'\n]*animate-spin/);
      expect(src).not.toMatch(/animate-spin[^"'\n]*var\(--quant-primary\)/);
    });
    it(`${file}: spinner resolves through var(--app-accent)`, () => {
      expect(src).toMatch(
        /var\(--app-accent\)[^"'\n]*animate-spin|animate-spin[^"'\n]*var\(--app-accent\)/,
      );
    });
  }
});
