'use client';

import type { SearchSuggestion, SuggestionKind, SuggestionSections } from '../../lib/searchSuggestions';

// ============================================================================
// SearchSuggestions — the as-you-type dropdown under the /search field.
//
// Presentational by design: sections and the active (arrow-key) index come in
// as props, so this renders with renderToStaticMarkup in tests — no hooks,
// no network, no storage. The page owns data, keyboard state, and selection.
//
// Design lock: pure-black floating panel, rows on pure black with
// hover:bg-white/5, NO divider lines — separation comes from section
// headings and spacing, never from border or divide utilities.
// ============================================================================

type SuggestionIcon = 'search' | 'clock' | 'person' | 'tag';

const ICON_PATHS: Record<SuggestionIcon, React.ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  tag: <path d="M20 12 12 4H4v8l8 8 8-8Z" />,
};

function SuggestionIcon({ name, className = 'h-4 w-4' }: { name: SuggestionIcon; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

const KIND_ICON: Record<SuggestionKind, SuggestionIcon> = {
  query: 'clock',
  sender: 'person',
  label: 'tag',
};

const SECTION_TITLES: Array<{ key: keyof SuggestionSections; title: string }> = [
  { key: 'queries', title: 'Suggestions' },
  { key: 'senders', title: 'Senders' },
  { key: 'labels', title: 'Labels' },
];

export interface SearchSuggestionsProps {
  sections: SuggestionSections;
  /** Index into the flattened suggestion list, or -1 for none. */
  activeIndex: number;
  onSelect: (suggestion: SearchSuggestion) => void;
  /** listbox id, referenced by the input's aria-controls. */
  id: string;
}

export function SearchSuggestions({ sections, activeIndex, onSelect, id }: SearchSuggestionsProps) {
  let cursor = 0;

  return (
    <div
      id={id}
      role="listbox"
      aria-label="Search suggestions"
      className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-[var(--quant-border)] bg-black shadow-2xl shadow-black/60"
    >
      <div className="max-h-[min(60vh,380px)] overflow-y-auto py-1.5">
        {SECTION_TITLES.map(({ key, title }) => {
          const items = sections[key];
          if (items.length === 0) return null;
          const sectionStart = cursor;
          cursor += items.length;
          return (
            <div key={key}>
              <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--quant-muted-foreground)]">
                {title}
              </p>
              {items.map((item, i) => {
                const flatIndex = sectionStart + i;
                const isActive = flatIndex === activeIndex;
                return (
                  <button
                    key={`${item.kind}:${item.label}`}
                    type="button"
                    // Stable per-position id: the input's aria-activedescendant
                    // points here for the highlighted option, and nowhere when
                    // nothing is highlighted. tabIndex -1 keeps focus in the
                    // input — arrow keys move the highlight, Tab never lands
                    // on an option (mouse click still works: it needs no tab
                    // stop, and mousedown-preventDefault keeps input focus).
                    id={`${id}-option-${flatIndex}`}
                    tabIndex={-1}
                    role="option"
                    aria-selected={isActive}
                    // mousedown fires before the input's blur: preventDefault
                    // keeps focus (and the dropdown) alive so this click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelect(item)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                      isActive ? 'bg-white/10' : 'hover:bg-white/5'
                    }`}
                  >
                    <SuggestionIcon
                      name={KIND_ICON[item.kind]}
                      className="h-4 w-4 shrink-0 text-[var(--quant-muted-foreground)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-[var(--quant-foreground)]">
                      {item.label}
                    </span>
                    {item.kind !== 'query' && (
                      <span className="shrink-0 text-[11px] capitalize text-[var(--quant-muted-foreground)]">
                        {item.kind}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
