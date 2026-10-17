'use client';

// ============================================================================
// ContactsSlowLoadNotice — honest slow-load state for the contacts list.
// Rendered in place of the skeleton placeholders once the contacts page query
// has been pending past the slow-load threshold (see lib/use-slow-load).
// Copy states only what is true: the load is slow, nothing about the address
// book is claimed. Amber accent (contacts pillar), pure-black surface, no
// divider lines.
// ============================================================================

import React from 'react';

export interface ContactsSlowLoadNoticeProps {
  onRetry: () => void;
}

export const ContactsSlowLoadNotice: React.FC<ContactsSlowLoadNoticeProps> = ({ onRetry }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Contacts are taking longer than usual to load"
      className="rounded-2xl border border-[#232938] bg-[var(--quant-surface)] p-6 text-center space-y-3"
    >
      <div className="size-10 rounded-xl bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--app-accent)_35%,transparent)] flex items-center justify-center mx-auto text-[var(--app-accent)]">
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <p className="text-xs font-bold text-white">Taking longer than usual</p>
      <p className="text-[11px] text-[var(--quant-muted-foreground)]">
        Your contacts are still loading. Check your connection or try again.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-black text-xs font-bold transition-all shadow-sm"
      >
        Retry
      </button>
    </div>
  );
};
