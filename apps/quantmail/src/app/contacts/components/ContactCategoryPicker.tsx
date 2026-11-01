'use client';

/**
 * ContactCategoryPicker & ContactModalSheet — Mobile-first Contact Creation,
 * Category Picker (25-colour grid), Add Field sheet, and iOS Birthday Wheel Picker,
 * supporting both White (Light) and Black (Dark) themes.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../../../services/api-client';
import { showToast } from '../../../components/InboxToast';

export interface CategoryColorSwatch {
  id: string;
  label: string;
  hex: string;
}

export const CATEGORY_25_COLORS: readonly CategoryColorSwatch[] = [
  // Row 1
  { id: 'coral-red', label: 'Coral Red', hex: '#E74856' },
  { id: 'burgundy', label: 'Burgundy', hex: '#750B1C' },
  { id: 'bright-orange', label: 'Bright Orange', hex: '#FF8C00' },
  { id: 'rust-orange', label: 'Rust Orange', hex: '#CA5010' },
  { id: 'peach-gold', label: 'Peach Gold', hex: '#F7A941' },
  { id: 'bronze-brown', label: 'Bronze Brown', hex: '#8E562E' },
  // Row 2
  { id: 'sunny-yellow', label: 'Sunny Yellow', hex: '#FCE100' },
  { id: 'ochre-gold', label: 'Ochre Gold', hex: '#C19C00' },
  { id: 'lime-green', label: 'Lime Green', hex: '#498205' },
  { id: 'forest-green', label: 'Forest Green', hex: '#107C10' },
  { id: 'teal', label: 'Teal', hex: '#00B7C3' },
  { id: 'deep-teal', label: 'Deep Teal', hex: '#038387' },
  // Row 3
  { id: 'olive-green', label: 'Olive Green', hex: '#6BB700' },
  { id: 'emerald', label: 'Emerald', hex: '#0B6A0B' },
  { id: 'sky-blue', label: 'Sky Blue', hex: '#0099BC' },
  { id: 'navy-blue', label: 'Navy Blue', hex: '#004E8C' },
  { id: 'lavender-purple', label: 'Lavender Purple', hex: '#8764B8' },
  { id: 'deep-indigo', label: 'Deep Indigo', hex: '#3B145B' },
  // Row 4
  { id: 'pastel-pink', label: 'Pastel Pink', hex: '#F49AC2' },
  { id: 'plum-magenta', label: 'Plum Magenta', hex: '#5C005C' },
  { id: 'cool-slate', label: 'Cool Slate', hex: '#8A959E' },
  { id: 'petrol-blue', label: 'Petrol Blue', hex: '#004B60' },
  { id: 'warm-grey', label: 'Warm Grey', hex: '#A19F9D' },
  { id: 'charcoal-grey', label: 'Charcoal Grey', hex: '#605E5C' },
  // Row 5
  { id: 'obsidian-black', label: 'Obsidian Black', hex: '#1B1A19' },
];

export interface ContactCategoryItem {
  name: string;
  color: string;
}

export const DEFAULT_CONTACT_CATEGORIES: readonly ContactCategoryItem[] = [
  { name: 'Blue category', color: '#0099BC' },
  { name: 'Green category', color: '#498205' },
  { name: 'Orange category', color: '#CA5010' },
  { name: 'Purple category', color: '#8764B8' },
  { name: 'Red category', color: '#E74856' },
  { name: 'Yellow category', color: '#FCE100' },
];

export const CONTACT_CATEGORIES_STORAGE_KEY = 'quant-contact-categories';

export const ADD_FIELD_SECTIONS: ReadonlyArray<{
  section: string;
  fields: readonly string[];
}> = [
  {
    section: 'Name',
    fields: [
      'Middle name',
      'Suffix',
      'Nick name',
      'Pronunciation first name',
      'Pronunciation surname',
    ],
  },
  {
    section: 'Email',
    fields: ['Work email address', 'Personal email address', 'Chat'],
  },
  {
    section: 'Phone',
    fields: [
      'Mobile phone number',
      'Home phone number',
      'Business phone number',
      'Other phone number',
      'Organisation phone number',
      'Pager',
      'Assistant phone number',
      'Callback phone number',
      'Radio phone number',
      'Telex',
      'TTY',
    ],
  },
  {
    section: 'Work',
    fields: ['Job title', 'Department', 'Office location', 'Pronunciation company'],
  },
  {
    section: 'Address',
    fields: ['Home address', 'Other address'],
  },
  {
    section: 'Other',
    fields: ['Birthday', 'Anniversary', 'Significant other'],
  },
];

export const MONTHS_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export type CategoryPickerStep = 'inline' | 'list' | 'create' | 'add_field' | 'birthday_wheel';

export interface ContactCategoryPickerProps {
  tagsCsv: string;
  onChangeTagsCsv: (nextCsv: string) => void;
  initialStep?: 'inline' | 'list' | 'create';
  onStepChange?: (step: 'inline' | 'list' | 'create') => void;
}

export function parseTagsCsv(csv: string): string[] {
  return csv
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
      className="size-4 flex-none"
      viewBox="0 0 24 24"
      fill={filled ? color : 'none'}
      stroke={color}
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill={filled ? '#111318' : color} />
    </svg>
  );
}

export function ContactCategoryPicker({
  tagsCsv,
  onChangeTagsCsv,
  initialStep = 'inline',
  onStepChange,
}: ContactCategoryPickerProps) {
  const [step, setStepInternal] = useState<'inline' | 'list' | 'create'>(initialStep);
  const [categories, setCategories] = useState<ContactCategoryItem[]>(() => [
    ...DEFAULT_CONTACT_CATEGORIES,
  ]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState<string>(CATEGORY_25_COLORS[0]!.hex);
  const [savingCategory, setSavingCategory] = useState(false);

  const setStep = useCallback(
    (next: 'inline' | 'list' | 'create') => {
      setStepInternal(next);
      onStepChange?.(next);
    },
    [onStepChange],
  );

  useEffect(() => {
    setStepInternal(initialStep);
  }, [initialStep]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONTACT_CATEGORIES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ContactCategoryItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCategories(parsed);
        }
      }
    } catch {
      /* ignore */
    }

    void apiClient.getLabels().then((res) => {
      if (res.success && Array.isArray(res.data) && res.data.length > 0) {
        setCategories((prev) => {
          const byName = new Map(prev.map((c) => [c.name.toLowerCase(), c]));
          for (const lbl of res.data!) {
            if (lbl.name && !byName.has(lbl.name.toLowerCase())) {
              byName.set(lbl.name.toLowerCase(), {
                name: lbl.name,
                color: lbl.color || '#0099BC',
              });
            }
          }
          return Array.from(byName.values());
        });
      }
    });
  }, []);

  const selectedTags = useMemo(() => parseTagsCsv(tagsCsv), [tagsCsv]);

  const getColorForTag = useCallback(
    (tagName: string): string => {
      const match = categories.find((c) => c.name.toLowerCase() === tagName.toLowerCase());
      return match?.color ?? '#00B7C3';
    },
    [categories],
  );

  const handleToggleTag = useCallback(
    (tagName: string) => {
      const exists = selectedTags.some((t) => t.toLowerCase() === tagName.toLowerCase());
      const next = exists
        ? selectedTags.filter((t) => t.toLowerCase() !== tagName.toLowerCase())
        : [...selectedTags, tagName];
      onChangeTagsCsv(serializeTagsCsv(next));
    },
    [onChangeTagsCsv, selectedTags],
  );

  const handleRemoveTag = useCallback(
    (tagName: string) => {
      const next = selectedTags.filter((t) => t.toLowerCase() !== tagName.toLowerCase());
      onChangeTagsCsv(serializeTagsCsv(next));
    },
    [onChangeTagsCsv, selectedTags],
  );

  const handleCreateCategory = useCallback(async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || savingCategory) return;

    setSavingCategory(true);
    const createdItem: ContactCategoryItem = {
      name: trimmed,
      color: newCategoryColor,
    };

    const nextCategories = [
      createdItem,
      ...categories.filter((c) => c.name.toLowerCase() !== trimmed.toLowerCase()),
    ];
    setCategories(nextCategories);

    try {
      localStorage.setItem(CONTACT_CATEGORIES_STORAGE_KEY, JSON.stringify(nextCategories));
    } catch {
      /* ignore */
    }

    try {
      await apiClient.createLabel(trimmed, newCategoryColor);
    } catch {
      /* best-effort backend label sync */
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
      <div
        data-testid="contact-category-create"
        className="space-y-5 bg-[var(--quant-card)] text-[var(--quant-foreground)] py-1"
      >
        {/* Top Sheet Bar: < | New category | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('list')}
            aria-label="Back to Categorise"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">
            New category
          </span>
          <button
            type="button"
            disabled={!newCategoryName.trim() || savingCategory}
            onClick={() => void handleCreateCategory()}
            aria-label="Save new category"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] disabled:text-[var(--quant-muted-foreground)] disabled:opacity-40"
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
            className="w-full bg-transparent py-1.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
      <div
        data-testid="contact-category-list"
        className="space-y-3 bg-[var(--quant-card)] text-[var(--quant-foreground)] py-1"
      >
        {/* Top Sheet Bar: < | Categorise */}
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('inline')}
            aria-label="Done selecting categories"
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">Categorise</span>
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
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] py-2 pl-10 pr-4 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[#0078D4]"
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
                className="flex min-h-12 w-full items-center justify-between gap-3 py-3 px-1 text-left text-sm text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)] transition-colors"
              >
                <span className="flex items-center gap-3.5 min-w-0">
                  <TagIcon color={cat.color} />
                  <span className="truncate">{cat.name}</span>
                </span>
                {isSelected && (
                  <svg
                    className="size-5 text-[#0078D4]"
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
            className="flex min-h-11 w-full items-center border-t border-[var(--quant-border)] pl-9 pt-2 text-left text-sm text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
          >
            Show all
          </button>
        )}

        <button
          type="button"
          onClick={() => setStep('create')}
          className="flex min-h-12 w-full items-center justify-between border-t border-[var(--quant-border)] pt-3 px-1 text-left text-sm text-[var(--quant-muted-foreground)] hover:text-[var(--quant-foreground)]"
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
      className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--quant-border)] py-2.5"
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
        className="inline-flex size-8 items-center justify-center rounded-lg text-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
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

  // Deep reverse-engineered Contact Fields (Flow #4 Adding Birthday & Flow #10 Address)
  const [businessAddress, setBusinessAddress] = useState(
    '1226 University Dr, Menlo Park, California, USA, 94025',
  );
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [personalWebPage, setPersonalWebPage] = useState('');
  const [notes, setNotes] = useState('Product department');
  const [birthdayValue, setBirthdayValue] = useState<string>('');
  const [extraFields, setExtraFields] = useState<Record<string, string>>({});

  // Birthday 3-column wheel picker state
  const [bdayDay, setBdayDay] = useState<number>(18);
  const [bdayMonth, setBdayMonth] = useState<string>('February');
  const [bdayYear, setBdayYear] = useState<number>(1995);

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

  // Full-Sheet Categorise / New category view
  if (categoryStep === 'list' || categoryStep === 'create') {
    return (
      <div className="min-h-full bg-[var(--quant-card)] p-4 text-[var(--quant-foreground)]">
        <ContactCategoryPicker
          tagsCsv={formData.tags}
          onChangeTagsCsv={(nextTags) => onChangeFormData({ ...formData, tags: nextTags })}
          initialStep={categoryStep}
          onStepChange={(next) => setCategoryStep(next)}
        />
      </div>
    );
  }

  // ─── FLOW #4 SCREEN 1 & 2: Full-Sheet Add Field Picker ─────────────────────
  if (categoryStep === 'add_field') {
    return (
      <div
        data-testid="contact-add-field-sheet"
        className="min-h-full bg-[var(--quant-card)] p-4 text-[var(--quant-foreground)] space-y-3"
      >
        <div className="relative flex items-center justify-center border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setCategoryStep('inline')}
            aria-label="Back to New Contact"
            className="absolute left-0 inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">Add Field</span>
        </div>

        <div className="space-y-4 max-h-[720px] overflow-y-auto pr-1">
          {ADD_FIELD_SECTIONS.map((sec) => (
            <div key={sec.section} className="space-y-1">
              <div className="bg-[var(--quant-surface)] px-3 py-1.5 text-xs font-medium text-[var(--quant-muted-foreground)] rounded-md">
                {sec.section}
              </div>
              <div className="divide-y divide-[var(--quant-border)]">
                {sec.fields.map((fieldLabel) => (
                  <button
                    key={fieldLabel}
                    type="button"
                    onClick={() => {
                      if (fieldLabel === 'Birthday') {
                        setCategoryStep('birthday_wheel');
                      } else {
                        setExtraFields((prev) => ({ ...prev, [fieldLabel]: '' }));
                        setCategoryStep('inline');
                      }
                    }}
                    className="flex min-h-11 w-full items-center px-3 py-2.5 text-left text-sm text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
                  >
                    {fieldLabel}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── FLOW #4 SCREEN 3 & 4: Birthday Wheel Picker Bottom Sheet ──────────────
  if (categoryStep === 'birthday_wheel') {
    const days = [bdayDay - 2, bdayDay - 1, bdayDay, bdayDay + 1, bdayDay + 2].map((d) =>
      d < 1 ? d + 28 : d > 28 ? d - 28 : d,
    );
    const monthIdx = MONTHS_FULL.indexOf(bdayMonth as (typeof MONTHS_FULL)[number]);
    const safeMonthIdx = monthIdx === -1 ? 1 : monthIdx;
    const months = [-2, -1, 0, 1, 2].map(
      (offset) => MONTHS_FULL[(safeMonthIdx + offset + 12) % 12]!,
    );
    const years = [bdayYear - 2, bdayYear - 1, bdayYear, bdayYear + 1, bdayYear + 2];

    return (
      <div
        data-testid="contact-birthday-wheel-sheet"
        className="min-h-full bg-[var(--quant-card)] p-4 text-[var(--quant-foreground)] flex flex-col justify-between space-y-4"
      >
        {/* Dimmed preview of New Contact rows above the bottom wheel sheet */}
        <div className="space-y-2 opacity-60 pointer-events-none">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2">
            <span className="text-sm">✕</span>
            <span className="text-sm font-semibold">New Contact</span>
            <span className="text-sm text-[#0078D4]">✓</span>
          </div>
          <div className="py-1.5 border-b border-[var(--quant-border)] text-xs">
            <div className="text-[var(--quant-muted-foreground)]">Email address</div>
            <div>{formData.email || 'alexsmith@quantrinity.in'}</div>
          </div>
          <div className="py-1.5 border-b border-[var(--quant-border)] text-xs">
            <div className="text-[var(--quant-muted-foreground)]">Phone number</div>
            <div>{formData.phone || '+16502137390'}</div>
          </div>
          <div className="py-1.5 border-b border-[var(--quant-border)] text-xs">
            <div className="text-[var(--quant-muted-foreground)]">Company</div>
            <div>{formData.company || 'Quantrinity'}</div>
          </div>
        </div>

        {/* Bottom Sheet: < | Birthday | ✓ + 3-Column Drum Wheel */}
        <div className="rounded-t-3xl border-t border-[var(--quant-border)] bg-[var(--quant-card)] pt-3 pb-4 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3 px-2">
            <button
              type="button"
              onClick={() => setCategoryStep('add_field')}
              aria-label="Back to Add Field"
              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <span className="text-base font-semibold text-[var(--quant-foreground)]">Birthday</span>
            <button
              type="button"
              aria-label="Confirm Birthday"
              onClick={() => {
                setBirthdayValue(`${bdayDay} ${bdayMonth} ${bdayYear}`);
                setCategoryStep('inline');
                showToast({
                  text: `Birthday set to ${bdayDay} ${bdayMonth} ${bdayYear}`,
                  type: 'success',
                });
              }}
              className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </button>
          </div>

          {/* 3-Column iOS Drum Wheel */}
          <div className="relative py-2">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-[var(--quant-surface)]"
            />
            <div className="relative grid grid-cols-3 text-center">
              {/* Day Column */}
              <div className="space-y-2">
                {days.map((d, idx) => {
                  const isCenter = idx === 2;
                  return (
                    <button
                      key={`day-${d}-${idx}`}
                      type="button"
                      onClick={() => setBdayDay(d)}
                      className={`block w-full py-1 transition-all ${
                        isCenter
                          ? 'text-lg font-medium text-[var(--quant-foreground)]'
                          : 'text-sm text-[var(--quant-muted-foreground)] opacity-60'
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              {/* Month Column */}
              <div className="space-y-2">
                {months.map((m, idx) => {
                  const isCenter = idx === 2;
                  return (
                    <button
                      key={`month-${m}-${idx}`}
                      type="button"
                      onClick={() => setBdayMonth(m)}
                      className={`block w-full py-1 transition-all ${
                        isCenter
                          ? 'text-lg font-medium text-[var(--quant-foreground)]'
                          : 'text-sm text-[var(--quant-muted-foreground)] opacity-60'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>

              {/* Year Column */}
              <div className="space-y-2">
                {years.map((y, idx) => {
                  const isCenter = idx === 2;
                  return (
                    <button
                      key={`year-${y}-${idx}`}
                      type="button"
                      onClick={() => setBdayYear(y)}
                      className={`block w-full py-1 transition-all ${
                        isCenter
                          ? 'text-lg font-medium text-[var(--quant-foreground)]'
                          : 'text-sm text-[var(--quant-muted-foreground)] opacity-60'
                      }`}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 0 & 6: Full-Sheet New Contact view ─────────────────────────────
  return (
    <div
      className="min-h-full bg-[var(--quant-card)] p-4 space-y-2.5 text-[var(--quant-foreground)]"
      data-testid="contact-modal-sheet"
    >
      {/* Top Sheet Header: ✕ | New Contact | ✓ */}
      <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2.5">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel contact"
          className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold text-[var(--quant-foreground)]">
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
          className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>

      {/* Centered Circular Avatar with Camera Overlay */}
      <div className="flex justify-center py-1">
        <div className="relative grid size-16 place-items-center rounded-full bg-[var(--quant-surface)] border border-[var(--quant-border)] text-[var(--quant-foreground)]">
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
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
              <span className="text-sm text-[var(--quant-foreground)]">{emailType}</span>
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
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
              <span className="text-sm text-[var(--quant-foreground)]">{phoneType}</span>
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
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
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
              className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          </div>
        </div>

        {/* Categorise Row */}
        <ContactCategoryPicker
          tagsCsv={formData.tags}
          onChangeTagsCsv={(nextTags) => onChangeFormData({ ...formData, tags: nextTags })}
          initialStep="inline"
          onStepChange={(next) => setCategoryStep(next)}
        />

        {/* Business Address Row (Flow #4 & #10) */}
        <div className="flex items-start gap-3.5 border-b border-[var(--quant-border)] py-2">
          <svg
            className="mt-1 size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <div className="flex-1 min-w-0">
            <span className="block text-[11px] text-[var(--quant-muted-foreground)]">
              Business address
            </span>
            <input
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="Street, City, State, Country, Postcode"
              className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setAddressExpanded((prev) => !prev)}
            aria-label="Toggle address details"
            className="mt-2 inline-flex size-7 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)]"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Personal Web Page Row */}
        <div className="flex items-center gap-3.5 border-b border-[var(--quant-border)] py-2">
          <svg
            className="size-5 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          <input
            type="url"
            value={personalWebPage}
            onChange={(e) => setPersonalWebPage(e.target.value)}
            placeholder="Personal web page"
            className="flex-1 bg-transparent py-1 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
          />
        </div>

        {/* Birthday Row (when added via Add Field -> Birthday wheel) */}
        {birthdayValue && (
          <div
            data-testid="contact-birthday-row"
            className="flex items-center justify-between border-b border-[var(--quant-border)] py-2 pl-8"
          >
            <div>
              <span className="block text-[11px] text-[var(--quant-muted-foreground)]">
                Birthday
              </span>
              <span className="block text-sm text-[var(--quant-foreground)]">{birthdayValue}</span>
            </div>
            <button
              type="button"
              aria-label="Remove birthday"
              onClick={() => setBirthdayValue('')}
              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-[#EF4444]"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        )}

        {/* Dynamic Extra Fields */}
        {Object.entries(extraFields).map(([fieldKey, val]) => (
          <div
            key={fieldKey}
            className="flex items-center justify-between border-b border-[var(--quant-border)] py-2 pl-8"
          >
            <div className="flex-1">
              <span className="block text-[11px] text-[var(--quant-muted-foreground)]">
                {fieldKey}
              </span>
              <input
                type="text"
                value={val}
                onChange={(e) =>
                  setExtraFields((prev) => ({ ...prev, [fieldKey]: e.target.value }))
                }
                placeholder={fieldKey}
                className="w-full bg-transparent pt-0.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
              />
            </div>
            <button
              type="button"
              aria-label={`Remove ${fieldKey}`}
              onClick={() =>
                setExtraFields((prev) => {
                  const copy = { ...prev };
                  delete copy[fieldKey];
                  return copy;
                })
              }
              className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:text-[#EF4444]"
            >
              ×
            </button>
          </div>
        ))}

        {/* Notes Section */}
        <div className="pt-2 space-y-1.5">
          <div className="flex items-center gap-3.5 text-sm text-[var(--quant-muted-foreground)]">
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect width="16" height="20" x="4" y="2" rx="2" />
              <path d="M8 6h8M8 10h8M8 14h5" />
            </svg>
            <span>Notes</span>
          </div>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes"
            className="w-full rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3.5 py-2.5 text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
          />
        </div>

        {/* + Add Field Button (Flow #4) */}
        <button
          type="button"
          data-testid="contact-open-add-field-btn"
          onClick={() => setCategoryStep('add_field')}
          className="flex min-h-11 w-full items-center gap-3.5 pt-2 text-left text-sm font-medium text-[#0078D4] hover:underline"
        >
          <span className="text-xl leading-none">+</span>
          <span>Add Field</span>
        </button>
      </div>
    </div>
  );
}
