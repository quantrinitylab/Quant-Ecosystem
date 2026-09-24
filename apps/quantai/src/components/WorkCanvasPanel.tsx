'use client';

import React, { useMemo, useState } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  parseMarkdownTable,
  splitMarkdownSlides,
  type WorkFormat,
} from '../lib/workspace-artifacts';

interface WorkCanvasPanelProps {
  content: string | null;
  title: string | null;
  format: WorkFormat;
  isGenerating: boolean;
  onFormatChange: (format: WorkFormat) => void;
  onClose: () => void;
}

const FORMATS: Array<{ id: WorkFormat; label: string; icon: string }> = [
  { id: 'document', label: 'Document', icon: '📄' },
  { id: 'slides', label: 'Slides', icon: '▣' },
  { id: 'sheet', label: 'Sheet', icon: '▦' },
];

export function WorkCanvasPanel({
  content,
  title,
  format,
  isGenerating,
  onFormatChange,
  onClose,
}: WorkCanvasPanelProps) {
  const [copied, setCopied] = useState(false);
  const table = useMemo(
    () => (format === 'sheet' && content ? parseMarkdownTable(content) : null),
    [content, format],
  );
  const slides = useMemo(
    () => (format === 'slides' && content ? splitMarkdownSlides(content) : []),
    [content, format],
  );

  const handleCopy = async () => {
    if (!content || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col border-l border-[var(--quant-border)] bg-[var(--quant-surface)]"
      aria-label="Work canvas"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--foreground-secondary)]">
            Work canvas
          </p>
          <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
            {title || `${FORMATS.find((item) => item.id === format)?.label} workspace`}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {content && (
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="rounded-lg border border-[var(--quant-border)] px-2.5 py-1.5 text-xs text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--quant-surface-hover)] hover:text-[var(--foreground)]"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Work canvas"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--foreground-secondary)] transition-colors hover:bg-[var(--quant-surface-hover)] hover:text-[var(--foreground)]"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--quant-border)] px-4 py-2">
        <div
          className="flex items-center gap-1 rounded-xl border border-[var(--quant-border)] bg-[var(--quant-surface-hover)] p-1"
          role="tablist"
          aria-label="Work output format"
        >
          {FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={format === item.id}
              onClick={() => onFormatChange(item.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                format === item.id
                  ? 'bg-[var(--quant-accent)] text-white shadow-sm'
                  : 'text-[var(--foreground-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--foreground-secondary)]" aria-live="polite">
          {isGenerating
            ? 'Synthesizing with QuantAI…'
            : content
              ? 'Latest response'
              : 'Ready for a prompt'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {!content ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center px-5 text-center">
            <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface-hover)] text-2xl">
              {format === 'slides' ? '▤' : format === 'sheet' ? '▦' : '▧'}
            </span>
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Your {format === 'slides' ? 'slides' : format} will appear here
            </h3>
            <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--foreground-secondary)]">
              Ask QuantAI to draft, structure, or synthesize something. The response will be
              rendered in this canvas while your conversation stays beside it.
            </p>
          </div>
        ) : format === 'document' ? (
          <article className="mx-auto min-h-full max-w-3xl rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-5 py-6 shadow-sm sm:px-9 sm:py-8">
            <MarkdownRenderer content={content} />
          </article>
        ) : format === 'slides' ? (
          <div className="mx-auto grid max-w-5xl gap-4 xl:grid-cols-2">
            {slides.map((slide, index) => (
              <article
                key={`${slide.title}-${index}`}
                className="flex aspect-video min-h-64 flex-col overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-gradient-to-br from-[var(--quant-surface)] to-[var(--quant-surface-hover)] p-5 shadow-sm sm:p-7"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--quant-accent)]">
                  Slide {index + 1}{' '}
                  <span className="text-[var(--foreground-secondary)]">/ {slides.length}</span>
                </p>
                <h3 className="mt-3 text-xl font-semibold leading-tight text-[var(--foreground)] sm:text-2xl">
                  {slide.title}
                </h3>
                <div className="mt-3 min-h-0 flex-1 overflow-auto text-sm text-[var(--foreground-secondary)]">
                  <MarkdownRenderer content={slide.content || 'Add content for this slide.'} />
                </div>
              </article>
            ))}
          </div>
        ) : table ? (
          <div className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                <thead className="bg-[var(--quant-surface-hover)]">
                  <tr>
                    {table.headers.map((header, index) => (
                      <th
                        key={`${header}-${index}`}
                        scope="col"
                        className="border-b border-[var(--quant-border)] px-4 py-3 font-semibold text-[var(--foreground)]"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr
                      key={`row-${rowIndex}`}
                      className="odd:bg-[var(--quant-surface)] even:bg-[var(--quant-surface-hover)]/50"
                    >
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${rowIndex}-${cellIndex}`}
                          className="border-b border-[var(--quant-border)]/70 px-4 py-3 align-top text-[var(--foreground-secondary)]"
                        >
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.rows.length === 0 && (
                    <tr>
                      <td
                        colSpan={table.headers.length}
                        className="px-4 py-8 text-center text-xs text-[var(--foreground-secondary)]"
                      >
                        The table has headers but no data rows yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="mb-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100/80">
              No Markdown table was found in this response. Ask QuantAI for a table to render the
              sheet grid.
            </div>
            <article className="rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] px-5 py-6">
              <MarkdownRenderer content={content} />
            </article>
          </div>
        )}
      </div>
    </section>
  );
}

export default WorkCanvasPanel;
