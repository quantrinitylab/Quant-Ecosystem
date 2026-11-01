'use client';

/**
 * Outlook iOS Flow #3 — Adding a description (Calendar Event / Series)
 * (Microsoft Outlook iOS Adding a description.zip — Screens 0, 1, 2, 3).
 *
 * Implements the 4-screen Outlook Calendar Description flow:
 *   - Screen 0 & 3 (`summary`): "Description" row inside New Event / Series
 *     showing either empty prompt or single-line preview ("Daily team sync for
 *     updates and blockers.") with `>` chevron to open the full editor, plus
 *     the inline textarea for quick typing.
 *   - Screen 1 & 2 (`editor`): Dedicated "Edit Description" sheet with `<`
 *     back button, "Edit Description" title, `✓` confirm button, multi-line
 *     editor, and the Outlook bottom formatting toolbar (`Aa` Heading, `B`
 *     Bold, `I` Italic, `U` Underline, `Body`, Bullet list, Numbered list).
 */

import React, { useCallback, useState } from 'react';

export type DescriptionEditorStep = 'summary' | 'editor';

export interface OutlookDescriptionEditorProps {
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

export function OutlookDescriptionEditor({
  value,
  onChange,
  placeholder = 'Add description, meeting agenda…',
  initialStep = 'summary',
}: OutlookDescriptionEditorProps) {
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

  // ─── SCREEN 1 & 2: Edit Description sheet with formatting toolbar ──────────
  if (step === 'editor') {
    return (
      <div
        data-testid="outlook-description-editor-sheet"
        className="rounded-xl border border-[var(--quant-border)] bg-[var(--quant-card)] p-3.5 space-y-3"
      >
        {/* Top bar: < | Edit Description | ✓ */}
        <div className="flex items-center justify-between border-b border-[var(--quant-border)] pb-2.5">
          <button
            type="button"
            onClick={() => setStep('summary')}
            aria-label="Cancel description edit"
            className="text-xs font-medium text-[var(--app-accent)] hover:underline"
          >
            ← Back
          </button>
          <span className="text-xs font-semibold text-white">Edit Description</span>
          <button
            type="button"
            onClick={handleConfirm}
            aria-label="Save description"
            className="text-xs font-bold text-[var(--app-accent)] hover:underline"
          >
            ✓ Done
          </button>
        </div>

        <textarea
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Daily team sync for updates and blockers."
          aria-label="Edit Description"
          className="w-full resize-y rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] p-3 text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none focus:border-[var(--app-accent)]"
        />

        {/* Outlook iOS Bottom Formatting Bar: Aa | B | I | U | Body | Bullet | Numbered */}
        <div
          role="toolbar"
          aria-label="Description formatting"
          className="flex flex-wrap items-center gap-1.5 border-t border-[var(--quant-border)] pt-2"
        >
          <button
            type="button"
            onClick={() => handleFormat('heading')}
            aria-label="Heading"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[var(--quant-surface-hover)]"
          >
            Aa
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bold')}
            aria-label="Bold"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[var(--quant-surface-hover)]"
          >
            B
          </button>
          <button
            type="button"
            onClick={() => handleFormat('italic')}
            aria-label="Italic"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] italic text-white hover:bg-[var(--quant-surface-hover)]"
          >
            I
          </button>
          <button
            type="button"
            onClick={() => handleFormat('underline')}
            aria-label="Underline"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] underline text-white hover:bg-[var(--quant-surface-hover)]"
          >
            U
          </button>
          <button
            type="button"
            onClick={() => handleFormat('body')}
            aria-label="Body style"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] font-medium text-[var(--app-accent)] hover:bg-[var(--quant-surface-hover)]"
          >
            Body
          </button>
          <button
            type="button"
            onClick={() => handleFormat('bullet')}
            aria-label="Bulleted list"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-1 text-[11px] text-white hover:bg-[var(--quant-surface-hover)]"
          >
            • List
          </button>
          <button
            type="button"
            onClick={() => handleFormat('numbered')}
            aria-label="Numbered list"
            className="rounded-md border border-[var(--quant-border)] bg-[var(--quant-surface-elevated)] px-2 py-1 text-[11px] text-white hover:bg-[var(--quant-surface-hover)]"
          >
            1. List
          </button>
        </div>
      </div>
    );
  }

  // ─── SCREEN 0 & 3: Summary row + quick textarea inside New Event / Series ─
  const previewText = value.trim();

  return (
    <div className="py-2 space-y-1.5 text-[var(--quant-muted-foreground)]" data-testid="outlook-description-summary">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium text-white">
          <span className="text-base leading-none text-[var(--quant-muted-foreground)]">≡</span>
          <span>Description</span>
        </span>
        <button
          type="button"
          onClick={handleOpenEditor}
          aria-label="Edit Description"
          className="inline-flex items-center gap-1.5 truncate max-w-[220px] text-xs font-medium text-[var(--app-accent)] hover:underline"
        >
          <span className="truncate text-[var(--quant-muted-foreground)]">
            {previewText ? previewText : 'Edit Description'}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <textarea
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[44px] w-full resize-none bg-transparent text-xs text-white placeholder-[var(--quant-muted-foreground)] focus:outline-none sm:min-h-0 focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
      />
    </div>
  );
}
