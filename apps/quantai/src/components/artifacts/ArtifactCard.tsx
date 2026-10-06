'use client';

// ============================================================================
// QuantAI — ArtifactCard: grid-mode card (Muse parity).
// Icon · title · subtitle, kebab in the corner.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { artifactIcon, artifactSubtitle, type ArtifactListItem } from './types';

interface ArtifactCardProps {
  item: ArtifactListItem;
  onOpen: (item: ArtifactListItem) => void;
  onDelete: (item: ArtifactListItem) => void;
  deleting?: boolean;
}

export function ArtifactCard({ item, onOpen, onDelete, deleting = false }: ArtifactCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      className="relative flex flex-col gap-3 p-5 rounded-3xl bg-zinc-900/80 border border-zinc-800/60 hover:bg-zinc-900 hover:border-zinc-700 transition-colors cursor-pointer text-left min-h-[132px]"
    >
      <div className="flex items-start justify-between">
        <span className="text-3xl" aria-hidden="true">
          {artifactIcon(item)}
        </span>
        <div ref={menuRef} className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`Options for ${item.title}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="w-8 h-8 -mr-2 -mt-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            ⋮
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 z-40 w-44 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/60 py-1.5"
            >
              <button
                type="button"
                role="menuitem"
                disabled={deleting || item.systemFile}
                title={item.systemFile ? 'System files cannot be deleted' : 'Delete artifact'}
                onClick={() => {
                  if (window.confirm(`Delete “${item.title}”?`)) onDelete(item);
                  setMenuOpen(false);
                }}
                className="w-full px-4 py-2.5 text-left text-[15px] text-red-400 hover:bg-zinc-800/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {deleting ? 'Deleting…' : '🗑️ Delete'}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="min-w-0 mt-auto">
        <div className="text-[15px] font-medium text-white truncate">{item.title}</div>
        <div className="text-[13px] text-zinc-500 mt-0.5">{artifactSubtitle(item)}</div>
      </div>
    </div>
  );
}

export default ArtifactCard;
