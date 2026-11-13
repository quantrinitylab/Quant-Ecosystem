/**
 * U3.4 — the categories picker, one section inside the Filter
 * popover. It edits a DRAFT only: ticking a row, Select all and
 * Clear selection all change the draft; nothing reaches the inbox
 * list until Apply, and Cancel (or closing the popover, or the
 * footer's Clear) abandons the draft. The page re-seeds the draft
 * from the committed selection on every open, so an abandoned draft
 * can never resurface.
 *
 * The section renders nothing when closed — the popover unmounts
 * on close anyway, but `open === false` must also hide it while
 * the popover stays mounted, or a closed picker would still paint
 * its rows under the footer.
 *
 * Honesty copy, verbatim intent: categories are a best-effort
 * guess (server `aiCategory` where present, else the client
 * classifier; no automatic backfill), never a verified label.
 * The note below says so in the UI, not just in a comment.
 */
import { useMemo } from 'react';
import { CATEGORY_META, CATEGORY_ORDER, type SelectableCategory } from '../lib/category-filter';
import { IconCheck } from './icons';

/** Outlook 6 Color Categories (Red, Orange, Yellow, Green, Blue, Purple) */
export const OUTLOOK_COLOR_CATEGORIES = [
  { name: 'Red', color: '#EF4444' },
  { name: 'Orange', color: '#FF6B35' },
  { name: 'Yellow', color: '#F59E0B' },
  { name: 'Green', color: '#10B981' },
  { name: 'Blue', color: '#38BDF8' },
  { name: 'Purple', color: '#8B5CF6' },
] as const;

export type OutlookColorCategory = (typeof OUTLOOK_COLOR_CATEGORIES)[number];

export function getOutlookCategory(nameOrLabel: string): OutlookColorCategory | undefined {
  if (!nameOrLabel) return undefined;
  const norm = nameOrLabel.trim().toLowerCase();
  return OUTLOOK_COLOR_CATEGORIES.find(
    (c) =>
      c.name.toLowerCase() === norm ||
      `${c.name.toLowerCase()} category` === norm,
  );
}

export function OutlookCategoryPill({
  category,
  onRemove,
  className = '',
}: {
  category: string;
  onRemove?: () => void;
  className?: string;
}) {
  const cat = getOutlookCategory(category) ?? { name: category, color: '#6B7280' };
  return (
    <span
      data-testid={`category-pill-${cat.name.toLowerCase()}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 transition-colors ${className}`}
      style={{
        backgroundColor: `${cat.color}20`,
        borderColor: `${cat.color}55`,
        color: cat.color,
      }}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: cat.color }}
        aria-hidden="true"
      />
      <span>{cat.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove category ${cat.name}`}
          className="ml-0.5 hover:opacity-75 focus-visible:outline-none"
        >
          ×
        </button>
      )}
    </span>
  );
}

export interface OutlookColorCategoryPickerProps {
  selectedCategories: ReadonlySet<string> | readonly string[];
  onToggleCategory: (categoryName: string) => void;
  className?: string;
}

export function OutlookColorCategoryPicker({
  selectedCategories,
  onToggleCategory,
  className = '',
}: OutlookColorCategoryPickerProps) {
  const selectedSet = useMemo(() => {
    const set = new Set<string>();
    const items =
      selectedCategories instanceof Set ? Array.from(selectedCategories) : selectedCategories;
    for (const item of items) {
      set.add(item.toLowerCase());
      if (!item.toLowerCase().endsWith(' category')) {
        set.add(`${item.toLowerCase()} category`);
      }
    }
    return set;
  }, [selectedCategories]);

  return (
    <div
      role="group"
      aria-label="Outlook Color Categories"
      className={`py-1 space-y-0.5 ${className}`}
    >
      {OUTLOOK_COLOR_CATEGORIES.map((cat) => {
        const isSelected = selectedSet.has(cat.name.toLowerCase());
        return (
          <button
            key={cat.name}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            onClick={() => onToggleCategory(cat.name)}
            className="w-full min-h-[40px] px-3.5 flex items-center justify-between text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-3 rounded-full shrink-0 shadow-sm"
                style={{ backgroundColor: cat.color }}
              />
              <span
                className={`truncate ${
                  isSelected
                    ? 'text-[var(--quant-foreground)] font-bold'
                    : 'text-[var(--quant-muted-foreground)]'
                }`}
              >
                {cat.name}
              </span>
            </div>
            {isSelected && (
              <span className="text-[var(--quant-primary)]">
                <IconCheck size={14} strokeWidth={2.4} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface CategoryPickerProps {
  open: boolean;
  draft: ReadonlySet<SelectableCategory>;
  onDraftChange: (next: Set<SelectableCategory>) => void;
  /** Commit the draft as the inbox's category narrowing. */
  onApply: () => void;
  /** Abandon the draft; the committed selection is untouched. */
  onCancel: () => void;
}

export function CategoryPicker({ open, draft, onDraftChange, onApply, onCancel }: CategoryPickerProps) {
  if (!open) return null;

  const toggle = (category: SelectableCategory) => {
    const next = new Set(draft);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    onDraftChange(next);
  };

  return (
    <div
      role="group"
      aria-label="Categories"
      className="border-t border-[var(--quant-surface-elevated)]"
    >
      <p className="px-3 pt-3 pb-1 text-[11px] leading-snug text-[var(--quant-muted-foreground)]">
        Categories are a best-effort guess, not a verified label.
      </p>
      {CATEGORY_ORDER.map((category) => {
        const meta = CATEGORY_META[category];
        const isOn = draft.has(category);
        return (
          <button
            key={category}
            type="button"
            role="checkbox"
            aria-checked={isOn}
            onClick={() => toggle(category)}
            className="w-full min-h-[44px] px-3 flex items-center gap-2.5 text-left text-xs transition-colors hover:bg-[var(--quant-surface-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)]"
          >
            <span
              aria-hidden="true"
              className={`flex items-center justify-center size-[18px] shrink-0 rounded-[5px] border transition-colors ${
                isOn
                  ? 'bg-[var(--quant-primary)] border-[var(--quant-primary)] text-[var(--quant-background)]'
                  : 'border-[#3A404D] text-transparent'
              }`}
            >
              <IconCheck size={12} strokeWidth={2.4} />
            </span>
            <span
              aria-hidden="true"
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: meta.color }}
            />
            <span
              className={`flex-1 truncate ${isOn ? 'text-[var(--quant-foreground)] font-semibold' : 'text-[var(--quant-muted-foreground)]'}`}
            >
              {meta.label}
            </span>
          </button>
        );
      })}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-[var(--quant-surface-elevated)]">
        <button
          type="button"
          onClick={() => onDraftChange(new Set(CATEGORY_ORDER))}
          className="px-2 py-1.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => onDraftChange(new Set())}
          className="px-2 py-1.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Clear selection
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1.5 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--quant-primary)] text-[var(--quant-background)] hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Apply{draft.size > 0 ? ` (${draft.size})` : ''}
        </button>
      </div>
    </div>
  );
}
