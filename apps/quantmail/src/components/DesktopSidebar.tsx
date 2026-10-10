'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';
import { BrandWordmark, appDisplayName } from './BrandWordmark';
import { AccountBadge } from './AccountBadge';
import { Quanty } from './Quanty';
import {
  SidebarComposeButton,
  SidebarNavGroups,
  SidebarStorage,
} from './AppSidebar';
import type { LogoAppType } from './Interactive3DLogo';

export interface DesktopSidebarProps {
  /**
   * Rendered inside the scroll region, after the nav groups — same slot as
   * AppSidebar's `extra` (e.g. the Contacts A–Z index).
   */
  extra?: ReactNode;
  /** Opens the existing Quanty panel (wired by AppShell). */
  onQuantyClick?: () => void;
}

/** Same route → app mapping as AppShell's `currentApp`. */
function appForPathname(pathname: string): LogoAppType {
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/drive')) return 'drive';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (pathname.startsWith('/quantgit')) return 'code';
  return 'mail';
}

function AppMark({ app }: { app: LogoAppType }) {
  switch (app) {
    case 'calendar':
      return <QuantCalendarLogo size={36} />;
    case 'drive':
      return <QuantDriveLogo size={36} />;
    case 'contacts':
      return <QuantContactsLogo size={36} />;
    case 'code':
      return <QuantGitLogo size={36} />;
    case 'mail':
    default:
      return <QuantMailLogo size={36} showBadge={false} interactive={false} />;
  }
}

function SearchGlyph({ className = 'size-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

/**
 * Desktop-only sidebar (rendered in AppShell's pinned rail, `md:` and up).
 * The mobile drawer keeps rendering the old `AppSidebar` untouched.
 *
 * Top → bottom: current-app logo + name, search button, compose + nav
 * options, big Quanty avatar in the empty area, storage readout, profile.
 */
export function DesktopSidebar({ extra, onQuantyClick }: DesktopSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const app = appForPathname(pathname);

  const focusHeaderSearch = () => {
    window.dispatchEvent(new CustomEvent('quant:desktop-search-focus'));
  };

  return (
    <nav className="quant-sidebar desktop-sidebar" aria-label={`${appDisplayName(app)} navigation`}>
      {/* 1 — current app's logo + name */}
      <div className="sidebar-brand">
        <button
          type="button"
          className="flex items-center gap-2.5 select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          onClick={() => router.push('/')}
          title={`${appDisplayName(app)} — Go to Inbox`}
          aria-label={`${appDisplayName(app)} — Go to Inbox`}
        >
          <AppMark app={app} />
          <BrandWordmark app={app} size="text-lg" />
        </button>
      </div>

      {/* 2 — search: focuses the desktop header's global search input */}
      <div className="sidebar-search-wrap">
        <button
          type="button"
          onClick={focusHeaderSearch}
          className="sidebar-search"
          aria-label="Search"
        >
          <SearchGlyph />
          <span>Search</span>
          <kbd className="ml-auto">/</kbd>
        </button>
      </div>

      {/* 3 — compose + nav options (same as the drawer) */}
      <SidebarComposeButton />
      <div className="sidebar-scroll">
        <SidebarNavGroups />

        {extra}

        {/* 4 — the empty area: big Quanty avatar + Ask Quanty */}
        <section aria-label="Ask Quanty" className="sidebar-quanty">
          <Quanty expression="greeting" size={76} />
          <button
            type="button"
            onClick={() => onQuantyClick?.()}
            className="sidebar-quanty-cta"
          >
            Ask Quanty
          </button>
        </section>
      </div>

      {/* 5 — storage readout (real data) */}
      <SidebarStorage />

      {/* 6 — profile + name at the very bottom */}
      <AccountBadge />
    </nav>
  );
}
