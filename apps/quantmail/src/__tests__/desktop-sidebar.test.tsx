// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Desktop sidebar redesign (2026-10-10, user-approved): DesktopSidebar renders
// in AppShell's pinned md+ rail; the mobile drawer keeps the old AppSidebar.

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

vi.mock('../hooks/useMail', () => ({
  useInbox: () => ({ data: [] }),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ quota: null, known: false, usedPct: 0 }),
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

vi.mock('@quant/shared-ui', () => ({
  BubbleAvatar: ({ size }: { size: number }) =>
    createElement('span', { 'data-testid': 'quanty-ghost', 'data-size': String(size) }),
}));

import { DesktopSidebar } from '../components/DesktopSidebar';
import { AppSidebar } from '../components/AppSidebar';

describe('DesktopSidebar (desktop rail redesign)', () => {
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
    const markup = renderToStaticMarkup(createElement(DesktopSidebar));
    expect(markup).toContain(`data-logo="${app}"`);
    expect(markup).toContain(`data-wordmark="${app}"`);
  });

  it('has a search button that targets the header search', () => {
    const markup = renderToStaticMarkup(createElement(DesktopSidebar));
    expect(markup).toContain('aria-label="Search"');
    expect(markup).toContain('<span>Search</span>');
  });

  it('shows a big Quanty avatar with an "Ask Quanty" action', () => {
    const markup = renderToStaticMarkup(createElement(DesktopSidebar));
    expect(markup).toContain('data-testid="quanty-ghost"');
    expect(markup).toContain('Ask Quanty');
    // Big avatar in the empty area (not the small 48px default).
    const size = Number(markup.match(/data-size="(\d+)"/)?.[1]);
    expect(size).toBeGreaterThan(48);
  });

  it('keeps compose, nav options, storage and the profile badge', () => {
    const markup = renderToStaticMarkup(createElement(DesktopSidebar));
    expect(markup).toContain('<span>Compose</span>');
    expect(markup).toContain('<span>Spam</span>');
    expect(markup).toContain('aria-label="Storage status"');
    expect(markup).toContain('data-testid="account-badge"');
  });

  it('renders the extra slot (e.g. Contacts A–Z index)', () => {
    const markup = renderToStaticMarkup(
      createElement(DesktopSidebar, {
        extra: createElement('span', { 'data-testid': 'extra-slot' }),
      }),
    );
    expect(markup).toContain('data-testid="extra-slot"');
  });

  it('orders the sections top→bottom: brand, search, options, quanty, storage, profile', () => {
    const markup = renderToStaticMarkup(createElement(DesktopSidebar));
    const order = [
      markup.indexOf('data-wordmark'),
      markup.indexOf('aria-label="Search"'),
      markup.indexOf('<span>Compose</span>'),
      markup.indexOf('Ask Quanty'),
      markup.indexOf('aria-label="Storage status"'),
      markup.indexOf('data-testid="account-badge"'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('AppSidebar (mobile drawer) stays untouched', () => {
  it('does not render the desktop-only Quanty section', () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    expect(markup).not.toContain('Ask Quanty');
    expect(markup).not.toContain('desktop-sidebar');
  });

  it('keeps its drawer chrome: close button + footer', () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    expect(markup).toContain('aria-label="Close navigation menu"');
    expect(markup).toContain('QuantMail by Quantrinity');
  });
});
