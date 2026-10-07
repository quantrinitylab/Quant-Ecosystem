// ============================================================================
// QuantChat - MemoryGrid (Task 13.1)
// Date-descending responsive grid of saved photos, videos, stories, and reels.
// Items are grouped under date headers; tapping an item opens the full viewer.
// ============================================================================
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Memory } from '../../../hooks/useMemories';

interface MemoryGridProps {
  memories: Memory[];
  onSelect: (memory: Memory) => void;
}

function formatDateHeading(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function dateKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export function MemoryGrid({ memories, onSelect }: MemoryGridProps) {
  // Group the (already date-descending) list into day buckets, preserving order.
  const groups = useMemo(() => {
    const map = new Map<string, Memory[]>();
    for (const memory of memories) {
      const key = dateKey(memory.createdAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(memory);
      else map.set(key, [memory]);
    }
    return Array.from(map.entries());
  }, [memories]);

  if (memories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
        <span className="text-4xl">🗂️</span>
        <p className="text-gray-400">No memories yet</p>
        <p className="text-sm text-gray-500">Saved snaps, stories, and reels will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {groups.map(([key, items]) => (
        <section key={key} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
            {formatDateHeading(items[0]!.createdAt)}
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((memory, index) => (
              <motion.button
                key={memory.id}
                type="button"
                onClick={() => onSelect(memory)}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(index * 0.02, 0.2) }}
                whileTap={{ scale: 0.95 }}
                className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-black/40"
              >
                {memory.mediaType === 'VIDEO' ? (
                  <video
                    src={memory.mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={memory.mediaUrl}
                    alt={memory.caption ?? 'Memory'}
                    className="h-full w-full object-cover"
                  />
                )}

                {memory.mediaType === 'VIDEO' && (
                  <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                    ▶ Video
                  </span>
                )}

                {(memory.caption || memory.location) && (
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                    {memory.caption && (
                      <p className="line-clamp-1 text-xs text-white">{memory.caption}</p>
                    )}
                    {memory.location && (
                      <p className="line-clamp-1 text-[10px] text-gray-300">📍 {memory.location}</p>
                    )}
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default MemoryGrid;
