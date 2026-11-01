'use client';

/**
 * Outlook iOS Flow #2 — Adding a category (Contacts / Calendar / Mail)
 * (Microsoft Outlook iOS Adding a category.zip — Screens 0 through 6).
 *
 * Implements the 3-step Outlook Category flow:
 *   - Screen 0 & 6 (`inline`): "Categorise" field inside New/Edit Contact with
 *     colored removable category pills (`× Category`) and a `+` button.
 *   - Screen 1 & 5 (`list`): "Categorise" picker with `<` back, search bar,
 *     colored tag rows with `✓` selection state, `Show all` expander, and
 *     `+ New category` row.
 *   - Screen 2, 3 & 4 (`create`): "New category" form with `<` back, `✓` save
 *     button, "Name for your category" input, and the 25-swatch Outlook
 *     circular colour grid.
 *
 * Persistence:
 *   - Selected categories are written directly into the contact's `tags` CSV
 *     string (persisted to `POST /contacts` and `PUT /contacts/:id`).
 *   - Custom categories and their chosen colours are persisted to
 *     `localStorage` (`quant-outlook-categories`) and synced with the backend
 *     labels API (`apiClient.getLabels` / `apiClient.createLabel`).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../services/api-client';
import { showToast } from '../../../components/InboxToast';

export type CategoryPickerStep = 'inline' | 'list' | 'create';

export interface OutlookCategoryOption {
  name: string;
  color: string;
}

export const OUTLOOK_CATEGORY_STORAGE_KEY = 'quant-outlook-categories';

/**
 * The 25-colour circular swatch palette from Microsoft Outlook iOS "New category"
 * (Screens 2, 3, 4: 4 rows of 6 swatches + 1 swatch on row 5 = 25 colours).
 */
export const OUTLOOK_25_CATEGORY_COLORS: readonly { id: string; label: string; hex: string }[] = [
  // Row 1
  { id: 'coral-red', label: 'Coral Red', hex: '#E74856' },
  { id: 'burgundy', label: 'Burgundy', hex: '#750B1C' },
  { id: 'orange', label: 'Orange', hex: '#F7630C' },
  { id: 'rust', label: 'Rust', hex: '#CA5010' },
  { id: 'peach', label: 'Peach', hex: '#FFAA44' },
  { id: 'brown', label: 'Brown', hex: '#8E562E' },
  // Row 2
  { id: 'yellow', label: 'Yellow', hex: '#FFF100' },
  { id: 'gold', label: 'Gold', hex: '#C19C00' },
  { id: 'lime', label: 'Lime Green', hex: '#498205' },
  { id: 'forest', label: 'Forest Green', hex: '#107C10' },
  { id: 'teal', label: 'Teal', hex: '#00B7C3' },
  { id: 'dark-teal', label: 'Dark Teal', hex: '#038387' },
  // Row 3
  { id: 'olive', label: 'Olive', hex: '#6BB700' },
  { id: 'emerald', label: 'Emerald', hex: '#0B6A0B' },
  { id: 'sky-blue', label: 'Sky Blue', hex: '#0099BC' },
  { id: 'navy', label: 'Navy Blue', hex: '#002050' },
  { id: 'lavender', label: 'Lavender', hex: '#8764B8' },
  { id: 'indigo', label: 'Indigo', hex: '#3B145B' },
  // Row 4
  { id: 'pink', label: 'Pink', hex: '#F495BF' },
  { id: 'plum', label: 'Plum', hex: '#5C005C' },
  { id: 'slate', label: 'Slate Grey', hex: '#8A9597' },
  { id: 'steel-blue', label: 'Steel Blue', hex: '#004E64' },
  { id: 'warm-grey', label: 'Warm Grey', hex: '#A19F9D' },
  { id: 'charcoal', label: 'Charcoal', hex: '#5D5A58' },
  // Row 5
  { id: 'black', label: 'Obsidian Black', hex: '#111111' },
];

export const DEFAULT_OUTLOOK_CATEGORIES: readonly OutlookCategoryOption[] = [
  { name: 'Blue category', color: '#0099BC' },
  { name: 'Green category', color: '#498205' },
  { name: 'Orange category', color: '#F7630C' },
  { name: 'Purple category', color: '#8764B8' },
  { name: 'Red category', color: '#E74856' },
  { name: 'Yellow category', color: '#C19C00' },
];

export function parseTagsCsv(tagsCsv: string): string[] {
  return tagsCsv
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function serializeTagsCsv(tags: string[]): string {
  return Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).join(', ');
}

function TagIcon({ color }: { color: string }) {
  return (
    <svg
      className="size-4 flex-none"
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="#111111" stroke="none" />
    </svg>
  );
}

