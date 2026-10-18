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

// ---------------------------------------------------------------------------
// QC-F-477 — the picked day is the user's LOCAL calendar day.
//
// The backend contract is inclusive instants (`createdAt` gte `from`,
// lte `to`); the defect was here: `new Date('2026-10-15')` parses a
// date-only string as UTC midnight, so `to` cut the picked day off at
// its very start (and `from` shifted by the local UTC offset). Bounds
// are therefore built from the date's parts with the LOCAL constructor
// — never by parsing the string and never with `setHours` on a parsed
// UTC-midnight date (west of UTC that lands on the previous local day).
// ---------------------------------------------------------------------------

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Normalize a stored filter value to the `YYYY-MM-DD` of the LOCAL
 * calendar day it denotes. A raw date-input value already IS a local
 * calendar day and passes through unchanged; a full ISO instant (what
 * `apply()` emits, e.g. after a remount) is read back through local
 * getters — NOT `slice(0, 10)`, which would show the UTC day. Returns
 * '' for empty/unparseable values.
 */
export function toLocalDateValue(value: string | undefined): string {
  if (!value) return '';
  if (DATE_ONLY_RE.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

/** ISO instant of the start (00:00:00.000 local) of the picked day, or null. */
export function localDayStartIso(value: string | undefined): string | null {
  return localDayBoundIso(value, false);
}

/** ISO instant of the end (23:59:59.999 local) of the picked day, or null. */
export function localDayEndIso(value: string | undefined): string | null {
  return localDayBoundIso(value, true);
}

function localDayBoundIso(value: string | undefined, endOfDay: boolean): string | null {
  const day = toLocalDateValue(value);
  const match = DATE_ONLY_RE.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const bound = endOfDay
    ? new Date(year, month - 1, date, 23, 59, 59, 999)
    : new Date(year, month - 1, date, 0, 0, 0, 0);
  // Component construction rolls invalid parts over (e.g. month 13);
  // reject anything that does not round-trip to the picked day.
  if (
    bound.getFullYear() !== year ||
    bound.getMonth() !== month - 1 ||
    bound.getDate() !== date
  ) {
    return null;
  }
  return bound.toISOString();
}

export function MemorySearch({ filters, onChange, onClear }: MemorySearchProps) {
  const [local, setLocal] = useState<MemoryFilters>(filters);

  const update = useCallback((patch: Partial<MemoryFilters>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
  }, []);

  const apply = useCallback(() => {
    // Normalize empty strings to undefined and date inputs to ISO instants
    // bounding the picked LOCAL calendar days (QC-F-477): `from` is the
    // start of its day, `to` the end of its day. An unparseable value
    // drops that filter instead of throwing on an Invalid Date.
    const next: MemoryFilters = {};
    if (local.q?.trim()) next.q = local.q.trim();
    if (local.location?.trim()) next.location = local.location.trim();
    if (local.from) {
      const from = localDayStartIso(local.from);
      if (from) next.from = from;
    }
    if (local.to) {
      const to = localDayEndIso(local.to);
      if (to) next.to = to;
    }
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
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base text-white placeholder:text-gray-500 focus:border-fuchsia-400 focus:outline-none"
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
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base text-white placeholder:text-gray-500 focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          From
          <input
            type="date"
            value={toLocalDateValue(local.from)}
            onChange={(e) => update({ from: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base text-white focus:border-fuchsia-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-300">
          To
          <input
            type="date"
            value={toLocalDateValue(local.to)}
            onChange={(e) => update({ to: e.target.value })}
            className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-base text-white focus:border-fuchsia-400 focus:outline-none"
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
