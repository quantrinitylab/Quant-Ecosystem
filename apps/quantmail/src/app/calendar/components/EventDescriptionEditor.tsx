'use client';

/**
 * EventDescriptionEditor — Mobile-first Calendar Event Description flow (Screens 0–3):
 *   - Screen 0 & 3 (`summary`): "Description" row inside the Event / Series
 *     sheet showing either empty state or single-line preview ("Daily team
 *     sync for updates and blockers.") with `>` chevron to open the full editor.
 *   - Screen 1 & 2 (`editor`): Full-sheet "Edit Description" view covering the
 *     event sheet with `<` back chevron, centered "Edit Description" title,
 *     `✓` confirm checkmark, full-height text canvas, and docked bottom
 *     formatting toolbar (`Aa`, `B`, `I`, `U`, `Body`, Bullet list, Numbered list).
 */

import React, { useCallback, useState } from 'react';

export type DescriptionEditorStep = 'summary' | 'editor';

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
      setDraft((prev) => applyDescriptionFormat(prev, format));
    },
    [],
  );

  // ─── SCREEN 1 & 2: Full-Sheet Edit Description with bottom formatting bar ─
  if (step === 'editor') {
    return (
      <div
        data-testid="event-description-editor-sheet"
        className="fixed inset-0 z-50 flex flex-col justify-between bg-[#0B0C10] p-4 sm:absolute sm:rounded-2xl sm:bg-[var(--quant-card)]"
      >
        {/* Top Sheet Header: < | Edit Description | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-3">
          <button
            type="button"
            onClick={() => setStep('summary')}
            aria-label="Cancel description edit"
            className="inline-flex size-8 items-center justify-center rounded-lg text-white hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span className="text-base font-semibold text-white">Edit Description</span>
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="Save description"
            className="inline-flex size-8 items-center justify-center rounded-lg text-[#3B82F6] hover:bg-[var(--quant-surface-hover)]"
          >
            <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        </div>

        {/* Full-Height Text Editor Canvas */}
        <textarea
          rows={12}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Daily team sync for updates and blockers."
          aria-label="Edit Description"
          autoFocus
          className="my-2 flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none"
        />

        {/* Docked Bottom Formatting Toolbar: Aa | B | I | U | Body | Bullet | Numbered */}
        <div
          role="toolbar"
          aria-label="Description formatting"
          className="flex items-center justify-between gap-1.5 border-t border-[var(--quant-border)] pt-3"
        >
          <button
            type="button"
            onClick={() => handleFormat('heading')}
            aria-label="Heading"
            className="inline-flex h-9 min-w-10 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs font-semibold text-white hover:bg-[var(--quant-surface-hover)]"
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bold')}
            aria-label="Bold"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs font-bold text-white hover:bg-[var(--quant-surface-hover)]"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => handleFormat('italic')}
            aria-label="Italic"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs italic text-white hover:bg-[var(--quant-surface-hover)]"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => handleFormat('underline')}
            aria-label="Underline"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs underline text-white hover:bg-[var(--quant-surface-hover)]"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => handleFormat('body')}
            aria-label="Body style"
            className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-3 text-xs font-medium text-[#3B82F6] hover:bg-[var(--quant-surface-hover)]"
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bullet')}
            aria-label="Bulleted list"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs text-white hover:bg-[var(--quant-surface-hover)]"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => handleFormat('numbered')}
            aria-label="Numbered list"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs text-white hover:bg-[var(--quant-surface-hover)]"
          >
            1. List
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
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left transition-colors hover:text-white"
      >
        <span className="flex items-center gap-2.5 text-sm font-normal text-white">
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