export interface OutlookCategoryPickerProps {
  tagsCsv: string;
  onChangeTagsCsv: (nextCsv: string) => void;
  initialStep?: CategoryPickerStep;
}

export function OutlookCategoryPicker({
  tagsCsv,
  onChangeTagsCsv,
  initialStep = 'inline',
}: OutlookCategoryPickerProps) {
  const [step, setStep] = useState<CategoryPickerStep>(initialStep);
  const [categories, setCategories] = useState<OutlookCategoryOption[]>([
    ...DEFAULT_OUTLOOK_CATEGORIES,
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<string>(
    OUTLOOK_25_CATEGORY_COLORS[0]!.hex,
  );
  const [savingCategory, setSavingCategory] = useState(false);

  const selectedTags = useMemo(() => parseTagsCsv(tagsCsv), [tagsCsv]);

  useEffect(() => {
    const merged = new Map<string, OutlookCategoryOption>();
    for (const preset of DEFAULT_OUTLOOK_CATEGORIES) {
      merged.set(preset.name.toLowerCase(), preset);
    }
    try {
      const raw = localStorage.getItem(OUTLOOK_CATEGORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OutlookCategoryOption[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item?.name && item?.color) {
              merged.set(item.name.toLowerCase(), item);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
    setCategories(Array.from(merged.values()));

    void apiClient.getLabels().then((res) => {
      if (!res.success || !Array.isArray(res.data)) return;
      setCategories((prev) => {
        const map = new Map(prev.map((c) => [c.name.toLowerCase(), c]));
        for (const label of res.data!) {
          if (label.name && !map.has(label.name.toLowerCase())) {
            map.set(label.name.toLowerCase(), {
              name: label.name,
              color: label.color || '#00B7C3',
            });
          }
        }
        return Array.from(map.values());
      });
    });
  }, []);

  const getColorForTag = useCallback(
    (tagName: string): string => {
      const found = categories.find((c) => c.name.toLowerCase() === tagName.toLowerCase());
      return found?.color ?? '#00B7C3';
    },
    [categories],
  );

  const handleToggleTag = useCallback(
    (categoryName: string) => {
      const exists = selectedTags.some((t) => t.toLowerCase() === categoryName.toLowerCase());
      const next = exists
        ? selectedTags.filter((t) => t.toLowerCase() !== categoryName.toLowerCase())
        : [...selectedTags, categoryName];
      onChangeTagsCsv(serializeTagsCsv(next));
    },
    [onChangeTagsCsv, selectedTags],
  );

  const handleRemoveTag = useCallback(
    (categoryName: string) => {
      const next = selectedTags.filter((t) => t.toLowerCase() !== categoryName.toLowerCase());
      onChangeTagsCsv(serializeTagsCsv(next));
    },
    [onChangeTagsCsv, selectedTags],
  );

  const handleCreateCategory = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || savingCategory) return;
    setSavingCategory(true);

    const created: OutlookCategoryOption = {
      name: trimmed,
      color: newCategoryColor,
    };

    const nextCategories = [
      created,
      ...categories.filter((c) => c.name.toLowerCase() !== trimmed.toLowerCase()),
    ];
    setCategories(nextCategories);

    try {
      localStorage.setItem(OUTLOOK_CATEGORY_STORAGE_KEY, JSON.stringify(nextCategories));
    } catch {
      /* ignore */
    }

    // Also sync to backend labels when available
    try {
      await apiClient.createLabel({ name: trimmed, color: newCategoryColor });
    } catch {
      /* backend label creation is best-effort alongside contact tags */
    }

    // Automatically select the newly created category on the contact (Screen 5)
    if (!selectedTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      onChangeTagsCsv(serializeTagsCsv([...selectedTags, trimmed]));
    }

    setSavingCategory(false);
    setNewCategoryName('');
    setStep('list');
    showToast({ text: `Category "${trimmed}" created`, type: 'success' });
  }, [categories, newCategoryColor, newCategoryName, onChangeTagsCsv, savingCategory, selectedTags]);

  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = q
      ? categories.filter((c) => c.name.toLowerCase().includes(q))
      : categories;
    if (!q && !showAll && list.length > 5) {
      return list.slice(0, 5);
    }
    return list;
  }, [categories, searchQuery, showAll]);

  // ─── SCREEN 2, 3, 4: New category (Name + 25-colour grid) ──────────────────
  if (step === 'create') {
    return (
      <div
        data-testid="outlook-category-create"
        className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 space-y-3"
      >
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2.5">
          <button
            type="button"
            onClick={() => setStep('list')}
            aria-label="Back to Categorise"
            className="text-xs font-medium text-[var(--app-accent)] hover:underline"
          >
            ← Back
          </button>
          <span className="text-xs font-semibold text-white">New category</span>
          <button
            type="button"
            disabled={!newCategoryName.trim() || savingCategory}
            onClick={() => void handleCreateCategory()}
            aria-label="Save new category"
            className="text-xs font-bold text-[var(--app-accent)] disabled:opacity-40"
          >
            ✓ Save
          </button>
        </div>

        <div>
          <label
            htmlFor="outlook-new-category-name"
            className="block text-[11px] font-medium text-[var(--quant-muted-foreground)] mb-1"
          >
            Name for your category
          </label>
          <input
            id="outlook-new-category-name"
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Name for your category"
            maxLength={40}
            className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-2 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)]"
          />
        </div>

        <div>
          <span className="block text-[11px] font-medium text-[var(--quant-muted-foreground)] mb-2">
            Colour
          </span>
          <div
            role="radiogroup"
            aria-label="Category colour"
            className="grid grid-cols-6 gap-2.5"
          >
            {OUTLOOK_25_CATEGORY_COLORS.map((swatch) => {
              const isSelected = newCategoryColor.toLowerCase() === swatch.hex.toLowerCase();
              return (
                <button
                  key={swatch.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={swatch.label}
                  onClick={() => setNewCategoryColor(swatch.hex)}
                  style={{ backgroundColor: swatch.hex }}
                  className={`grid size-8 place-items-center rounded-full text-xs font-bold text-white transition-transform ${
                    isSelected
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--quant-card)] scale-105'
                      : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  {isSelected ? '✓' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 1 & 5: Categorise list (Search + Colored Categories + New) ─────
  if (step === 'list') {
    return (
      <div
        data-testid="outlook-category-list"
        className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 space-y-2.5"
      >
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2">
          <button
            type="button"
            onClick={() => setStep('inline')}
            aria-label="Done selecting categories"
            className="text-xs font-medium text-[var(--app-accent)] hover:underline"
          >
            ← Done
          </button>
          <span className="text-xs font-semibold text-white">Categorise</span>
          <span className="w-10" aria-hidden="true" />
        </div>

        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search categories"
          className="w-full rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)]"
        />

        <div className="max-h-48 overflow-y-auto divide-y divide-[var(--quant-border)]">
          {filteredCategories.map((cat) => {
            const isSelected = selectedTags.some(
              (t) => t.toLowerCase() === cat.name.toLowerCase(),
            );
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => handleToggleTag(cat.name)}
                className="flex w-full items-center justify-between gap-2.5 py-2 px-1 text-left text-xs text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <TagIcon color={cat.color} />
                  <span className="truncate">{cat.name}</span>
                </span>
                {isSelected && (
                  <span className="text-xs font-bold text-[var(--app-accent)]" aria-label="Selected">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!searchQuery.trim() && !showAll && categories.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="w-full border-t border-[var(--quant-border)] pt-2 text-left text-xs font-medium text-[var(--quant-muted-foreground)] hover:text-white"
          >
            Show all
          </button>
        )}

        <button
          type="button"
          onClick={() => setStep('create')}
          className="flex w-full items-center justify-between border-t border-[var(--quant-border)] pt-2.5 text-left text-xs font-semibold text-[var(--app-accent)] hover:underline"
        >
          <span>+ New category</span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
    );
  }

  // ─── SCREEN 0 & 6: Inline Categorise Row inside New/Edit Contact ───────────
  return (
    <div className="space-y-1.5" data-testid="outlook-category-inline">
      <div className="flex items-center justify-between">
        <label
          htmlFor="contact-tags"
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--quant-muted-foreground)]"
        >
          <TagIcon color="currentColor" />
          <span>Categorise</span>
        </label>
        <button
          type="button"
          onClick={() => setStep('list')}
          aria-label="Open Categorise picker"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-0.5 text-xs font-semibold text-[var(--app-accent)] hover:bg-[var(--quant-surface-hover)]"
        >
          <span>+</span>
          <span>Categorise</span>
        </button>
      </div>

      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 py-0.5">
          {selectedTags.map((tag) => {
            const color = getColorForTag(tag);
            return (
              <span
                key={tag}
                style={{
                  borderColor: `${color}66`,
                  backgroundColor: `${color}1F`,
                  color,
                }}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-semibold"
              >
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  aria-label={`Remove category ${tag}`}
                  className="hover:opacity-75"
                >
                  ×
                </button>
                <span>{tag}</span>
              </span>
            );
          })}
        </div>
      )}

      <input
        id="contact-tags"
        name="tags"
        type="text"
        value={tagsCsv}
        onChange={(e) => onChangeTagsCsv(e.target.value)}
        placeholder="VIP, Executive, Engineering"
        className="w-full bg-[var(--quant-surface)] border border-[var(--quant-border)] rounded-lg px-3 py-2 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)]"
      />
    </div>
  );
}
