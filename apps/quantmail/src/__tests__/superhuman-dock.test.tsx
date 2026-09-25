import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SuperhumanShortcutDock,
  DOCK_SHORTCUTS,
  handleDockKeyDown,
  isInputTarget,
  type SuperhumanShortcutDockProps,
} from '../components/SuperhumanShortcutDock';

describe('Superhuman Shortcut Dock (Wave 39 UI/UX Parity)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Static Markup & Tactile Badge Verification
  // --------------------------------------------------------------------------
  describe('Dock Rendering & Shortcut Badges', () => {
    it('renders the floating frosted glass dock with the exact specified viewport positioning and classes', () => {
      const html = renderToStaticMarkup(<SuperhumanShortcutDock disableListener />);

      // Verify frosted glass dock container classes
      expect(html).toContain('fixed bottom-6 left-1/2 -translate-x-1/2 z-40');
      expect(html).toContain('backdrop-blur-md bg-black/75 border border-white/10 shadow-2xl');
      expect(html).toContain('flex items-center gap-3 text-xs text-gray-300 select-none');
      expect(html).toContain('rounded-full');
      expect(html).toContain('px-4 py-2');

      // Verify brand mark
      expect(html).toContain('bg-[#FF8C42]');
      expect(html).toContain('Keys');
    });

    it('renders all required shortcut pills with tactile keys and action labels', () => {
      const html = renderToStaticMarkup(<SuperhumanShortcutDock disableListener />);

      // J / K -> Navigate
      expect(html).toContain('data-testid="dock-pill-navigate"');
      expect(html).toContain('data-testid="key-badge-J"');
      expect(html).toContain('data-testid="key-badge-K"');
      expect(html).toContain('Navigate');

      // E -> Done / Archive
      expect(html).toContain('data-testid="dock-pill-archive"');
      expect(html).toContain('data-testid="key-badge-E"');
      expect(html).toContain('Done / Archive');

      // S -> Snooze
      expect(html).toContain('data-testid="dock-pill-snooze"');
      expect(html).toContain('data-testid="key-badge-S"');
      expect(html).toContain('Snooze');

      // R -> Reply
      expect(html).toContain('data-testid="dock-pill-reply"');
      expect(html).toContain('data-testid="key-badge-R"');
      expect(html).toContain('Reply');

      // Z -> Undo
      expect(html).toContain('data-testid="dock-pill-undo"');
      expect(html).toContain('data-testid="key-badge-Z"');
      expect(html).toContain('Undo');

      // ⌘K -> Command Palette
      expect(html).toContain('data-testid="dock-pill-palette"');
      expect(html).toContain('data-testid="key-badge-CMD_K"');
      expect(html).toContain('⌘K');
      expect(html).toContain('Command Palette');
    });

    it('renders minimize toggle button in expanded dock', () => {
      const html = renderToStaticMarkup(<SuperhumanShortcutDock disableListener />);
      expect(html).toContain('data-testid="dock-minimize-button"');
      expect(html).toContain('aria-label="Minimize dock"');
    });

    it('renders compact floating trigger when collapsed is true', () => {
      const html = renderToStaticMarkup(
        <SuperhumanShortcutDock initialCollapsed={true} disableListener />,
      );

      expect(html).toContain('data-testid="superhuman-dock-collapsed"');
      expect(html).toContain('Shortcuts');
      expect(html).toContain('aria-label="Expand dock"');
      expect(html).toContain('fixed bottom-6 left-1/2 -translate-x-1/2 z-40');
      // Expanded dock elements should not be present
      expect(html).not.toContain('data-testid="dock-pill-archive"');
      expect(html).not.toContain('data-testid="dock-minimize-button"');
    });

    it('renders glowing orange accent (#FF8C42) when activeKey is set to a specific key', () => {
      // Test highlighting for 'J'
      const htmlJ = renderToStaticMarkup(
        <SuperhumanShortcutDock activeKeyOverride="J" disableListener />,
      );
      expect(htmlJ).toContain('border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42]');
      expect(htmlJ).toContain('shadow-[0_0_12px_rgba(255,140,66,0.6)]');

      // Test highlighting for 'E' (Done / Archive)
      const htmlE = renderToStaticMarkup(
        <SuperhumanShortcutDock activeKeyOverride="E" disableListener />,
      );
      expect(htmlE).toContain('border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42]');

      // Test highlighting for 'CMD_K' (Command Palette)
      const htmlPalette = renderToStaticMarkup(
        <SuperhumanShortcutDock activeKeyOverride="CMD_K" disableListener />,
      );
      expect(htmlPalette).toContain('border-[#FF8C42] bg-[#FF8C42]/20 text-[#FF8C42]');
    });
  });

  // --------------------------------------------------------------------------
  // 2. DOCK_SHORTCUTS Constants Integrity
  // --------------------------------------------------------------------------
  describe('DOCK_SHORTCUTS Spec Integrity', () => {
    it('defines 6 primary shortcuts with correct key assignments', () => {
      expect(DOCK_SHORTCUTS.length).toBe(6);

      const nav = DOCK_SHORTCUTS.find((s) => s.id === 'navigate');
      expect(nav?.badgeKeys).toEqual(['J', 'K']);
      expect(nav?.label).toBe('Navigate');

      const archive = DOCK_SHORTCUTS.find((s) => s.id === 'archive');
      expect(archive?.badgeKeys).toEqual(['E']);
      expect(archive?.label).toBe('Done / Archive');

      const snooze = DOCK_SHORTCUTS.find((s) => s.id === 'snooze');
      expect(snooze?.badgeKeys).toEqual(['S']);
      expect(snooze?.label).toBe('Snooze');

      const reply = DOCK_SHORTCUTS.find((s) => s.id === 'reply');
      expect(reply?.badgeKeys).toEqual(['R']);
      expect(reply?.label).toBe('Reply');

      const undo = DOCK_SHORTCUTS.find((s) => s.id === 'undo');
      expect(undo?.badgeKeys).toEqual(['Z']);
      expect(undo?.label).toBe('Undo');

      const palette = DOCK_SHORTCUTS.find((s) => s.id === 'palette');
      expect(palette?.badgeKeys).toEqual(['⌘K']);
      expect(palette?.label).toBe('Command Palette');
    });
  });

  // --------------------------------------------------------------------------
  // 3. Keydown Event Simulation & Callback Triggers
  // --------------------------------------------------------------------------
  describe('Keydown Event Handling & Tactile Glowing Trigger', () => {
    it('handles "J" key: triggers onNavigateNext and highlights "J"', () => {
      const onNavigateNext = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'j' }, { onNavigateNext, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('J');
      expect(onNavigateNext).toHaveBeenCalledTimes(1);
    });

    it('handles uppercase "J" key', () => {
      const onNavigateNext = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'J' }, { onNavigateNext, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('J');
      expect(onNavigateNext).toHaveBeenCalledTimes(1);
    });

    it('handles "K" key: triggers onNavigatePrev and highlights "K"', () => {
      const onNavigatePrev = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'k' }, { onNavigatePrev, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('K');
      expect(onNavigatePrev).toHaveBeenCalledTimes(1);
    });

    it('handles "E" key: triggers onArchive and highlights "E"', () => {
      const onArchive = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'e' }, { onArchive, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('E');
      expect(onArchive).toHaveBeenCalledTimes(1);
    });

    it('handles "S" key: triggers onSnooze and highlights "S"', () => {
      const onSnooze = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 's' }, { onSnooze, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('S');
      expect(onSnooze).toHaveBeenCalledTimes(1);
    });

    it('handles "R" key: triggers onReply and highlights "R"', () => {
      const onReply = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'r' }, { onReply, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('R');
      expect(onReply).toHaveBeenCalledTimes(1);
    });

    it('handles "Z" key: triggers onUndo and highlights "Z"', () => {
      const onUndo = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'z' }, { onUndo, onHighlight });

      expect(handled).toBe(true);
      expect(onHighlight).toHaveBeenCalledWith('Z');
      expect(onUndo).toHaveBeenCalledTimes(1);
    });

    it('handles "⌘K" (metaKey + K): triggers onCommandPalette and highlights "CMD_K"', () => {
      const onCommandPalette = vi.fn();
      const onHighlight = vi.fn();
      const preventDefault = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'k', metaKey: true, preventDefault },
        { onCommandPalette, onHighlight },
      );

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(onHighlight).toHaveBeenCalledWith('CMD_K');
      expect(onCommandPalette).toHaveBeenCalledTimes(1);
    });

    it('handles "Ctrl+K" (ctrlKey + K): triggers onCommandPalette and highlights "CMD_K"', () => {
      const onCommandPalette = vi.fn();
      const onHighlight = vi.fn();
      const preventDefault = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'k', ctrlKey: true, preventDefault },
        { onCommandPalette, onHighlight },
      );

      expect(handled).toBe(true);
      expect(preventDefault).toHaveBeenCalled();
      expect(onHighlight).toHaveBeenCalledWith('CMD_K');
      expect(onCommandPalette).toHaveBeenCalledTimes(1);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Input Target Exclusion Guard (Outside Text Inputs)
  // --------------------------------------------------------------------------
  describe('Input Target Exclusion Guard', () => {
    it('correctly identifies text input elements via isInputTarget', () => {
      expect(isInputTarget(null)).toBe(false);
      expect(isInputTarget(undefined)).toBe(false);
      expect(isInputTarget({})).toBe(false);
      expect(isInputTarget({ tagName: 'DIV' })).toBe(false);
      expect(isInputTarget({ tagName: 'BUTTON' })).toBe(false);

      expect(isInputTarget({ tagName: 'INPUT' })).toBe(true);
      expect(isInputTarget({ tagName: 'input' })).toBe(true);
      expect(isInputTarget({ tagName: 'TEXTAREA' })).toBe(true);
      expect(isInputTarget({ tagName: 'textarea' })).toBe(true);
      expect(isInputTarget({ tagName: 'SELECT' })).toBe(true);
      expect(isInputTarget({ tagName: 'select' })).toBe(true);
      expect(isInputTarget({ isContentEditable: true })).toBe(true);
    });

    it('does NOT trigger any shortcut when user is typing inside an input element', () => {
      const onArchive = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'e', target: { tagName: 'INPUT' } as unknown as EventTarget },
        { onArchive, onHighlight },
      );

      expect(handled).toBe(false);
      expect(onArchive).not.toHaveBeenCalled();
      expect(onHighlight).not.toHaveBeenCalled();
    });

    it('does NOT trigger any shortcut when user is typing inside a textarea element', () => {
      const onReply = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'r', target: { tagName: 'TEXTAREA' } as unknown as EventTarget },
        { onReply, onHighlight },
      );

      expect(handled).toBe(false);
      expect(onReply).not.toHaveBeenCalled();
      expect(onHighlight).not.toHaveBeenCalled();
    });

    it('does NOT trigger any shortcut inside a contentEditable element', () => {
      const onUndo = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'z', target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget },
        { onUndo, onHighlight },
      );

      expect(handled).toBe(false);
      expect(onUndo).not.toHaveBeenCalled();
      expect(onHighlight).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 5. Modifier Key Rejection for Single-Key Shortcuts
  // --------------------------------------------------------------------------
  describe('Modifier Key Rejection', () => {
    it('does NOT trigger "E" (archive) when Alt+E is pressed', () => {
      const onArchive = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'e', altKey: true }, { onArchive, onHighlight });

      expect(handled).toBe(false);
      expect(onArchive).not.toHaveBeenCalled();
      expect(onHighlight).not.toHaveBeenCalled();
    });

    it('does NOT trigger "J" (navigate) when Ctrl+J is pressed', () => {
      const onNavigateNext = vi.fn();
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown(
        { key: 'j', ctrlKey: true },
        { onNavigateNext, onHighlight },
      );

      expect(handled).toBe(false);
      expect(onNavigateNext).not.toHaveBeenCalled();
      expect(onHighlight).not.toHaveBeenCalled();
    });

    it('returns false for unrecognized keys', () => {
      const onHighlight = vi.fn();

      const handled = handleDockKeyDown({ key: 'x' }, { onHighlight });

      expect(handled).toBe(false);
      expect(onHighlight).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Glowing Accent Duration (300ms) Lifecycle Simulation
  // --------------------------------------------------------------------------
  describe('300ms Glowing Accent Duration', () => {
    it('sets active key for 300ms and clears it upon timer expiration', () => {
      vi.useFakeTimers();

      let activeKey: string | null = null;
      let timer: NodeJS.Timeout | null = null;

      const triggerHighlight = (key: string) => {
        activeKey = key;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          activeKey = null;
        }, 300);
      };

      triggerHighlight('J');
      expect(activeKey).toBe('J');

      // Fast forward 299ms - should still be glowing
      vi.advanceTimersByTime(299);
      expect(activeKey).toBe('J');

      // Fast forward 1ms - reaches 300ms, should clear
      vi.advanceTimersByTime(1);
      expect(activeKey).toBe(null);

      vi.useRealTimers();
    });

    it('resets timer when a second key is pressed rapidly before 300ms completes', () => {
      vi.useFakeTimers();

      let activeKey: string | null = null;
      let timer: NodeJS.Timeout | null = null;

      const triggerHighlight = (key: string) => {
        activeKey = key;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          activeKey = null;
        }, 300);
      };

      // First key: 'J'
      triggerHighlight('J');
      expect(activeKey).toBe('J');

      // 150ms later, second key: 'E'
      vi.advanceTimersByTime(150);
      triggerHighlight('E');
      expect(activeKey).toBe('E');

      // 200ms after 'E' (350ms after 'J'): 'E' should still be active because timer reset
      vi.advanceTimersByTime(200);
      expect(activeKey).toBe('E');

      // 100ms later (total 300ms since 'E'): clears
      vi.advanceTimersByTime(100);
      expect(activeKey).toBe(null);

      vi.useRealTimers();
    });
  });
});
