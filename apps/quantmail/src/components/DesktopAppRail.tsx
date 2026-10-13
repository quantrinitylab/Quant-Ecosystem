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
import { MoreAppsMenu } from './MoreAppsMenu';
import { LiquidTrack } from './workplace/LiquidTrack';

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

  // Optimistic selection: the liquid tab starts sliding on the click, not when
  // the target route commits; cleared once the pathname moves (or after a
  // fallback if the navigation never lands).
  const [pendingPillar, setPendingPillar] = useState<PillarId | null>(null);
  useEffect(() => {
    setPendingPillar(null);
  }, [pathname]);
  useEffect(() => {
    if (!pendingPillar) return;
    const t = window.setTimeout(() => setPendingPillar(null), 2500);
    return () => window.clearTimeout(t);
  }, [pendingPillar]);

  const effectivePillar: PillarId = useMemo(() => {
    if (pendingPillar) return pendingPillar;
    if (currentPillar) return currentPillar;
    if (pathname.startsWith('/calendar')) return 'calendar';
    if (pathname.startsWith('/drive')) return 'drive';
    if (pathname.startsWith('/contacts')) return 'contacts';
    if (pathname.startsWith('/quantgit')) return 'quantgit';
    return 'mail';
  }, [pendingPillar, currentPillar, pathname]);

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
        setPendingPillar(tile.id);
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
        setPendingPillar(id);
        router.push(path);
      }
    },
    [effectivePillar, onPillarSelect, router],
  );

  // Global keyboard shortcuts: Ctrl+1..5 / ⌘1..5 and 1..5.
  // Labels intentionally omit the bare digit — the palette renders the actual
  // key in a <kbd> chip, so a "(1)" suffix reads as a count badge (SIA-P2-3).
  useShortcut('mod+1', () => navigatePillar('/', 'mail'), { label: 'Go to Mail', allowInInput: true });
  useShortcut('1', () => navigatePillar('/', 'mail'), { label: 'Go to Mail', allowInInput: false });
  useShortcut('mod+2', () => navigatePillar('/calendar', 'calendar'), { label: 'Go to Calendar', allowInInput: true });
  useShortcut('2', () => navigatePillar('/calendar', 'calendar'), { label: 'Go to Calendar', allowInInput: false });
  useShortcut('mod+3', () => navigatePillar('/drive', 'drive'), { label: 'Go to Drive', allowInInput: true });
  useShortcut('3', () => navigatePillar('/drive', 'drive'), { label: 'Go to Drive', allowInInput: false });
  useShortcut('mod+4', () => navigatePillar('/contacts', 'contacts'), { label: 'Go to Contacts', allowInInput: true });
  useShortcut('4', () => navigatePillar('/contacts', 'contacts'), { label: 'Go to Contacts', allowInInput: false });
  useShortcut('mod+5', () => navigatePillar('/quantgit', 'quantgit'), { label: 'Go to QuantGit', allowInInput: true });
  useShortcut('5', () => navigatePillar('/quantgit', 'quantgit'), { label: 'Go to QuantGit', allowInInput: false });

  const activeIndex = Math.max(0, DESKTOP_PILLAR_TILES.findIndex((t) => t.id === effectivePillar));
  const shortcutText = (n: number) => (isMac ? `⌘${n}` : `Ctrl+${n}`);

  return (
    <aside
      aria-label="App switcher"
      data-testid="desktop-app-rail"
      className={`hidden md:flex flex-col items-center justify-center flex-none h-full bg-black pl-3.5 pr-2.5 py-3 z-30 select-none ${className}`}
    >
      {/*
        Quant Workplace rail (approved 2026-10-13): the vertical twin of the
        mobile switcher. A glass column whose active app rises out of it
        towards the content as ONE connected liquid tab in the app accent
        (<LiquidTrack orient="v">, lib/liquid-bar); the five living marks sit
        on the glass with no tiles behind them.
      */}
      <nav
        role="tablist"
        aria-orientation="vertical"
        aria-label="Suite apps"
        data-active-pillar={effectivePillar}
        className="qw-bar qw-bar-v"
        style={{
          width: 60,
          height: 340,
          ['--lq-accent' as string]: DESKTOP_PILLAR_TILES[activeIndex]?.accentColor,
        }}
      >
        <LiquidTrack
          orient="v"
          count={DESKTOP_PILLAR_TILES.length}
          index={activeIndex}
          thickness={60}
          radius={20}
          lift={6}
          pad={6}
          top={0.38}
          flare={0.3}
          floor={false}
          testId="desktop-app-rail-liquid"
        />
        <div className="qw-segs">
        {DESKTOP_PILLAR_TILES.map((tile) => {
          const isActive = effectivePillar === tile.id;
          const badgeCount = unreadCounts?.[tile.id];
          const fullName = tile.label.startsWith('Quant') ? tile.label.replace(/^Quant/, 'Quant ') : `Quant ${tile.label}`;

          return (
              <button
                key={tile.id}
                type="button"
                role="tab"
                data-testid={`desktop-app-rail-tile-${tile.id}`}
                aria-selected={isActive}
                // SIA-P2-3: never parenthesize the shortcut number — "Mail (1)"
                // reads as an unread-count badge. The number lives in a <kbd>
                // chip in the hover tooltip; the accessible name states the
                // shortcut outright.
                aria-label={`${tile.label}, keyboard shortcut ${isMac ? 'Command' : 'Ctrl'}+${tile.shortcutNumber}`}
                onClick={() => handlePillarClick(tile)}
                // SIA-P2-7: tile touch targets must be >= 44px (Apple HIG /
                // WCAG 2.5.8). Each tile fills its 60x65px rail cell, never
                // less than 44px.
                className="qw-seg min-h-11 min-w-11"
              >
                <span className="qw-seg-mark">{tile.renderIcon(isActive)}</span>

                {badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    data-testid={`desktop-app-rail-badge-${tile.id}`}
                    className="absolute top-1.5 right-1 z-[3] min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full text-[var(--q-type-xs)] font-bold leading-none text-black shadow-md"
                    style={{ backgroundColor: tile.accentColor }}
                    aria-label={`${badgeCount} unread`}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}

                {/* Tooltip opens to the LEFT (rail is on the right edge) */}
                <span role="tooltip" className="qw-tip">
                  {fullName}
                  <kbd className="rounded border border-[#30384C] bg-[var(--quant-surface-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--quant-muted-foreground)]">
                    {shortcutText(tile.shortcutNumber)}
                  </kbd>
                </span>
              </button>
          );
        })}
        </div>
      </nav>

      {/*
        "More apps" overflow (switcher discoverability, 2026-10-11): the 5
        pillar tiles above are the in-product apps; sibling ecosystem apps
        (QuantChat, QuantAI) live on their own subdomains and open from here
        via a deliberate, user-triggered panel — never spontaneously. Separated
        by spacing only (no divider lines, per UI rules). No keyboard shortcut
        number: Ctrl+1..5 stay reserved for the 5 pillars.
      */}
      <div className="mt-5 w-full flex items-center justify-center">
        <MoreAppsMenu
          align="left"
          buttonTestId="desktop-app-rail-tile-more"
          buttonClassName="relative flex size-11 items-center justify-center rounded-xl text-white/60 opacity-60 transition-opacity duration-200 hover:bg-[var(--quant-surface-elevated)] hover:text-white hover:opacity-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          ariaLabel="More Quant apps — open QuantChat or QuantAI"
          title="More Quant apps"
        />
      </div>
    </aside>
  );
}

export default DesktopAppRail;
