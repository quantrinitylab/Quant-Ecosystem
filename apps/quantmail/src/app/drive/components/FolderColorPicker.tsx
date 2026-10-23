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
 */
export function FolderColorPicker({ selected, onSelect, onClose, anchor, label }: FolderColorPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

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
    >
      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2 px-1">
        Folder color
      </p>
      <div className="grid grid-cols-4 gap-2">
        {FOLDER_COLORS.map((c) => {
          const active = selected?.toUpperCase() === c.hex;
          return (
            <button
              key={c.hex}
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
