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
import { CATEGORY_META, CATEGORY_ORDER, type SelectableCategory } from '../lib/category-filter';
import { IconCheck } from './icons';

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
