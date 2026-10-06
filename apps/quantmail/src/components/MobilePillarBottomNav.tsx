'use client';

// ============================================================================
// QuantMail — Mobile Pillar Bottom Navigation (thumb-reachable super-app nav)
// ============================================================================
//
// Gmail / WhatsApp / Instagram paradigm: the 5 productivity pillars live in a
// thumb-reachable bottom bar on mobile. This bar is the ONE and ONLY bottom
// navigation on mobile — the old second context bar was removed; its sub-tab
// navigation now lives in <MobileSubTabStrip /> under the app bar. Desktop
// uses the DesktopPillarRail. The bar hides on /thread/* and /compose where
// the bottom edge belongs to the conversation / compose toolbar.
//
// Mounts the REAL approved app marks (same PILLAR_TILES as the top switcher),
// per-pillar accent colors, haptic tap feedback, 44px touch floors, and an
// unread badge on Mail.
//
// Strictly ZERO raw Unicode emojis. Strictly ZERO generic glyphs.
// ============================================================================

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PILLAR_TILES, triggerHapticTap, type PillarId } from './QuantPillarTopBar';

export interface MobilePillarBottomNavProps {
  /** Unread count badge shown on the Mail pillar. */
  mailUnreadCount?: number;
  className?: string;
}

function resolvePillar(pathname: string): PillarId {
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/drive')) return 'drive';
  if (pathname.startsWith('/contacts')) return 'contacts';
  if (
    pathname.startsWith('/quantgit') ||
    pathname.startsWith('/codehub') ||
    pathname.startsWith('/repos') ||
    pathname.startsWith('/pipelines')
  )
    return 'quantgit';
  return 'mail';
}

/**
 * Pure tap handler, mirroring `executePillarTileClick` from QuantPillarTopBar.
 * Tapping a different pillar navigates; re-tapping the ACTIVE pillar
 * refreshes the current app's content (user requirement: active-tab retap
 * must do something visible, not sit there dead).
 */
export function executeMobilePillarTap(
  tileId: PillarId,
  path: string,
  options: {
    pathname: string;
    router: { push: (path: string) => void };
  },
) {
  if (resolvePillar(path) !== resolvePillar(options.pathname)) {
    options.router.push(path);
    return;
  }
  // Re-tap on the active pillar: refresh current app content.
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('quant:refresh'));
    window.dispatchEvent(new CustomEvent('quant:pillar-retap', { detail: { pillar: tileId } }));
  }
}

export function MobilePillarBottomNav({
  mailUnreadCount = 0,
  className = '',
}: MobilePillarBottomNavProps) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';

  // The bottom edge belongs to the conversation / compose UI on these routes.
  if (pathname.startsWith('/thread') || pathname.startsWith('/compose')) {
    return null;
  }

  const currentPillar = resolvePillar(pathname);

  const handlePillarTap = (tileId: PillarId, path: string) => {
    triggerHapticTap(10);
    executeMobilePillarTap(tileId, path, { pathname, router });
  };

  return (
    <nav
      aria-label="App pillars"
      className={`fixed bottom-0 left-0 right-0 z-40 md:hidden border-t border-[#1F2430] bg-[#090A0E]/95 backdrop-blur-md shadow-[0_-8px_24px_rgba(0,0,0,0.45)] pb-[env(safe-area-inset-bottom,0px)] ${className}`}
    >
      <div className="flex h-16 items-stretch justify-around px-1">
        {PILLAR_TILES.map((tile) => {
          const isActive = tile.id === currentPillar;
          const Icon = tile.icon;
          const showBadge = tile.id === 'mail' && mailUnreadCount > 0;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handlePillarTap(tile.id, tile.path)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={`${tile.label}${showBadge ? ` (${mailUnreadCount} unread)` : ''}`}
              className="group relative flex min-h-touch min-w-touch flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1 outline-none transition-colors select-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] active:scale-95"
            >
              {/* Active top indicator line in pillar accent color */}
              <span
                aria-hidden="true"
                className={`absolute top-0 h-[3px] w-10 rounded-full transition-all duration-200 ${
                  isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-50'
                }`}
                style={{ backgroundColor: tile.accentColor }}
              />
              <span className="relative flex items-center justify-center">
                {/* Real app mark, tinted by pillar accent when active */}
                <span
                  className="flex items-center justify-center transition-transform duration-200 group-active:scale-90"
                  style={isActive ? { filter: `drop-shadow(0 0 6px ${tile.accentColor}66)` } : undefined}
                >
                  <Icon />
                </span>
                {showBadge && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-3 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#FF6B35] px-1 text-[10px] font-bold leading-none text-[#111111] shadow-sm"
                  >
                    {mailUnreadCount > 99 ? '99+' : mailUnreadCount}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] font-semibold leading-tight tracking-tight transition-colors ${
                  isActive ? 'text-white' : 'text-[#94A3B8] group-hover:text-[#F1F5F9]'
                }`}
                style={isActive ? { color: tile.accentColor } : undefined}
              >
                {tile.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default MobilePillarBottomNav;
