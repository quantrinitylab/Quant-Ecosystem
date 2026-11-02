import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ContextBottomNavBar } from '../components/ContextBottomNavBar';

// QM-DRIVE-MOBILE-TAB-DEDUP: on mobile /drive the page renders
// DriveMobileTabStrip (the full drive tab set, incl. Recent and Starred),
// so the shell bottom bar's My Drive / Recent / Starred slots would show
// Recent and Starred a second time, both wired to the same ?tab= param.
// The bar must therefore render nothing on the exact /drive route — one
// tab set per viewport — while drive sub-routes (which render no strip)
// and every other pillar keep their bottom bar untouched.

let mockCurrentPathname = '/drive';
let mockCurrentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => mockCurrentSearchParams,
}));

function renderBar(): string {
  return renderToStaticMarkup(<ContextBottomNavBar />);
}

describe('drive mobile tab dedupe — ContextBottomNavBar on /drive', () => {
  beforeEach(() => {
    mockCurrentPathname = '/drive';
    mockCurrentSearchParams = new URLSearchParams();
  });

  it('renders nothing on the exact /drive route (strip owns the tab set)', () => {
    expect(renderBar()).toBe('');
  });

  it('renders nothing on /drive?tab=recent — the duplicated Recent tab', () => {
    mockCurrentSearchParams = new URLSearchParams('tab=recent');
    const html = renderBar();
    expect(html).toBe('');
    expect(html).not.toContain('context-tab-recent');
  });

  it('renders nothing on /drive?tab=starred — the duplicated Starred tab', () => {
    mockCurrentSearchParams = new URLSearchParams('tab=starred');
    expect(renderBar()).toBe('');
  });

  it('keeps the bottom bar on drive sub-routes, which render no strip', () => {
    mockCurrentPathname = '/drive/doc/abc123';
    const html = renderBar();
    expect(html).toContain('Drive contextual navigation');
    expect(html).toContain('context-tab-recent');
    expect(html).toContain('context-tab-starred');
  });

  it('keeps the bottom bar on /drive/share links, which render no strip', () => {
    mockCurrentPathname = '/drive/share/sometoken';
    expect(renderBar()).toContain('Drive contextual navigation');
  });

  it('leaves other pillars untouched (calendar keeps its bottom bar)', () => {
    mockCurrentPathname = '/calendar';
    mockCurrentSearchParams = new URLSearchParams('tab=day');
    const html = renderBar();
    expect(html).toContain('Calendar contextual navigation');
    expect(html).toContain('>Day<');
  });
});
