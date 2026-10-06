'use client';

// ============================================================================
// QuantAI — ArtifactRow: list-mode row (Muse parity).
// Icon · title + subtitle · kebab menu (Delete with confirm).
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { artifactIcon, artifactSubtitle, type ArtifactListItem } from './types';

interface ArtifactRowProps {
  item: ArtifactListItem;
  onOpen: (item: ArtifactListItem) => void;
  onDelete: (item: ArtifactListItem) => void;
  deleting?: boolean;
}

export function ArtifactRow({ item, onOpen, onDelete, deleting = false }: ArtifactRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
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
      className="w-full flex items-center gap-4 px-5 py-4 rounded-3xl bg-zinc-900/80 border border-zinc-800/60 hover:bg-zinc-900 hover:border-zinc-700 transition-colors cursor-pointer text-left"
    >
      <span className="text-2xl shrink-0" aria-hidden="true">
        {artifactIcon(item)}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[17px] font-medium text-white truncate">
          {item.title}
        </span>
        <span className="block text-[13px] text-zinc-500 mt-0.5">
          {artifactSubtitle(item)}
        </span>
      </span>

      <div ref={menuRef} className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          aria-label={`Options for ${item.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => {
            setMenuOpen((v) => !v);
            setConfirmDelete(false);
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          ⋮
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-9 z-40 w-44 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl shadow-black/60 py-1.5"
          >
            {!confirmDelete ? (
              <button
                type="button"
                role="menuitem"
                disabled={deleting || item.systemFile}
                title={item.systemFile ? 'System files cannot be deleted' : 'Delete artifact'}
                onClick={() => setConfirmDelete(true)}
                className="w-full px-4 py-2.5 text-left text-[15px] text-red-400 hover:bg-zinc-800/70 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                🗑️ Delete
              </button>
            ) : (
              <>
                <div className="px-4 py-2 text-[13px] text-zinc-400">
                  Delete “{item.title}”?
                </div>
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleting}
                  onClick={() => {
                    onDelete(item);
                    setMenuOpen(false);
                    setConfirmDelete(false);
                  }}
                  className="w-full px-4 py-2.5 text-left text-[15px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {deleting ? 'Deleting…' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => setConfirmDelete(false)}
                  className="w-full px-4 py-2.5 text-left text-[15px] text-zinc-200 hover:bg-zinc-800/70 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ArtifactRow;
