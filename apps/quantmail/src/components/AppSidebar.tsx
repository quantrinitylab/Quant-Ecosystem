'use client';

import { motion } from 'framer-motion';
import { Sidebar } from '@quant/shared-ui';
import type { SidebarItem } from '@quant/shared-ui';
import { useRouter, usePathname } from 'next/navigation';
import { spring } from '@quant/brand';

const navItems = [
  { id: 'inbox', label: 'Inbox', icon: <span>&#128229;</span>, path: '/' },
  { id: 'compose', label: 'Compose', icon: <span>&#9997;</span>, path: '/compose' },
  { id: 'calendar', label: 'Calendar', icon: <span>&#128197;</span>, path: '/calendar' },
  { id: 'contacts', label: 'Contacts', icon: <span>&#128101;</span>, path: '/contacts' },
  { id: 'drive', label: 'Drive', icon: <span>&#128193;</span>, path: '/drive' },
  { id: 'repos', label: 'Repos', icon: <span>&#128187;</span>, path: '/repos' },
  { id: 'pipelines', label: 'Pipelines', icon: <span>&#9881;</span>, path: '/pipelines' },
  { id: 'security', label: 'Security', icon: <span>&#128274;</span>, path: '/security' },
  { id: 'settings', label: 'Settings', icon: <span>&#9881;&#65039;</span>, path: '/settings' },
];

const sidebarContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.1,
    },
  },
};

const sidebarItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring' as const,
      ...spring.gentle,
    },
  },
};

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const sidebarItems: SidebarItem[] = navItems.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    active: item.path === '/' ? pathname === '/' : (pathname ?? '').startsWith(item.path),
    onClick: () => router.push(item.path),
  }));

  return (
    <Sidebar
      items={sidebarItems}
      header={
        <motion.div
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', ...spring.gentle }}
        >
          <div className="w-8 h-8 rounded-full bg-[var(--brand-app-color)] flex items-center justify-center text-white font-bold text-sm">
            Q
          </div>
          <h2 className="text-lg font-semibold">QuantMail</h2>
        </motion.div>
      }
      className="min-h-touch [&_button]:min-h-[44px] [&_a]:min-h-[44px]"
    />
  );
}
