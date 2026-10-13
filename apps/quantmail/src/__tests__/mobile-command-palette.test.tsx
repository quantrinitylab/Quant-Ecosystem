// @vitest-environment node
/**
 * QM-MOBILE-COMMAND-PALETTE — the command palette gets a mobile trigger.
 *
 * Competitor-gap finding 2026-10-12: the CommandPalette was reachable only
 * through the desktop ⌘K/Ctrl+K binding (KeyboardProvider `run: openPalette`)
 * and the desktop-only QuantMailShortcutDock (`hidden md:flex`) — mobile
 * users had no pull-down gesture and no button to open the palette at all.
 *
 * The fix adds a ⌘ button to the mobile search row of QuantPillarTopBar
 * (the bar itself is mobile-only — AppShell mounts it inside `md:hidden`),
 * opening the SAME palette surface through the keyboard-surfaces context.
 * The glyph reuses the palette's own `command` icon from command-icons, so
 * the button reads as the same control as the ⌘K binding.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  QuantPillarTopBar,
  executePaletteButtonClick,
} from '../components/QuantPillarTopBar';

// Mock Window EventTarget (same shape as quant-pillar-topbar.test.tsx)
class MockWindow {
  listeners: Record<string, Function[]> = {};

  addEventListener(type: string, callback: Function) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(callback);
  }

  removeEventListener(type: string, callback: Function) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((cb) => cb !== callback);
    }
  }

  dispatchEvent(event: any) {
    const list = this.listeners[event.type] || [];
    for (const cb of list) {
      cb(event);
    }
    return true;
  }
}

(globalThis as any).window = new MockWindow() as any;
const vibrate = vi.fn(() => true);
vi.stubGlobal('navigator', { vibrate } as unknown as Navigator);

// Mock Next.js navigation hooks
let mockCurrentPathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => mockCurrentPathname,
  useSearchParams: () => new URLSearchParams(),
}));

// Mock auth: the mobile avatar mounts the real AccountBadge menu, which reads
// the current user from the auth provider.
vi.mock('../providers/auth-provider', () => ({
  useOptionalAuth: () => ({
    user: { id: 'u1', email: 'test@quantmail.in', displayName: 'Test User', username: 'test' },
    logout: vi.fn(),
  }),
  useAuth: () => {
    throw new Error('useAuth must be used within an AuthProvider');
  },
}));

describe('QM-MOBILE-COMMAND-PALETTE — palette trigger in the mobile nav chrome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentPathname = '/';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tapping the palette button opens the palette via the surfaces context', () => {
    const openPalette = vi.fn();
    executePaletteButtonClick({ openPalette });
    expect(openPalette).toHaveBeenCalledTimes(1);
  });

  it('tap fires the standard 10ms haptic pulse like every other nav control', () => {
    executePaletteButtonClick({ openPalette: vi.fn() });
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('is a safe no-op when no opener is wired — never throws, never fakes', () => {
    expect(() => executePaletteButtonClick()).not.toThrow();
    expect(() => executePaletteButtonClick({})).not.toThrow();
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('the mobile top bar renders the palette trigger button', () => {
    const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
    expect(html).toContain('data-testid="topbar-command-palette"');
    expect(html).toContain('aria-label="Open command palette"');
  });

  it('the trigger uses the palette\'s own ⌘ glyph — same control as ⌘K', () => {
    const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride="mail" />);
    // Start of the `command` ⌘ path from lib/keyboard/command-icons.
    expect(html).toContain('M15 6a3 3 0 1 1 3 3h-3z');
  });

  it('the trigger is a 44px touch target on every pillar, not just mail', () => {
    for (const pillar of ['calendar', 'drive', 'contacts', 'quantgit'] as const) {
      const html = renderToStaticMarkup(<QuantPillarTopBar activePillarOverride={pillar} />);
      expect(html).toContain('data-testid="topbar-command-palette"');
      expect(html).toContain('min-h-[44px]');
    }
  });
});
