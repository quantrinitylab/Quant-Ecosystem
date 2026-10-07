'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AppShell, Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';

const NAV_ITEMS: { id: string; label: string; href: string }[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/' },
  { id: 'campaigns', label: 'Campaigns', href: '/campaigns' },
  { id: 'audiences', label: 'Audiences', href: '/audiences' },
  { id: 'creatives', label: 'Creatives', href: '/creatives' },
  { id: 'analytics', label: 'Analytics', href: '/analytics' },
  { id: 'billing', label: 'Billing', href: '/billing' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Auth routes render without the app chrome: a visitor who isn't signed in
  // should see just the sign-in card — no sidebar, no hamburger.
  if ((pathname ?? '').startsWith('/auth')) {
    return <>{children}</>;
  }

  const sidebarItems: SidebarItem[] = NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    active: item.href === '/' ? pathname === '/' : (pathname ?? '').startsWith(item.href),
    onClick: () => router.push(item.href),
  }));

  return (
    <AppShell
      theme="dark"
      sidebar={
        <Sidebar
          items={sidebarItems}
          header={<span className="text-lg font-bold text-orange-400">QuantAds</span>}
        />
      }
    >
      {children}
    </AppShell>
  );
}
