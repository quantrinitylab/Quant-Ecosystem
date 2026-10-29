// ============================================================================
// The mobile navigation drawer is gone.
//
// This replaces mobileDrawerHamburger.test.tsx, which pinned the hamburger in
// the pillar top bar and the drawer wiring in AppShell. Phones navigate with the
// pillar bar and the contextual bottom bar; secondary routes keep a back chevron
// (covered in __tests__/mobile-drawer-deadend.test.tsx).
//
// What this pins: no hamburger in the top bar, and no modal-drawer machinery
// left in the shell (a page scroll lock or an exclusive keyboard scope with no
// drawer on screen would freeze the page on a phone).
// ============================================================================

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Canvas-painted live marks and account chrome are irrelevant here — stub them.
vi.mock('../Quanty', () => ({ Quanty: () => null }));
vi.mock('../AccountBadge', () => ({ AccountBadge: () => null }));
vi.mock('../QuantGitUserIdModal', () => ({ QuantGitUserIdModal: () => null }));

import { QuantPillarTopBar } from '../QuantPillarTopBar';

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('no mobile navigation drawer', () => {
  it('the pillar top bar renders no hamburger', () => {
    const html = renderToStaticMarkup(<QuantPillarTopBar />);
    expect(html).not.toContain('Open navigation menu');
    expect(html).not.toContain('pillar-menu-button');
    // The command palette trigger stays (it is not part of the drawer).
    expect(html).toContain('data-testid="topbar-command-palette"');
  });

  it('AppShell has no drawer state, scroll lock or drawer keyboard scope', () => {
    const shell = read('src/components/AppShell.tsx');
    expect(shell).not.toContain('quant:sidebar:toggle');
    expect(shell).not.toContain('quant:sidebar:close');
    expect(shell).not.toContain('sidebar-drawer');
    expect(shell).not.toContain('document.body.style.overflow');
    expect(shell).not.toContain('isSidebarOpen');
    expect(shell).not.toContain('menuTriggerRef');
    expect(shell).toContain('isDrawerPresented={false}');
  });

  it('the keyboard provider no longer advertises a sidebar toggle key', () => {
    const provider = read('src/components/KeyboardProvider.tsx');
    expect(provider).not.toContain('quant:sidebar:toggle');
    expect(provider).not.toContain('view.toggleSidebar');
  });
});
