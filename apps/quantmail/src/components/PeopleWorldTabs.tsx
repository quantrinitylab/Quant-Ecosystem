'use client';

/**
 * PeopleWorldTabs — segmented control switching between the three People-view
 * worlds: Log (1-to-1 conversations), Groups (2+ participants), Updates
 * (newsletters / receipts / notifications).
 *
 * Counts are honest: a badge renders only when the count is a real number
 * above zero. A zero count shows no badge — never a "0" or a placeholder.
 */

import { useRef } from 'react';
import type { ConversationWorld } from '../lib/peopleGrouping';

export interface PeopleWorldTabsProps {
  world: ConversationWorld;
  onChange: (world: ConversationWorld) => void;
  counts: Record<ConversationWorld, number>;
}

const TABS: { key: ConversationWorld; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'groups', label: 'Groups' },
  { key: 'updates', label: 'Updates' },
];

export function PeopleWorldTabs({ world, onChange, counts }: PeopleWorldTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusTab = (index: number) => {
    const el = tabRefs.current[index];
    if (el) el.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    if (next !== null) {
      event.preventDefault();
      onChange(TABS[next].key);
      focusTab(next);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Conversation worlds"
      className="flex w-full gap-1 rounded-full bg-zinc-900 p-1"
      data-testid="people-world-tabs"
    >
      {TABS.map((tab, index) => {
        const active = world === tab.key;
        const count = counts[tab.key];
        const showBadge = typeof count === 'number' && count > 0;
        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`world-panel-${tab.key}`}
            id={`world-tab-${tab.key}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            data-testid={`world-tab-${tab.key}`}
          >
            {tab.label}
            {showBadge && (
              <span
                className="min-w-[20px] rounded-full bg-black/50 px-1.5 py-0.5 text-center text-[11px] font-semibold text-zinc-200"
                data-testid={`tab-count-${tab.key}`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
