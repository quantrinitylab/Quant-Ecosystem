'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

interface NavLink {
  label: string;
  href: string;
  icon: string;
}

const navLinks: NavLink[] = [
  { label: 'Command Center', href: '/', icon: '🛰️' },
  { label: 'App Control', href: '/apps', icon: '🚀' },
  { label: 'Teams & AI Staff', href: '/teams', icon: '🧑\u200d🚀' },
  { label: 'Economy', href: '/economy', icon: '💳' },
  { label: 'Reports', href: '/reports', icon: '🚩' },
  { label: 'Owner QuantAI', href: '/ai', icon: '👾' },
];

export function TrinityLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform bg-[var(--quant-card)] border-r border-[var(--quant-border)] transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-[var(--quant-border)] px-6">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-app-color)] text-white font-bold text-xs">
              QT
            </div>
            <div className="leading-tight">
              <span className="block text-base font-semibold text-[var(--quant-foreground)]">
                QuantTrinity
              </span>
              <span className="block text-[10px] uppercase tracking-wider text-[var(--brand-app-color)]">
                Owner Tier
              </span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-1">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive(link.href)
                        ? 'bg-[var(--brand-app-color)] text-white'
                        : 'text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)]'
                    }`}
                  >
                    <span className="text-base">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="border-t border-[var(--quant-border)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-app-color)]/10 text-sm font-medium text-[var(--brand-app-color)]">
                QO
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--quant-foreground)] truncate">
                  Quant Owner
                </p>
                <p className="text-xs text-[var(--quant-muted-foreground)] truncate">
                  owner@quant.dev
                </p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-[var(--quant-border)] bg-[var(--quant-card)] px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] lg:hidden"
            aria-label="Open sidebar"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="flex-1" />
          <span className="text-xs text-[var(--quant-muted-foreground)]">
            QuantTrinity · root principal
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
