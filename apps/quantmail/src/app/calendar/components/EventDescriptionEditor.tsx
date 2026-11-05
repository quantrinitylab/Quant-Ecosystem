'use client';

/**
 * EventDescriptionEditor — Mobile-first Calendar Event Description flow (Screens 0–3)
 * and Add Link sheet, supporting both White (Light) and Black (Dark) themes.
 */

import React, { useCallback, useRef, useState } from 'react';

export type DescriptionEditorStep = 'summary' | 'editor' | 'add_link';

export interface EventDescriptionEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  initialStep?: DescriptionEditorStep;
}

export function applyDescriptionFormat(
  current: string,
  format: 'heading' | 'bold' | 'italic' | 'underline' | 'body' | 'bullet' | 'numbered',
): string {
  switch (format) {
    case 'heading':
      return current ? `${current}\n## ` : '## ';
    case 'bold':
      return `${current}**bold**`;
    case 'italic':
      return `${current}*italic*`;
    case 'underline':
      return `${current}<u>text</u>`;
    case 'body':
      return current.replace(/^#+\s*/gm, '');
    case 'bullet':
      return current ? `${current}\n• ` : '• ';
    case 'numbered':
      return current ? `${current}\n1. ` : '1. ';
  }
}

export function EventDescriptionEditor({
  value,
  onChange,
  placeholder = 'Add description, meeting agenda…',
  initialStep = 'summary',
}: EventDescriptionEditorProps) {
  const [step, setStep] = useState<DescriptionEditorStep>(initialStep);
  const [draft, setDraft] = useState(value);
  const [activeBlockStyle, setActiveBlockStyle] = useState<'Body' | 'Heading' | 'Subhead'>('Body');
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleOpenEditor = useCallback(() => {
    setDraft(value);
    setStep('editor');
  }, [value]);

  const handleConfirm = useCallback(() => {
    onChange(draft);
    setStep('summary');
  }, [draft, onChange]);

  const handleFormat = useCallback(
    (format: 'heading' | 'bold' | 'italic' | 'underline' | 'body' | 'bullet' | 'numbered') => {
      if (format === 'heading') {
        setActiveBlockStyle((prev) =>
          prev === 'Body' ? 'Heading' : prev === 'Heading' ? 'Subhead' : 'Body',
        );
      } else if (format === 'body') {
        setActiveBlockStyle('Body');
      }
      setDraft((prev) => applyDescriptionFormat(prev, format));
    },
    [],
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      const lines = draft.split('\n');
      const lastLine = lines[lines.length - 1] ?? '';
      if (lastLine.startsWith('• ') && lastLine.length > 2) {
        e.preventDefault();
        setDraft((prev) => `${prev}\n• `);
      } else {
        const numMatch = /^(\d+)\.\s+.+/.exec(lastLine);
        if (numMatch) {
          e.preventDefault();
          const nextNum = Number(numMatch[1]) + 1;
          setDraft((prev) => `${prev}\n${nextNum}. `);
        }
      }
    }
  }, [draft]);

  // ─── ADD LINK SUB-SHEET (Flow #6: ✕ | Add Link | ✓ with Text + Link URL) ──
  if (step === 'add_link') {
    return (
      <div
        data-testid="event-description-add-link-sheet"
        className="fixed inset-0 z-50 flex flex-col bg-[var(--quant-background)] p-4 text-[var(--quant-foreground)] sm:absolute sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('editor')}
            aria-label="Cancel add link"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-hover)] hover:text-[var(--quant-foreground)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">Add Link</span>
          <button
            type="button"
            disabled={!linkUrl.trim()}
            onClick={() => {
              const label = linkText.trim() || linkUrl.trim();
              const url = linkUrl.trim();
              setDraft((prev) => (prev ? `${prev} [${label}](${url})` : `[${label}](${url})`));
              setLinkText('');
              setLinkUrl('');
              setStep('editor');
            }}
            aria-label="Confirm add link"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] disabled:text-[var(--quant-muted-foreground)] disabled:opacity-40"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-card)] divide-y divide-[var(--quant-border)]">
          <div className="flex items-center gap-4 px-4 py-3">
            <label htmlFor="add-link-text" className="w-14 text-sm text-[var(--quant-foreground)]">
              Text
            </label>
            <input
              id="add-link-text"
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="Hi Alex,"
              className="flex-1 bg-transparent text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-4 px-4 py-3">
            <label htmlFor="add-link-url" className="w-14 text-sm text-[var(--quant-foreground)]">
              Link
            </label>
            <input
              id="add-link-url"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="URL"
              className="flex-1 bg-transparent text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          </div>
        </div>
      </div>
    );
  }

  // ─── SCREEN 1 & 2: Full-Sheet Edit Description with bottom formatting bar ─
  if (step === 'editor') {
    return (
      <div
        data-testid="event-description-editor-sheet"
        className="fixed inset-x-0 top-0 z-50 flex h-[430px] flex-col justify-between bg-[var(--quant-card)] p-4 text-[var(--quant-foreground)] sm:absolute sm:inset-0 sm:h-auto sm:rounded-2xl"
      >
        {/* Top Sheet Header: < | Edit Description | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('summary')}
            aria-label="Cancel description edit"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">
            Edit Description
          </span>
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="Save description"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>

        {/* Full-Height Text Editor Canvas */}
        <textarea
          ref={textareaRef}
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Daily team sync for updates and blockers."
          aria-label="Edit Description"
          autoFocus
          className="my-2 flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
        />

        {/* Docked Bottom Formatting Toolbar: Aa | B | I | U | Body | Bullet | Numbered | Link */}
        <div
          role="toolbar"
          aria-label="Description formatting"
          className="flex items-center justify-between gap-1.5 border-t border-[var(--quant-border)] pt-3"
        >
          <button
            type="button"
            onClick={() => handleFormat('heading')}
            aria-label="Heading"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs font-semibold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bold')}
            aria-label="Bold"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs font-bold text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => handleFormat('italic')}
            aria-label="Italic"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs italic text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => handleFormat('underline')}
            aria-label="Underline"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs underline text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => handleFormat('body')}
            aria-label="Body style"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2.5 text-xs font-medium text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          >
            {activeBlockStyle}
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bullet')}
            aria-label="Bulleted list"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => handleFormat('numbered')}
            aria-label="Numbered list"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            1. List
          </button>
          <button
            type="button"
            onClick={() => {
              setLinkText(draft.slice(0, 24) || 'Hi Alex,');
              setStep('add_link');
            }}
            aria-label="Add link"
            className="inline-flex h-9 min-w-8 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2 text-xs text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            🔗
          </button>
        </div>
      </div>
    );
  }

  // ─── SCREEN 0 & 3: Summary row inside Event / Series sheet ────────────────
  const previewText = value.trim();

  return (
    <div className="py-2 text-[var(--quant-muted-foreground)]" data-testid="event-description-summary">
      <button
        type="button"
        onClick={handleOpenEditor}
        aria-label="Edit Description"
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left transition-colors hover:text-[var(--quant-foreground)]"
      >
        <span className="flex items-center gap-2.5 text-sm font-normal text-[var(--quant-foreground)]">
          <span className="text-base leading-none text-[var(--quant-muted-foreground)]">≡</span>
          <span>Description</span>
        </span>
        <span className="flex items-center gap-2 min-w-0">
          {previewText && (
            <span className="truncate max-w-[180px] text-xs text-[var(--quant-muted-foreground)]">
              {previewText}
            </span>
          )}
          <svg
            className="size-4 flex-none text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </span>
      </button>
      <textarea
        rows={1}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}

