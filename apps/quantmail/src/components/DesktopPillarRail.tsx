'use client';

// ============================================================================
// QuantMail — Desktop Left Pillar Rail (68px Super-App Sovereign Dock)
// Obsidian void #090A0E with hairline border #1E232F.
// Molten Amber Mail, Electric Blue Calendar, Solar Amber Drive,
// Emerald Contacts, Royal Violet QuantGit.
// Real approved app marks · ⌘1..⌘5 / 1..5 shortcuts · Quant AI beacon capsule ·
// Compact user avatar · Active edge glow pill · Slack/Superhuman ergonomics.
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useShortcut } from '../lib/keyboard/hooks';
import { useOptionalAuth } from '../providers/auth-provider';
import { QuantMailLogo } from './QuantMailLogo';
import { QuantCalendarLogo } from './QuantCalendarLogo';
import { QuantDriveLogo } from './QuantDriveLogo';
import { QuantContactsLogo } from './QuantContactsLogo';
import { QuantGitLogo } from './QuantGitLogo';

export type PillarId = 'mail' | 'calendar' | 'drive' | 'contacts' | 'quantgit';

export interface DesktopPillarTile {
  id: PillarId;
  label: string;
  path: string;
  shortcutNumber: number;
  accentColor: string;
  renderIcon: (active: boolean) => React.ReactNode;
}

export interface DesktopPillarRailProps {
  currentPillar?: PillarId;
  unreadCounts?: {
    mail?: number;
    calendar?: number;
    drive?: number;
    contacts?: number;
    quantgit?: number;
  };
  onPillarSelect?: (pillar: PillarId) => void;
  onQuantyClick?: () => void;
  className?: string;
}

/** Official SVG Quant Monogram geometry with subtle amber refraction gradient */
export function QuantMonogramSvg({ className = 'size-6' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="16" cy="14" r="10" stroke="url(#quantAmberRefract)" strokeWidth="2.8" fill="none" />
      <line x1="22" y1="20" x2="28" y2="28" stroke="#FF8C42" strokeWidth="2.8" strokeLinecap="round" />
      <circle cx="16" cy="14" r="3.2" fill="#FF8C42" />
      <defs>
        <linearGradient id="quantAmberRefract" x1="6" y1="4" x2="26" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF8C42" />
          <stop offset="0.5" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#E11D48" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'size-4'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function initials(name: string): string {
  const parts = name
    .replace(/@.*/, '')
    .trim()
    .split(/[.\s_-]+/)
    .filter(Boolean);
  const first = parts[0] || name.trim();
  const second = parts[1];
  if (first && second) {
    return ((first[0] || '') + (second[0] || '')).toUpperCase();
  }
  return (first[0] || 'Q').toUpperCase();
}

function gradientFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 95) % 360;
  return `linear-gradient(135deg, hsl(${a} 70% 55%), hsl(${b} 72% 48%))`;
}

export const DESKTOP_PILLAR_TILES: DesktopPillarTile[] = [
  {
    id: 'mail',
    label: 'Mail',
    path: '/',
    shortcutNumber: 1,
    accentColor: '#FF8C42',
    renderIcon: () => <QuantMailLogo size={28} interactive={false} showBadge={false} />,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    path: '/calendar',
    shortcutNumber: 2,
    accentColor: '#3B82F6',
    renderIcon: () => <QuantCalendarLogo size={28} />,
  },
  {
    id: 'drive',
    label: 'Drive',
    path: '/drive',
    shortcutNumber: 3,
    accentColor: '#F59E0B',
    renderIcon: () => <QuantDriveLogo size={28} />,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    path: '/contacts',
    shortcutNumber: 4,
    accentColor: '#10B981',
    renderIcon: () => <QuantContactsLogo size={28} />,
  },
  {
    id: 'quantgit',
    label: 'QuantGit',
    path: '/quantgit',
    shortcutNumber: 5,
    accentColor: '#8B5CF6',
    renderIcon: () => <QuantGitLogo size={28} />,
  },
];

