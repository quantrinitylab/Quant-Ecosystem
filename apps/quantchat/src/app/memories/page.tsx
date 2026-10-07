// ============================================================================
// QuantChat - Memories Vault Page (Tasks 13.1, 13.2, 13.3, 13.4)
//
//  - Date-descending grid of saved photos, videos, stories, and reels (13.1)
//  - Full-media viewer with re-share / send / download (13.2)
//  - Search by date range, location, and caption text (13.3)
//  - Delete with a 5-second undo window (13.4): the row is soft-deleted on the
//    backend and permanently purged after 5s unless the user taps "Undo".
// ============================================================================
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { BottomNav } from '@quant/shared-ui';
import { useMemories, MEMORY_UNDO_WINDOW_MS, type Memory } from '../../hooks/useMemories';
import { MemoryGrid } from './components/MemoryGrid';
import { MemorySearch } from './components/MemorySearch';
import { MemoryViewer } from './components/MemoryViewer';
import { navItems, routes } from '../../lib/navigation';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 30 };

export default function MemoriesPage() {
  const router = useRouter();
  const { memories, isLoading, filters, setFilters, clearFilters, deleteMemory, restoreMemory } =
    useMemories();

  const [selected, setSelected] = useState<Memory | null>(null);
  const [undo, setUndo] = useState<{ id: string; remaining: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearUndoTimer = useCallback(() => {
    if (undoTimerRef.current) {
      clearInterval(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  // Delete → open the undo window with a live countdown (Task 13.4).
  const handleDelete = useCallback(
    async (id: string) => {
      const deletedId = await deleteMemory(id);
      if (!deletedId) return;

      clearUndoTimer();
      const startedAt = Date.now();
      setUndo({ id: deletedId, remaining: MEMORY_UNDO_WINDOW_MS });

      undoTimerRef.current = setInterval(() => {
        const remaining = MEMORY_UNDO_WINDOW_MS - (Date.now() - startedAt);
        if (remaining <= 0) {
          clearUndoTimer();
          setUndo(null);
        } else {
          setUndo({ id: deletedId, remaining });
        }
      }, 100);
    },
    [deleteMemory, clearUndoTimer],
  );

  const handleUndo = useCallback(async () => {
    if (!undo) return;
    clearUndoTimer();
    const id = undo.id;
    setUndo(null);
    await restoreMemory(id);
  }, [undo, restoreMemory, clearUndoTimer]);

  useEffect(() => clearUndoTimer, [clearUndoTimer]);

  return (
    <div className="min-h-dvh bg-gradient-to-b from-black via-zinc-950 to-black text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 pb-20">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              aria-label="Back to chats"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg transition hover:bg-white/20 active:scale-95"
            >
              &#8592;
            </button>
            <div>
              <h1 className="text-2xl font-bold">Memories</h1>
              <p className="text-sm text-gray-400">Your saved snaps, stories, and reels.</p>
            </div>
          </div>
        </header>

        <MemorySearch filters={filters} onChange={setFilters} onClear={clearFilters} />

        {isLoading && memories.length === 0 ? (
          <div className="flex justify-center py-24">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-fuchsia-400" />
          </div>
        ) : (
          <MemoryGrid memories={memories} onSelect={setSelected} />
        )}
      </div>

      <MemoryViewer memory={selected} onClose={() => setSelected(null)} onDelete={handleDelete} />

      {/* Undo toast — Task 13.4 */}
      <AnimatePresence>
        {undo && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={SPRING}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-zinc-800/95 px-4 py-3 shadow-xl backdrop-blur"
          >
            <span className="text-sm text-white">Memory deleted</span>
            <button
              type="button"
              onClick={handleUndo}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-1.5 text-sm font-semibold text-white active:scale-95"
            >
              Undo
              <span className="tabular-nums text-xs opacity-80">
                {Math.ceil(undo.remaining / 1000)}s
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav
        items={navItems}
        activeId="memories"
        onChange={(id) => {
          const route = routes[id];
          if (route) router.push(route);
        }}
      />
    </div>
  );
}
