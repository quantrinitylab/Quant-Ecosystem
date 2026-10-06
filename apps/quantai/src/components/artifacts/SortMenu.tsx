'use client';

// ============================================================================
// QuantAI — SortMenu: Muse-style artifacts sort popover.
// Show as Grid / Show as List · Sort by last modified / opened / name · System Files
// ============================================================================

import React, { useEffect, useRef } from 'react';
import { SORT_LABELS, type ArtifactSortKey, type ArtifactView } from './types';

interface SortMenuProps {
  open: boolean;
  view: ArtifactView;
  sort: ArtifactSortKey;
  showSystemFiles: boolean;
  onViewChange: (view: ArtifactView) => void;
  onSortChange: (sort: ArtifactSortKey) => void;
  onToggleSystemFiles: () => void;
  onClose: () => void;
}

const VIEW_OPTIONS: { key: ArtifactView; label: string; icon: string }[] = [
  { key: 'grid', label: 'Show as Grid', icon: '▦' },
  { key: 'list', label: 'Show as List', icon: '☰' },
];

const SORT_OPTIONS: { key: ArtifactSortKey; icon: string }[] = [
  { key: 'modified', icon: '✎' },
  { key: 'opened', icon: '🕐' },
  { key: 'name', icon: 'Aa' },
];

export function SortMenu({
  open,
  view,
  sort,
  showSystemFiles,
  onViewChange,
  onSortChange,
  onToggleSystemFiles,
  onClose,
}: SortMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Artifacts view and sort options"
      className="absolute right-0 top-12 z-50 w-64 rounded-3xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/60 py-2 animate-in fade-in duration-150"
    >
      {VIEW_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="menuitemradio"
          aria-checked={view === opt.key}
          onClick={() => {
            onViewChange(opt.key);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-[15px] text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
        >
          <span className="w-6 text-center text-zinc-300 text-lg">{opt.icon}</span>
          <span className="flex-1">{opt.label}</span>
          {view === opt.key && <span className="text-zinc-100">✓</span>}
        </button>
      ))}

      <div className="mx-4 my-1.5 border-t border-zinc-800" />

      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          role="menuitemradio"
          aria-checked={sort === opt.key}
          onClick={() => {
            onSortChange(opt.key);
            onClose();
          }}
          className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-[15px] text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
        >
          <span className="w-6 text-center text-zinc-300 text-lg">{opt.icon}</span>
          <span className="flex-1">{SORT_LABELS[opt.key]}</span>
          {sort === opt.key && <span className="text-zinc-100">✓</span>}
        </button>
      ))}

      <div className="mx-4 my-1.5 border-t border-zinc-800" />

      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={showSystemFiles}
        onClick={() => {
          onToggleSystemFiles();
          onClose();
        }}
        className="w-full flex items-center gap-3 px-5 py-2.5 text-left text-[15px] text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
      >
        <span className="w-6 text-center text-zinc-300 text-lg">🗂️</span>
        <span className="flex-1">System Files</span>
        {showSystemFiles && <span className="text-zinc-100">✓</span>}
      </button>
    </div>
  );
}

export default SortMenu;
