'use client';

/**
 * ContactCategoryPicker & ContactModalSheet — Mobile-first Contact creation/editing
 * and Category management (Screens 0 through 6):
 *   - Screen 0 & 6 (`inline`): Full sheet with circular camera avatar, icon-aligned
 *     rows (`Title`, `First name`, `Surname`, `Email type`, `Email address`,
 *     `Phone type`, `Phone number`, `Company`, and `Categorise` with coloured
 *     removable pills and `+` button).
 *   - Screen 1 & 5 (`list`): Full-sheet `Categorise` view with `<` back button,
 *     centered `Categorise` title, rounded `Search` bar, coloured category tag
 *     rows with `✓` selection state, `Show all` row, and `+ New category >` row.
 *   - Screen 2, 3 & 4 (`create`): Full-sheet `New category` view with `<` back
 *     button, centered `New category` title, `✓` confirm button, underline
 *     `Name for your category` input, and the 25-colour circular swatch grid.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../services/api-client';
import { showToast } from '../../../components/InboxToast';

export type CategoryPickerStep = 'inline' | 'list' | 'create';

export interface ContactCategoryOption {
  name: string;
  color: string;
}

export const CONTACT_CATEGORY_STORAGE_KEY = 'quant-contact-categories';

export const CATEGORY_25_COLORS: readonly { id: string; label: string; hex: string }[] = [
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

export const DEFAULT_CONTACT_CATEGORIES: readonly ContactCategoryOption[] = [
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

function TagIcon({ color, filled = true }: { color: string; filled?: boolean }) {
  return (
    <svg
      className="size-5 flex-none"
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="#111111" stroke="none" />
    </svg>
  );
}

export interface ContactCategoryPickerProps {
  tagsCsv: string;
  onChangeTagsCsv: (nextCsv: string) => void;
  initialStep?: CategoryPickerStep;
  onStepChange?: (step: CategoryPickerStep) => void;
}

export function ContactCategoryPicker({
  tagsCsv,
  onChangeTagsCsv,
  initialStep = 'inline',
  onStepChange,
}: ContactCategoryPickerProps) {
  const [step, setStepInternal] = useState<CategoryPickerStep>(initialStep);
  const [categories, setCategories] = useState<ContactCategoryOption[]>([
    ...DEFAULT_CONTACT_CATEGORIES,
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<string>(
    CATEGORY_25_COLORS[0]!.hex,
  );
  const [savingCategory, setSavingCategory] = useState(false);

  const setStep = useCallback(
    (next: CategoryPickerStep) => {
      setStepInternal(next);
      onStepChange?.(next);
    },
    [onStepChange],
  );

  const selectedTags = useMemo(() => parseTagsCsv(tagsCsv), [tagsCsv]);

  useEffect(() => {
    const merged = new Map<string, ContactCategoryOption>();
    for (const preset of DEFAULT_CONTACT_CATEGORIES) {
      merged.set(preset.name.toLowerCase(), preset);
    }
    try {
      const raw = localStorage.getItem(CONTACT_CATEGORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ContactCategoryOption[];
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

    const created: ContactCategoryOption = {
      name: trimmed,
      color: newCategoryColor,
    };

    const nextCategories = [
      created,
      ...categories.filter((c) => c.name.toLowerCase() !== trimmed.toLowerCase()),
    ];
    setCategories(nextCategories);

    try {
      localStorage.setItem(CONTACT_CATEGORY_STORAGE_KEY, JSON.stringify(nextCategories));
    } catch {
      /* ignore */
    }

    try {
      await apiClient.createLabel({ name: trimmed, color: newCategoryColor });
    } catch {
      /* best-effort sync */
    }

    if (!selectedTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      onChangeTagsCsv(serializeTagsCsv([...selectedTags, trimmed]));
    }

    setSavingCategory(false);
    setNewCategoryName('');
    setStep('list');
    showToast({ text: `Category "${trimmed}" created`, type: 'success' });
  }, [categories, newCategoryColor, newCategoryName, onChangeTagsCsv, savingCategory, selectedTags, setStep]);

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

  // ─── SCREEN 2, 3, 4: Full-Sheet New category (Name + 25-colour grid) ───────
  if (step === 'create') {
    return (
      <div data-testid="contact-category-create" className="space-y-5 py-1">
        {/* Top Sheet Bar: < | New category | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('list')}
            aria-label="Back to Categorise"
            className="inline-flex size-8 items-center justify-center rounded-lg text-white hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-white">New category</span>
          <button
            type="button"
            disabled={!newCategoryName.trim() || savingCategory}
            onClick={() => void handleCreateCategory()}
            aria-label="Save new category"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#3B82F6] disabled:text-[var(--quant-muted-foreground)] disabled:opacity-40"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>

        {/* Underline input matching Screens 2, 3, 4 */}
        <div className="border-b border-[var(--quant-border)] pb-2">
          {newCategoryName && (
            <label
              htmlFor="new-category-name-input"
              className="block text-xs text-[var(--quant-muted-foreground)] mb-0.5"
            >
              Name for your category
            </label>
          )}
          <input
            id="new-category-name-input"
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="Name for your category"
            maxLength={40}
            className="w-full bg-transparent py-1.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
          />
        </div>

        {/* 25-Colour Circular Swatch Grid */}
        <div className="space-y-3">
          <span className="block text-sm text-[var(--quant-muted-foreground)]">Colour</span>
          <div
            role="radiogroup"
            aria-label="Category colour"
            className="grid grid-cols-6 gap-3.5"
          >
            {CATEGORY_25_COLORS.map((swatch) => {
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
                  className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white transition-transform hover:scale-105"
                >
                  {isSelected ? (
                    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 1 & 5: Full-Sheet Categorise List ──────────────────────────────
  if (step === 'list') {
    return (
      <div data-testid="contact-category-list" className="space-y-3 py-1">
        {/* Top Sheet Bar: < | Categorise */}
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('inline')}
            aria-label="Done selecting categories"
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-white hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-white">Categorise</span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search categories"
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] py-2 pl-10 pr-4 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)]"
          />
        </div>

        {/* Category Rows */}
        <div className="divide-y divide-[var(--quant-border)]">
          {filteredCategories.map((cat) => {
            const isSelected = selectedTags.some(
              (t) => t.toLowerCase() === cat.name.toLowerCase(),
            );
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => handleToggleTag(cat.name)}
                className="flex min-h-12 w-full items-center justify-between gap-3 py-3 px-1 text-left text-sm text-white hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                <span className="flex items-center gap-3.5 min-w-0">
                  <TagIcon color={cat.color} />
                  <span className="truncate">{cat.name}</span>
                </span>
                {isSelected && (
                  <svg
                    className="size-5 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-label="Selected"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>

        {!searchQuery.trim() && !showAll && categories.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex min-h-11 w-full items-center border-t border-[var(--quant-border)] pl-9 pt-2 text-left text-sm text-[var(--quant-muted-foreground)] hover:text-white"
          >
            Show all
          </button>
        )}

        <button
          type="button"
          onClick={() => setStep('create')}
          className="flex min-h-12 w-full items-center justify-between border-t border-[var(--quant-border)] pt-3 px-1 text-left text-sm text-[var(--quant-muted-foreground)] hover:text-white"
        >
          <span className="flex items-center gap-3.5">
            <span className="text-lg leading-none">+</span>
            <span>New category</span>
          </span>
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    );
  }

  // ─── SCREEN 0 & 6: Inline Categorise Row inside New/Edit Contact ───────────
  return (
    <div
      data-testid="contact-category-inline"
      className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--quant-border)] py-3"
    >
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <TagIcon color="var(--quant-muted-foreground)" filled={false} />
        <div className="min-w-0 flex-1">
          {selectedTags.length > 0 ? (
            <div className="space-y-1.5">
              <span className="block text-[11px] text-[var(--quant-muted-foreground)]">
                Categorise
              </span>
              <div className="flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => {
                  const color = getColorForTag(tag);
                  return (
                    <span
                      key={tag}
                      style={{
                        backgroundColor: `${color}22`,
                        color,
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
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
            </div>
          ) : (
            <span className="text-sm text-[var(--quant-muted-foreground)]">Categorise</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setStep('list')}
        aria-label="Open Categorise picker"
        className="inline-flex size-8 items-center justify-center rounded-lg text-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-white"
      >
        +
      </button>
    </div>
  );
}

export interface ContactModalSheetProps {
  formData: {
    name: string;
    email: string;
    phone: string;
    company: string;
    tags: string;
    avatar: string;
  };
  onChangeFormData: (next: {
    name: string;
    email: string;
    phone: string;
    company: string;
    tags: string;
    avatar: string;
  }) => void;
  onSave: () => void;
  onCancel: () => void;
  isEditing: boolean;
}

export function ContactModalSheet({
  formData,
  onChangeFormData,
  onSave,
  onCancel,
  isEditing,
}: ContactModalSheetProps) {
  const [categoryStep, setCategoryStep] = useState<CategoryPickerStep>('inline');
  const [titlePrefix, setTitlePrefix] = useState('Ms');
  const [emailType, setEmailType] = useState<'Personal' | 'Work'>('Personal');
  const [phoneType, setPhoneType] = useState<'Mobile' | 'Work'>('Mobile');

  const nameParts = useMemo(() => {
    const parts = formData.name.trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] ?? '',
      surname: parts.slice(1).join(' '),
    };
  }, [formData.name]);

  const handleNamePartChange = (first: string, last: string) => {
    const combined = `${first} ${last}`.trim();
    onChangeFormData({ ...formData, name: combined });
  };

  // When in 'list' or 'create' step, render ONLY the full-sheet Categorise / New category view!
  if (categoryStep === 'list' || categoryStep === 'create') {
    return (
      <div className="p-4">
        <ContactCategoryPicker
          tagsCsv={formData.tags}
          onChangeTagsCsv={(nextTags) => onChangeFormData({ ...formData, tags: nextTags })}
          initialStep={categoryStep}
          onStepChange={setCategoryStep}
        />
      </div>
    );
  }

  // Screen 0 & 6: Full-Sheet New Contact view
  return (
    <div className="p-4 space-y-2.5" data-testid="contact-modal-sheet">
      {/* Top Sheet Header: ✕ | New Contact | ✓ */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2.5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel contact"
          className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-white"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-white">
            {isEditing ? 'Edit Contact' : 'New Contact'}
          </div>
          <div className="text-[11px] text-[var(--quant-muted-foreground)]">
            {formData.email || 'QuantMail Contacts'}
          </div>
        </div>
        <button
          type="button"
          onClick={onSave}
          aria-label={isEditing ? 'Save Changes' : 'Create Contact'}
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#3B82F6] hover:bg-[var(--quant-surface-hover)]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>

      {/* Centered Circular Avatar with Camera Overlay (Screen 0 & 6) */}
      <div className="flex justify-center py-1">
        <div className="relative grid size-16 place-items-center rounded-full bg-[var(--quant-surface-elevated)] border border-[var(--quant-border)] text-white">
          <svg
            className="size-5 text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
        </div>
      </div>

      {/* Icon-Aligned Contact Rows */}
      <div className="space-y-0.5">
        {/* Title / First name / Surname group */}
        <div className="flex items-start gap-3.5">
          <svg
            className="mt-3 size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          <div className="flex-1 divide-y divide-[var(--quant-border)]">
            <div className="py-1.5">
              <label className="block text-[11px] text-[var(--quant-muted-foreground)]">
                Title
              </label>
              <input
                type="text"
                value={titlePrefix}
                onChange={(e) => setTitlePrefix(e.target.value)}
                placeholder="Ms / Mr / Dr"
                className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
            <div className="py-1.5">
              <label
                htmlFor="contact-name"
                className="block text-[11px] text-[var(--quant-muted-foreground)]"
              >
                First name
              </label>
              <input
                id="contact-name"
                name="name"
                type="text"
                value={nameParts.firstName}
                onChange={(e) => handleNamePartChange(e.target.value, nameParts.surname)}
                placeholder="First name"
                className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
            <div className="py-1.5 border-b border-[var(--quant-border)]">
              <label
                htmlFor="contact-surname"
                className="block text-[11px] text-[var(--quant-muted-foreground)]"
              >
                Surname
              </label>
              <input
                id="contact-surname"
                type="text"
                value={nameParts.surname}
                onChange={(e) => handleNamePartChange(nameParts.firstName, e.target.value)}
                placeholder="Surname"
                className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Email type & Email address */}
        <div className="flex items-start gap-3.5">
          <svg
            className="mt-3 size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
          <div className="flex-1 divide-y divide-[var(--quant-border)]">
            <button
              type="button"
              onClick={() => setEmailType((prev) => (prev === 'Personal' ? 'Work' : 'Personal'))}
              className="flex w-full items-center justify-between py-2 text-left"
            >
              <span className="text-sm text-[var(--quant-muted-foreground)]">Email type</span>
              <span className="text-sm text-white">{emailType}</span>
            </button>
            <div className="py-1.5 border-b border-[var(--quant-border)]">
              <label
                htmlFor="contact-email"
                className="block text-[11px] text-[var(--quant-muted-foreground)]"
              >
                Email address
              </label>
              <input
                id="contact-email"
                name="email"
                type="email"
                value={formData.email}
                onChange={(e) => onChangeFormData({ ...formData, email: e.target.value })}
                placeholder="name@example.com"
                className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Phone type & Phone number */}
        <div className="flex items-start gap-3.5">
          <svg
            className="mt-3 size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          <div className="flex-1 divide-y divide-[var(--quant-border)]">
            <button
              type="button"
              onClick={() => setPhoneType((prev) => (prev === 'Mobile' ? 'Work' : 'Mobile'))}
              className="flex w-full items-center justify-between py-2 text-left"
            >
              <span className="text-sm text-[var(--quant-muted-foreground)]">Phone type</span>
              <span className="text-sm text-white">{phoneType}</span>
            </button>
            <div className="py-1.5 border-b border-[var(--quant-border)]">
              <label
                htmlFor="contact-phone"
                className="block text-[11px] text-[var(--quant-muted-foreground)]"
              >
                Phone number
              </label>
              <input
                id="contact-phone"
                name="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => onChangeFormData({ ...formData, phone: e.target.value })}
                placeholder="+16502137390"
                className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Company */}
        <div className="flex items-center gap-3.5">
          <svg
            className="size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect width="20" height="14" x="2" y="7" rx="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <div className="flex-1 border-b border-[var(--quant-border)] py-1.5">
            <label
              htmlFor="contact-company"
              className="block text-[11px] text-[var(--quant-muted-foreground)]"
            >
              Company
            </label>
            <input
              id="contact-company"
              name="company"
              type="text"
              value={formData.company}
              onChange={(e) => onChangeFormData({ ...formData, company: e.target.value })}
              placeholder="Company"
              className="w-full bg-transparent pt-0.5 text-sm text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          </div>
        </div>

        {/* Categorise Row */}
        <ContactCategoryPicker
          tagsCsv={formData.tags}
          onChangeTagsCsv={(nextTags) => onChangeFormData({ ...formData, tags: nextTags })}
          initialStep="inline"
          onStepChange={setCategoryStep}
        />
      </div>
    </div>
  );
}
