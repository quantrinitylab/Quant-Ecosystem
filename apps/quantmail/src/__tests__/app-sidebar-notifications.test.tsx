// @vitest-environment node
// ============================================================================
// K10 / M15 — the notifications center is a screen now, so the sidebar links
// to /notifications.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/notifications',
  useSearchParams: () => ({ get: vi.fn().mockReturnValue(null) }),
}));

vi.mock('../hooks/useStorageQuota', () => ({
  useStorageQuota: () => ({
    quota: { usedBytes: 1024, totalBytes: 1024 * 1024 * 1024 },
    known: true,
    usedPct: 1,
  }),
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

describe('AppSidebar notifications entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('links to the notifications center', () => {
    const html = renderToStaticMarkup(<AppSidebar />);
    // Nav items are buttons that router.push their path; the entry exists and
    // is the active one on /notifications.
    expect(html).toContain('>Notifications<');
    expect(html).toContain('aria-current="page"');
  });
});
