// @vitest-environment node
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => ({ get: (key: string) => (key === 'lens' ? 'spam' : null) }),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({ quota: null, known: false, usedPct: 0 }),
}));

vi.mock('../components/QuantMailLogo', () => ({
  QuantMailLogo: () => null,
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

describe('AppSidebar Spam drawer entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a Spam folder in the Mail group', () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    expect(markup).toContain('<span>Spam</span>');
  });

  it('marks Spam (not inbox) active on ?lens=spam', () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar));

    // Exactly one nav item is current: the spam lens entry.
    expect(markup.match(/aria-current="page"/g)?.length).toBe(1);

    const spamButton = markup.match(/<button[^>]*>[\s\S]*?<span>Spam<\/span>[\s\S]*?<\/button>/);
    expect(spamButton).not.toBeNull();
    expect(spamButton![0]).toContain('aria-current="page"');
    expect(spamButton![0]).toContain('is-active');
  });

  it('carries no count badge (counts would cost a poll per folder)', () => {
    const markup = renderToStaticMarkup(createElement(AppSidebar));
    const spamButton = markup.match(/<button[^>]*>[\s\S]*?<span>Spam<\/span>[\s\S]*?<\/button>/);
    expect(spamButton![0]).not.toContain('sidebar-count');
  });
});