// ─── FLOW #7: Adding a location (EventLocationPicker) ──────────────────────

export interface LocationSuggestionItem {
  id: string;
  title: string;
  subtitle?: string;
}

export const DEFAULT_LOCATION_SUGGESTIONS: readonly LocationSuggestionItem[] = [
  { id: 'exact', title: '1226 University Dr' },
  { id: 'menlo', title: '1226 University Dr', subtitle: '11,889 km · Menlo Park, United States' },
  { id: 'dekalb', title: '1226 University Dr', subtitle: '11,889 km · DeKalb, United States' },
  { id: 'lemont', title: '1226 University Dr', subtitle: '11,889 km · Lemont Furnace, United States' },
  { id: 'pontiac', title: '1226 University Dr', subtitle: '11,889 km · Pontiac, United States' },
  { id: 'connellsville', title: '1226 University Dr', subtitle: '11,889 km · Connellsville, United States' },
  { id: 'bismarck', title: '1226 University Dr', subtitle: '11,889 km · Bismarck, United States' },
];

export interface EventLocationPickerProps {
  value: string;
  onChange: (nextLocation: string) => void;
}

export function EventLocationPicker({ value, onChange }: EventLocationPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [selectedChip, setSelectedChip] = useState<string | null>(value ? value : null);

  const suggestions = DEFAULT_LOCATION_SUGGESTIONS.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      s.title.toLowerCase().includes(q) ||
      (s.subtitle ? s.subtitle.toLowerCase().includes(q) : false)
    );
  });

  if (isOpen) {
    return (
      <div
        data-testid="event-location-sheet"
        className="fixed inset-x-0 top-0 z-50 flex h-[540px] flex-col bg-[var(--quant-card)] text-[var(--quant-foreground)] sm:absolute sm:inset-0 sm:h-auto sm:rounded-2xl"
      >
        {/* Top Header: < | Location | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] px-4 py-3">
          <button
            type="button"
            aria-label="Cancel location"
            onClick={() => setIsOpen(false)}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[var(--quant-foreground)] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-[var(--quant-foreground)]">Location</span>
          <button
            type="button"
            aria-label="Confirm location"
            data-testid="event-location-confirm-btn"
            onClick={() => {
              const finalVal = (selectedChip || query).trim();
              onChange(finalVal);
              setIsOpen(false);
            }}
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#0078D4] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>

        {/* Search Input / Selected Chip Bar */}
        <div className="flex min-h-12 items-center justify-between border-b border-[var(--quant-border)] px-4 py-2">
          {selectedChip ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="event-location-chip"
                onClick={() => {
                  setQuery(selectedChip);
                  setSelectedChip(null);
                }}
                className="inline-flex items-center rounded-md bg-[#0078D4]/15 px-2.5 py-1 text-sm font-medium text-[#0078D4]"
              >
                {selectedChip}
              </button>
              <span aria-hidden="true" className="h-5 w-0.5 bg-[#0078D4]" />
            </div>
          ) : (
            <input
              type="text"
              data-testid="event-location-input"
              aria-label="Search location"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search location"
              autoFocus
              className="flex-1 bg-transparent text-sm text-[var(--quant-foreground)] placeholder-[var(--quant-muted-foreground)] focus:outline-none"
            />
          )}

          {!selectedChip && query.trim().length > 0 && (
            <button
              type="button"
              data-testid="event-location-clear-btn"
              aria-label="Clear location search"
              onClick={() => setQuery('')}
              className="grid size-5 place-items-center rounded-full bg-[var(--quant-muted-foreground)]/40 text-[10px] text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Autocomplete Suggestions List (Shown while typing before chip selection) */}
        {!selectedChip && query.trim().length > 0 && (
          <div
            data-testid="event-location-suggestions"
            className="flex-1 overflow-y-auto divide-y divide-[var(--quant-border)]"
          >
            {suggestions.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`location-suggestion-${item.id}`}
                onClick={() => setSelectedChip(item.title)}
                className="flex min-h-13 w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors hover:bg-[var(--quant-surface-hover)]"
              >
                <svg
                  className="size-5 flex-none text-[var(--quant-muted-foreground)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <div className="min-w-0">
                  <p className="truncate text-sm font-normal text-[var(--quant-foreground)]">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                      {item.subtitle}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-2 text-[var(--quant-muted-foreground)]" data-testid="event-location-summary">
      <button
        type="button"
        data-testid="event-open-location-btn"
        aria-label="Location"
        onClick={() => {
          setQuery(value);
          setSelectedChip(value ? value : null);
          setIsOpen(true);
        }}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left transition-colors hover:text-[var(--quant-foreground)]"
      >
        <span className="flex items-center gap-2.5 text-sm font-normal text-[var(--quant-foreground)]">
          <svg
            className="size-4 text-[var(--quant-muted-foreground)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{value || 'Location'}</span>
        </span>
        <svg
          className="size-4 flex-none text-[var(--quant-muted-foreground)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}