export function DesktopPillarRail({
  currentPillar,
  unreadCounts,
  onPillarSelect,
  onQuantyClick,
  className = '',
}: DesktopPillarRailProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const auth = useOptionalAuth();

  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  const effectivePillar: PillarId = useMemo(() => {
    if (currentPillar) return currentPillar;
    if (pathname.startsWith('/calendar')) return 'calendar';
    if (pathname.startsWith('/drive')) return 'drive';
    if (pathname.startsWith('/contacts')) return 'contacts';
    if (pathname.startsWith('/quantgit') || pathname.startsWith('/codehub')) return 'quantgit';
    return 'mail';
  }, [currentPillar, pathname]);

  const handlePillarClick = useCallback(
    (tile: DesktopPillarTile) => {
      onPillarSelect?.(tile.id);
      if (effectivePillar === tile.id) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('quant:refresh'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        router.push(tile.path);
      }
    },
    [effectivePillar, onPillarSelect, router],
  );

  const navigatePillar = useCallback(
    (path: string, id: PillarId) => {
      onPillarSelect?.(id);
      if (effectivePillar === id) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('quant:refresh'));
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        router.push(path);
      }
    },
    [effectivePillar, onPillarSelect, router],
  );

  // Global Keyboard Shortcuts: Ctrl+1..5 / ⌘1..5 and 1..5
  useShortcut('mod+1', () => navigatePillar('/', 'mail'), {
    label: 'Go to Mail',
    allowInInput: true,
  });
  useShortcut('1', () => navigatePillar('/', 'mail'), {
    label: 'Go to Mail (1)',
    allowInInput: false,
  });

  useShortcut('mod+2', () => navigatePillar('/calendar', 'calendar'), {
    label: 'Go to Calendar',
    allowInInput: true,
  });
  useShortcut('2', () => navigatePillar('/calendar', 'calendar'), {
    label: 'Go to Calendar (2)',
    allowInInput: false,
  });

  useShortcut('mod+3', () => navigatePillar('/drive', 'drive'), {
    label: 'Go to Drive',
    allowInInput: true,
  });
  useShortcut('3', () => navigatePillar('/drive', 'drive'), {
    label: 'Go to Drive (3)',
    allowInInput: false,
  });

  useShortcut('mod+4', () => navigatePillar('/contacts', 'contacts'), {
    label: 'Go to Contacts',
    allowInInput: true,
  });
  useShortcut('4', () => navigatePillar('/contacts', 'contacts'), {
    label: 'Go to Contacts (4)',
    allowInInput: false,
  });

  useShortcut('mod+5', () => navigatePillar('/quantgit', 'quantgit'), {
    label: 'Go to QuantGit',
    allowInInput: true,
  });
  useShortcut('5', () => navigatePillar('/quantgit', 'quantgit'), {
    label: 'Go to QuantGit (5)',
    allowInInput: false,
  });

  const handleHomeClick = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quant:refresh'));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    router.push('/');
  }, [router]);

  const handleQuantAIClick = useCallback(() => {
    onQuantyClick?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quant:quanty:open'));
      window.dispatchEvent(new CustomEvent('quant:copilot:open'));
    }
  }, [onQuantyClick]);

  const handleAccountClick = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const userName = auth?.user?.displayName || auth?.user?.username || auth?.user?.email || '';
  const userEmail = auth?.user?.email || '';
  const userInitials = initials(userName || 'Quant');
  const userSeed = userEmail || userName;

  return (
    <aside
      aria-label="Desktop Pillar Navigation Rail"
      data-testid="desktop-pillar-rail"
      className={`hidden md:flex flex-col items-center justify-between w-[68px] flex-none h-full bg-[#090A0E] border-r border-[#1E232F] py-3.5 z-30 select-none ${className}`}
    >
      {/* Top Stack: Logo & 5 Pillars */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Quant Monogram Mark / App Logo with subtle amber refraction */}
        <div className="relative group flex items-center justify-center">
          <button
            type="button"
            onClick={handleHomeClick}
            data-testid="desktop-pillar-home-logo"
            aria-label="Quant Ecosystem — Home"
            title="Quant Ecosystem"
            className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#161925] to-[#0D0F17] border border-[#232938] hover:border-[#FF8C42]/60 shadow-[0_4px_16px_rgba(0,0,0,0.6)] transition-all duration-200 ease-out active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            style={{
              boxShadow: '0 2px 10px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Subtle amber refraction glow */}
            <span
              className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at 50% 0%, rgba(255,140,66,0.25) 0%, transparent 70%)',
                boxShadow: '0 0 16px rgba(255,140,66,0.25)',
              }}
              aria-hidden="true"
            />

            <QuantMonogramSvg className="size-6 text-[#FF8C42] group-hover:scale-105 transition-transform duration-200" />
          </button>

          {/* Hover Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-1.5 rounded-lg border border-[#232938] bg-[#111318]/95 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md whitespace-nowrap"
          >
            <span className="text-xs font-semibold text-white">Quant Ecosystem</span>
            <span className="text-[10px] text-[#A1A4AC]">· Home</span>
          </div>
        </div>

        {/* Hairline Divider */}
        <div className="w-8 h-[1px] bg-[#1E232F]/80 my-1" aria-hidden="true" />

        {/* 5 Vertical Pillar Tiles */}
        <nav
          role="tablist"
          aria-orientation="vertical"
          aria-label="Suite Pillars"
          className="flex flex-col items-center gap-2.5 w-full"
        >
          {DESKTOP_PILLAR_TILES.map((tile) => {
            const isActive = effectivePillar === tile.id;
            const badgeCount = unreadCounts?.[tile.id];

            return (
              <div key={tile.id} className="relative group w-full flex items-center justify-center">
                {/* Vertical glowing active pill on the left edge with specular aura */}
                {isActive && (
                  <span
                    data-testid={`desktop-pillar-active-indicator-${tile.id}`}
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-r-full pointer-events-none transition-all duration-300"
                    style={{
                      backgroundColor: tile.accentColor,
                      boxShadow: `0 0 12px ${tile.accentColor}, 0 0 24px ${tile.accentColor}40`,
                    }}
                    aria-hidden="true"
                  />
                )}

                {/* Squircle tile button with luxury micro-interactions */}
                <button
                  type="button"
                  role="tab"
                  data-testid={`desktop-pillar-tile-${tile.id}`}
                  aria-selected={isActive}
                  aria-label={`${tile.label} (${tile.shortcutNumber})`}
                  title={`${tile.label} (${isMac ? `⌘${tile.shortcutNumber}` : `Ctrl+${tile.shortcutNumber}`})`}
                  onClick={() => handlePillarClick(tile)}
                  className={`relative flex size-11 items-center justify-center rounded-2xl transition-all duration-200 cubic-bezier(0.16, 1, 0.3, 1) active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] ${
                    isActive
                      ? 'scale-105 border'
                      : 'border border-transparent hover:scale-105 hover:bg-[#141722] hover:border-[#232938] text-[#8E95A5] hover:text-white'
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: `${tile.accentColor}26`,
                          borderColor: `${tile.accentColor}59`,
                          boxShadow: `0 0 20px ${tile.accentColor}33`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
                    style={{
                      filter: isActive ? `drop-shadow(0 0 8px ${tile.accentColor}99)` : undefined,
                    }}
                  >
                    {tile.renderIcon(isActive)}
                  </span>

                  {/* Badge count (e.g. unread count) */}
                  {badgeCount !== undefined && badgeCount > 0 && (
                    <span
                      data-testid={`desktop-pillar-badge-${tile.id}`}
                      className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none text-black shadow-md font-mono"
                      style={{ backgroundColor: tile.accentColor }}
                      aria-label={`${badgeCount} unread`}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </button>

                {/* Luxury frosted glass tooltip positioned to the right */}
                <div
                  role="tooltip"
                  className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-2 rounded-xl border border-[#282F42] bg-[#0C0F17]/95 px-3 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
                >
                  <span className="text-xs font-semibold text-white tracking-wide">
                    {tile.label}
                  </span>
                  <kbd className="rounded border border-[#30384C] bg-[#181C26] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A4AC] shadow-sm">
                    {isMac ? `⌘${tile.shortcutNumber}` : `Ctrl+${tile.shortcutNumber}`}
                  </kbd>
                </div>
              </div>
            );
          })}
        </nav>
      </div>

      {/* Bottom Stack: Quant AI Trigger & User Avatar */}
      <div className="flex flex-col items-center gap-3 w-full">
        {/* Hairline Divider */}
        <div className="w-8 h-[1px] bg-[#1E232F]/80" aria-hidden="true" />

        {/* Quant AI trigger capsule (orb or sparkle icon with pulsing beacon) */}
        <div className="relative group flex items-center justify-center">
          <button
            type="button"
            onClick={handleQuantAIClick}
            data-testid="desktop-pillar-ai-trigger"
            aria-label="Quant AI Assistant"
            title={`Quant AI (${isMac ? '⌘K' : 'Ctrl+K'})`}
            className="relative flex size-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#181C28] to-[#0F121C] border border-[#282F42] hover:border-[#FF8C42]/70 hover:shadow-[0_0_20px_rgba(255,140,66,0.35)] transition-all duration-200 ease-out active:scale-95 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            {/* Pulsing beacon in the corner */}
            <span className="absolute -top-1 -right-1 flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF8C42] opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[#FF8C42] shadow-[0_0_8px_#FF8C42]" />
            </span>

            {/* Sparkle Icon */}
            <SparklesIcon className="size-5 text-[#FF8C42] group-hover:scale-110 transition-transform duration-200" />
          </button>

          {/* Hover Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-2 rounded-lg border border-[#232938] bg-[#111318]/95 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md whitespace-nowrap"
          >
            <span className="text-xs font-semibold text-white">Quant AI Assistant</span>
            <kbd className="rounded border border-[#30384C] bg-[#181C26] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A4AC] shadow-sm">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </div>
        </div>

        {/* User Identity Avatar (Account / Settings) */}
        <div className="relative group flex items-center justify-center">
          <button
            type="button"
            onClick={handleAccountClick}
            data-testid="desktop-pillar-account-badge"
            aria-label="Account and Settings"
            title="Account & Settings"
            className="relative flex size-10 items-center justify-center rounded-full bg-[#181C28] border border-[#2A3144] hover:border-[#FF8C42]/60 hover:ring-2 hover:ring-[#FF8C42]/20 transition-all duration-200 ease-out active:scale-95 group overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            style={{
              background: userSeed ? gradientFor(userSeed) : undefined,
            }}
          >
            <span className="text-xs font-bold text-white tracking-wider">
              {userInitials}
            </span>
          </button>

          {/* Hover Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-1.5 rounded-lg border border-[#232938] bg-[#111318]/95 px-2.5 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md whitespace-nowrap"
          >
            <span className="text-xs font-semibold text-white">Account & Settings</span>
            {userEmail ? <span className="text-[10px] text-[#A1A4AC]">({userEmail})</span> : null}
          </div>
        </div>
      </div>
    </aside>
  );
}

export default DesktopPillarRail;
