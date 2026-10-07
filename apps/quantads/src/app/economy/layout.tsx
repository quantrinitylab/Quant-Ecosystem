'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';

const NAV_LINKS = [
  { href: '/economy', label: 'Overview' },
  { href: '/economy/wallet', label: 'Wallet' },
  { href: '/economy/store', label: 'Store' },
  { href: '/economy/creator', label: 'Creator' },
  { href: '/economy/boost', label: 'Boost' },
  { href: '/economy/subscriptions', label: 'Subscriptions' },
];

export default function EconomyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col md:flex-row min-h-full">
      <nav className="w-full md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-[var(--quant-border)] bg-[var(--quant-surface)] p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--quant-muted-foreground)] mb-4">
          Economy
        </h2>
        <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === '/economy'
                ? pathname === '/economy'
                : (pathname ?? '').startsWith(link.href);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`block px-3 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-[var(--quant-primary)] text-white font-medium'
                      : 'text-[var(--quant-foreground)] hover:bg-[var(--quant-muted)]'
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <motion.main
        className="flex-1 p-6"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.main>
    </div>
  );
}
