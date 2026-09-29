'use client';

import { usePathname, useRouter } from 'next/navigation';
import { AppShell, Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';

const NAV_ITEMS: { id: string; label: string; href: string }[] = [
  { id: 'feed', label: 'Feed', href: '/' },
  { id: 'trending', label: 'Trending', href: '/trending' },
  { id: 'communities', label: 'Communities', href: '/communities' },
  { id: 'spaces', label: 'Spaces', href: '/spaces' },
  { id: 'bookmarks', label: 'Bookmarks', href: '/bookmarks' },
  { id: 'notifications', label: 'Notifications', href: '/notifications' },
  { id: 'profile', label: 'Profile', href: '/profile' },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const sidebarItems: SidebarItem[] = NAV_ITEMS.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    active: item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
    onClick: () => router.push(item.href),
  }));

  return (
    <AppShell
      theme="dark"
      sidebar={
        <Sidebar
          items={sidebarItems}
          header={<span className="text-lg font-bold text-blue-400">QuantSync</span>}
        />
      }
    >
      {children}
    </AppShell>
  );
}
