'use client';

// ============================================================================
// QuantMail — Desktop App Rail (slim right-side 5-app switcher)
// ============================================================================
// Desktop-only (`hidden md:flex`). Slim vertical rail on the RIGHT edge,
// Gmail's Google-apps-rail style: the 5 suite app logos, active app
// highlighted with its accent color. Click switches app; re-tapping the
// active app refreshes (haptic + quant:refresh), matching the old left dock.
//
// Reuses DESKTOP_PILLAR_TILES (real approved app marks) from
// pillarTiles. Keyboard shortcuts (1..5 / Ctrl+1..5) live here now.
// ============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useShortcut } from '../lib/keyboard/hooks';
import {
  DESKTOP_PILLAR_TILES,
  type DesktopPillarTile,
  type PillarId,
} from './pillarTiles';
import { triggerHapticTap } from './QuantPillarTopBar';

export interface DesktopAppRailProps {
  currentPillar?: PillarId;
  unreadCounts?: {
    mail?: number;
    calendar?: number;
    drive?: number;
    contacts?: number;
    quantgit?: number;
  };
  onPillarSelect?: (pillar: PillarId) => void;
  className?: string;
}

export function DesktopAppRail({
  currentPillar,
  unreadCounts,
  onPillarSelect,
  className = '',
}: DesktopAppRailProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

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
    if (pathname.startsWith('/quantgit')) return 'quantgit';
    return 'mail';
  }, [currentPillar, pathname]);

  const handlePillarClick = useCallback(
    (tile: DesktopPillarTile) => {
      onPillarSelect?.(tile.id);
      if (effectivePillar === tile.id) {
        // Re-tap on the active app: haptic + refresh + scroll to top.
        triggerHapticTap(10);
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

  // Global keyboard shortcuts: Ctrl+1..5 / ⌘1..5 and 1..5
  useShortcut('mod+1', () => navigatePillar('/', 'mail'), { label: 'Go to Mail', allowInInput: true });
  useShortcut('1', () => navigatePillar('/', 'mail'), { label: 'Go to Mail (1)', allowInInput: false });
  useShortcut('mod+2', () => navigatePillar('/calendar', 'calendar'), { label: 'Go to Calendar', allowInInput: true });
  useShortcut('2', () => navigatePillar('/calendar', 'calendar'), { label: 'Go to Calendar (2)', allowInInput: false });
  useShortcut('mod+3', () => navigatePillar('/drive', 'drive'), { label: 'Go to Drive', allowInInput: true });
  useShortcut('3', () => navigatePillar('/drive', 'drive'), { label: 'Go to Drive (3)', allowInInput: false });
  useShortcut('mod+4', () => navigatePillar('/contacts', 'contacts'), { label: 'Go to Contacts', allowInInput: true });
  useShortcut('4', () => navigatePillar('/contacts', 'contacts'), { label: 'Go to Contacts (4)', allowInInput: false });
  useShortcut('mod+5', () => navigatePillar('/quantgit', 'quantgit'), { label: 'Go to QuantGit', allowInInput: true });
  useShortcut('5', () => navigatePillar('/quantgit', 'quantgit'), { label: 'Go to QuantGit (5)', allowInInput: false });

  return (
    <aside
      aria-label="App switcher"
      data-testid="desktop-app-rail"
      className={`hidden md:flex flex-col items-center justify-center w-14 flex-none h-full bg-black py-3 z-30 select-none ${className}`}
    >
      <nav
        role="tablist"
        aria-orientation="vertical"
        aria-label="Suite apps"
        className="flex flex-col items-center gap-2 w-full"
      >
        {DESKTOP_PILLAR_TILES.map((tile) => {
          const isActive = effectivePillar === tile.id;
          const badgeCount = unreadCounts?.[tile.id];

          return (
            <div key={tile.id} className="relative group w-full flex items-center justify-center">
              <button
                type="button"
                role="tab"
                data-testid={`desktop-app-rail-tile-${tile.id}`}
                aria-selected={isActive}
                aria-label={`${tile.label} (${tile.shortcutNumber})`}
                title={`${tile.label} (${isMac ? `⌘${tile.shortcutNumber}` : `Ctrl+${tile.shortcutNumber}`})`}
                onClick={() => handlePillarClick(tile)}
                className={`relative flex size-10 items-center justify-center rounded-xl transition-opacity duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${
                  isActive ? '' : 'hover:bg-[var(--quant-surface-elevated)] opacity-60 hover:opacity-100'
                }`}
              >
                <span className="flex items-center justify-center">{tile.renderIcon(isActive)}</span>

                {badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    data-testid={`desktop-app-rail-badge-${tile.id}`}
                    className="absolute -top-1 -left-1 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full text-[var(--q-type-xs)] font-bold leading-none text-black shadow-md"
                    style={{ backgroundColor: tile.accentColor }}
                    aria-label={`${badgeCount} unread`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </button>

              {/* Tooltip opens to the LEFT (rail is on the right edge) */}
              <div
                role="tooltip"
                className="pointer-events-none absolute right-[52px] top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center gap-2 rounded-xl border border-[#282F42] bg-[#0C0F17]/95 px-3 py-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.85)] backdrop-blur-xl whitespace-nowrap"
              >
                <span className="text-xs font-semibold text-white tracking-wide">{tile.label}</span>
                <kbd className="rounded border border-[#30384C] bg-[var(--quant-surface-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[#A1A4AC]">
                  {isMac ? `⌘${tile.shortcutNumber}` : `Ctrl+${tile.shortcutNumber}`}
                </kbd>
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

export default DesktopAppRail;
