// ============================================================================
// Quanty Connectors — search input (Muse screenshot style).
// ============================================================================

import React from 'react';

export function ConnectorsSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <svg
        className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search connectors"
        aria-label="Search connectors"
        className="w-full bg-zinc-800/80 rounded-full pl-13 pr-5 py-4 text-[17px] text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20"
        style={{ paddingLeft: '3.25rem' }}
      />
    </div>
  );
}
