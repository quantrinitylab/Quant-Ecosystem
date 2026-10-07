// ============================================================================
// QuantChat - MemorySearch (Task 13.3)
// Date-range / location / caption-text search controls for the Memories vault.
// ============================================================================
'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import type { MemoryFilters } from '../../../hooks/useMemories';

interface MemorySearchProps {
  filters: MemoryFilters;
  onChange: (filters: MemoryFilters) => void;
  onClear: () => void;
}

export function MemorySearch({ filters, onChange, onClear }: MemorySearchProps) {
  const [local, setLocal] = useState<MemoryFilters>(filters);

  const update = useCallback((patch: Partial<MemoryFilters>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
  }, []);

  const apply = useCallback(() => {
    // Normalize empty strings to undefined and date inputs to ISO instants.
    const next: MemoryFilters = {};
    if (local.q?.trim()) next.q = local.q.trim();
    if (local.location?.trim()) next.location = local.location.trim();
    if (local.from) next.from = new Date(local.from).toISOString();
    if (local.to) next.to = new Date(local.to).toISOString();
    onChange(next);
  }, [local, onChange]);

  const clear = useCallback(() => {
    setLocal({});
    onClear();
  }, [onClear]);

  const hasFilters = Boolean(local.q || local.location || local.from || local.to);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          Caption
          <input
            type="text"
            value={local.q ?? ''}
            onChange={(e) => update({ q: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            placeholder="Search captions…"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          Location
          <input
            type="text"
            value={local.location ?? ''}
            onChange={(e) => update({ location: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && apply()}
            placeholder="e.g. Tokyo"
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          From
          <input
            type="date"
            value={local.from ? local.from.slice(0, 10) : ''}
            onChange={(e) => update({ from: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          To
          <input
            type="date"
            value={local.to ? local.to.slice(0, 10) : ''}
            onChange={(e) => update({ to: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-gradient-to-r from-fuchsia-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white transition active:scale-95"
        >
          Search
        </button>
        {hasFilters && (
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/5 active:scale-95"
          >
            Clear
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default MemorySearch;
