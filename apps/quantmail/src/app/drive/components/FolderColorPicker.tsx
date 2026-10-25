'use client';

import React, { useEffect, useRef } from 'react';
import { FOLDER_COLORS } from '../../../lib/folder-colors';

export interface FolderColorPickerProps {
  /** Currently selected color hex, or null for the default tint. */
  selected: string | null;
  onSelect: (hex: string | null) => void;
  onClose: () => void;
  /** Screen position of the popover (clientX/clientY from the opener). */
  anchor: { x: number; y: number };
  label: string;
}

/**
 * Drive-style folder color picker: 16 fixed swatches + "No color" reset.
 * Renders as a fixed-position popover anchored near the click/tap point, on
 * pure-black per the QuantMail UI rules (no divider lines).
 *
 * Focus contract (applies identically at all three invocation points —
 * right-click context menu, hover palette action, breadcrumb palette
 * control — because every one renders this same component):
 * - Opening moves focus INTO the picker: the selected swatch, else the
 *   first swatch. A keyboard user never has to hunt for the popover.
 * - Closing by ANY path (Escape, swatch/reset selection, backdrop
 *   pointer-down) returns focus to the element that was focused when the
 *   picker opened, via the unmount cleanup below. If that element is gone
 *   by close time (e.g. the context-menu item unmounted when the palette
 *   replaced the menu), the restore is a silent no-op — never a focus
 *   error, never focus thrown at a detached node.
 * - Arrow keys move across all 17 controls in grid order (Left/Right ±1
 *   with wraparound, Up/Down ±4 clamped to the grid, Home/End to the
 *   first/last control). Tab is deliberately NOT trapped: no focus trap
 *   is installed, so Tab follows native DOM order out of the popover.
 */
export function FolderColorPicker({ selected, onSelect, onClose, anchor, label }: FolderColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  // One entry per focusable control: 16 swatches + the "No color" reset.
  const controlRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Capture BEFORE moving focus: whatever was focused at open time is
    // where focus returns on close (when it still exists).
    const previouslyFocused = document.activeElement;
    const selectedIndex = FOLDER_COLORS.findIndex(
      (c) => selected?.toUpperCase() === c.hex,
    );
    const initial = controlRefs.current[selectedIndex >= 0 ? selectedIndex : 0];
    initial?.focus();
    return () => {
      // Unmount = close, whatever path closed it. Restore only when the
      // opener is still a live, connected element; otherwise no-op.
      try {
        if (previouslyFocused instanceof HTMLElement && document.contains(previouslyFocused)) {
          previouslyFocused.focus();
        }
      } catch {
        // Focus restore must never throw: a detached opener is a no-op.
      }
    };
  }, [selected]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  // Arrow-key navigation across the swatch grid + reset control. The grid
  // is 4 columns; the reset button is index 16, the row after the grid.
  const handleGridKeyDown = (e: React.KeyboardEvent) => {
    const controls = controlRefs.current;
    const currentIndex = controls.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % controls.length;
    else if (e.key === 'ArrowLeft')
      nextIndex = (currentIndex - 1 + controls.length) % controls.length;
    else if (e.key === 'ArrowDown') nextIndex = Math.min(currentIndex + 4, controls.length - 1);
    else if (e.key === 'ArrowUp') nextIndex = Math.max(currentIndex - 4, 0);
    else if (e.key === 'Home') nextIndex = 0;
    else if (e.key === 'End') nextIndex = controls.length - 1;
    if (nextIndex === null) return;
    e.preventDefault();
    controls[nextIndex]?.focus();
  };

  // Keep the popover inside the viewport.
  const width = 208;
  const height = 216;
  const x = Math.max(8, Math.min(anchor.x, window.innerWidth - width - 8));
  const y = Math.max(8, Math.min(anchor.y, window.innerHeight - height - 8));

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Folder color for ${label}`}
      className="fixed z-[80] rounded-xl bg-black border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-3"
      style={{ left: x, top: y, width }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleGridKeyDown}
    >
      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 px-1">
        Folder color
      </p>
      <div className="grid grid-cols-4 gap-2">
        {FOLDER_COLORS.map((c, i) => {
          const active = selected?.toUpperCase() === c.hex;
          return (
            <button
              key={c.hex}
              ref={(el) => {
                controlRefs.current[i] = el;
              }}
              type="button"
              title={c.name}
              aria-label={`Color ${c.name}`}
              aria-pressed={active}
              onClick={() => {
                onSelect(c.hex);
                onClose();
              }}
              className={`size-10 rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                active ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
      </div>
      <button
        ref={(el) => {
          controlRefs.current[FOLDER_COLORS.length] = el;
        }}
        type="button"
        onClick={() => {
          onSelect(null);
          onClose();
        }}
        className="mt-2.5 w-full rounded-lg px-3 py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        No color (default)
      </button>
    </div>
  );
}
