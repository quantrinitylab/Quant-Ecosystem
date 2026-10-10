// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Desktop single-sidebar (2026-10-10, user-corrected): DesktopContextSidebar
// is the ONE desktop left sidebar — logo+name, expanding search field,
// per-app compose + contextual tabs (PILLAR_SUB_CONFIGS, shared with mobile
// ContextBottomNavBar), big Quanty avatar + "Ask Quanty", storage, profile.

let mockPathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    createElement('a', { href }, children),
}));

vi.mock('../components/QuantPillarTopBar', () => ({
  triggerHapticTap: vi.fn(),
}));

vi.mock('../components/QuantMailLogo', () => ({
  QuantMailLogo: () => createElement('span', { 'data-logo': 'mail' }),
}));
vi.mock('../components/QuantCalendarLogo', () => ({
  QuantCalendarLogo: () => createElement('span', { 'data-logo': 'calendar' }),
}));
vi.mock('../components/QuantDriveLogo', () => ({
  QuantDriveLogo: () => createElement('span', { 'data-logo': 'drive' }),
}));
vi.mock('../components/QuantContactsLogo', () => ({
  QuantContactsLogo: () => createElement('span', { 'data-logo': 'contacts' }),
}));
vi.mock('../components/QuantGitLogo', () => ({
  QuantGitLogo: () => createElement('span', { 'data-logo': 'code' }),
}));

vi.mock('../components/BrandWordmark', () => ({
  BrandWordmark: ({ app }: { app: string }) =>
    createElement('span', { 'data-wordmark': app }),
  appDisplayName: (app: string) => `Quant-${app}`,
}));

vi.mock('../components/AccountBadge', () => ({
  AccountBadge: () => createElement('span', { 'data-testid': 'account-badge' }),
}));

vi.mock('../components/Quanty', () => ({
  Quanty: ({ size }: { size: number }) =>
    createElement('span', { 'data-testid': 'quanty-ghost', 'data-size': String(size) }),
}));

vi.mock('../components/SearchClearButton', () => ({
  SearchClearButton: ({ onClear }: { onClear: () => void }) =>
    createElement('button', { 'aria-label': 'Clear search', onClick: onClear }, '×'),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ quota: null, known: false, usedPct: 0 }),
}));

// SidebarStorage lives in AppSidebar (kept there; the mobile drawer still
// renders the whole AppSidebar). Swap only the storage block for a marker.
vi.mock('../components/AppSidebar', () => ({
  AppSidebar: () => createElement('div', { 'data-testid': 'app-sidebar-drawer' }),
  SidebarComposeButton: () => null,
  SidebarNavGroups: () => null,
  SidebarStorage: () =>
    createElement('span', { 'data-testid': 'storage-marker' }),
}));

import { DesktopContextSidebar } from '../components/DesktopContextSidebar';

const baseProps = {
  pillar: 'mail' as const,
  composeAction: { label: 'Compose', onSelect: () => {} },
  onSearchChange: () => {},
  searchValue: '',
};

describe('DesktopContextSidebar (the one desktop sidebar)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
  });

  it.each([
    ['/', 'mail'],
    ['/calendar', 'calendar'],
    ['/calendar/event/123', 'calendar'],
    ['/drive', 'drive'],
    ['/drive/doc/abc', 'drive'],
    ['/contacts', 'contacts'],
    ['/quantgit', 'code'],
    ['/sent', 'mail'],
  ])('route %s shows the %s logo + name', (route, app) => {
    mockPathname = route;
    const markup = renderToStaticMarkup(createElement(DesktopContextSidebar, baseProps));
    expect(markup).toContain(`data-logo="${app}"`);
    expect(markup).toContain(`data-wordmark="${app}"`);
  });

  it('renders the expanding search field wired to onSearchChange', () => {
    const onSearchChange = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, {
        ...baseProps,
        onSearchChange,
        searchValue: 'hello',
        searchPlaceholder: 'Search mail',
      }),
    );
    expect(markup).toContain('id="app-shell-search-input"');
    expect(markup).toContain('aria-label="Search"');
    expect(markup).toContain('placeholder="Search mail"');
    expect(markup).toContain('value="hello"');
    // Non-empty value keeps the field expanded and shows the clear button.
    expect(markup).toContain('aria-label="Clear search"');
  });

  it('does not render the search field when onSearchChange is absent', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, { pillar: 'mail' }),
    );
    expect(markup).not.toContain('id="app-shell-search-input"');
  });

  it.each([
    ['mail', 'desktop-context-tab-inbox'],
    ['calendar', 'desktop-context-tab-feed'],
    ['drive', 'desktop-context-tab-home'],
    ['contacts', 'desktop-context-tab-home'],
    ['quantgit', 'desktop-context-tab-quanty'],
  ])('pillar %s shows its own contextual tabs', (pillar, tabTestId) => {
    mockPathname = pillar === 'mail' ? '/' : `/${pillar}`;
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, { ...baseProps, pillar: pillar as 'mail' }),
    );
    expect(markup).toContain(`data-testid="${tabTestId}"`);
  });

  it('renders real badge counts on tabs', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, {
        ...baseProps,
        badgeCounts: { inbox: 7 },
      }),
    );
    expect(markup).toContain('>7<');
  });

  it('shows a big Quanty avatar with an "Ask Quanty" action', () => {
    const markup = renderToStaticMarkup(createElement(DesktopContextSidebar, baseProps));
    expect(markup).toContain('data-testid="quanty-ghost"');
    expect(markup).toContain('Ask Quanty');
    // Big avatar in the empty area (not the small 48px default).
    const size = Number(markup.match(/data-size="(\d+)"/)?.[1]);
    expect(size).toBeGreaterThan(48);
  });

  it('keeps compose, storage and the profile badge', () => {
    const markup = renderToStaticMarkup(createElement(DesktopContextSidebar, baseProps));
    expect(markup).toContain('data-testid="desktop-context-compose"');
    expect(markup).toContain('Compose');
    expect(markup).toContain('data-testid="storage-marker"');
    expect(markup).toContain('data-testid="account-badge"');
  });

  it('uses the per-pillar compose label', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, {
        ...baseProps,
        pillar: 'calendar',
        composeAction: { label: 'New event', onSelect: () => {} },
      }),
    );
    expect(markup).toContain('New event');
  });

  it('renders the extra slot (e.g. Contacts A–Z index)', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopContextSidebar, {
        ...baseProps,
        extra: createElement('span', { 'data-testid': 'extra-slot' }),
      }),
    );
    expect(markup).toContain('data-testid="extra-slot"');
  });

  it('orders the sections top→bottom: brand, search, compose, tabs, quanty, storage, profile', () => {
    const markup = renderToStaticMarkup(createElement(DesktopContextSidebar, baseProps));
    const order = [
      markup.indexOf('data-wordmark'),
      markup.indexOf('id="app-shell-search-input"'),
      markup.indexOf('data-testid="desktop-context-compose"'),
      markup.indexOf('data-testid="desktop-context-tab-inbox"'),
      markup.indexOf('Ask Quanty'),
      markup.indexOf('data-testid="storage-marker"'),
      markup.indexOf('data-testid="account-badge"'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
