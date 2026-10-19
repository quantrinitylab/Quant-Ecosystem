'use client';

import React from 'react';

/**
 * Explicit id → display-label constants for the /contacts tab strips.
 *
 * qm-contacts-secondary-tabs-labels (2026-10-20): the mobile secondary strip
 * used to render raw tab ids ('companies'/'dedup'/'groups') through the CSS
 * `capitalize` class — the user-visible label was derived from code style, not
 * explicit copy, so a locale or Tailwind-class change could silently rename
 * the tabs. Tab text now comes ONLY from these constants; `capitalize` must
 * never be used to manufacture tab labels.
 */
export const SUBVIEW_TABS = [
  { id: 'all', label: 'All' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'companies', label: 'Companies' },
  { id: 'dedup', label: 'Dedup' },
  { id: 'groups', label: 'Groups' },
] as const;

export type ContactsTabId = (typeof SUBVIEW_TABS)[number]['id'];

/** Ids rendered by the mobile secondary strip (subset of SUBVIEW_TABS). */
export const SECONDARY_TAB_IDS = ['companies', 'dedup', 'groups'] as const;

export type SecondaryTabId = (typeof SECONDARY_TAB_IDS)[number];

/** Explicit display label for a secondary tab id — never the raw id. */
export function secondaryTabLabel(id: SecondaryTabId): string {
  // Single source of truth is SUBVIEW_TABS. The ?? fallback keeps the button
  // honest (never blank) if a constant ever drops an entry.
  return SUBVIEW_TABS.find((t) => t.id === id)?.label ?? id;
}

/**
 * Mobile-only secondary tabs: real entry points to the Companies/Dedup/Groups
 * sub-views (previously reachable only by hand-typed ?tab= URLs).
 * md:hidden — on desktop the pinned sidebar rail already lists
 * Companies/Groups/Dedup; showing them here too duplicated the same
 * destinations on one screen.
 */
export function ContactsSecondaryTabStrip({
  activeTab,
  onTabChange,
}: {
  activeTab: ContactsTabId;
  onTabChange: (tab: SecondaryTabId) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 md:hidden">
      {SECONDARY_TAB_IDS.map((tabId) => (
        <button
          key={tabId}
          type="button"
          onClick={() => onTabChange(tabId)}
          aria-current={activeTab === tabId ? 'page' : undefined}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-all ${
            activeTab === tabId
              ? 'bg-[var(--app-accent)]/20 text-[var(--app-accent)] border border-[var(--app-accent)]/40 shadow-sm'
              : 'text-[var(--quant-muted-foreground)] hover:text-white border border-transparent'
          }`}
        >
          {secondaryTabLabel(tabId)}
        </button>
      ))}
    </div>
  );
}
