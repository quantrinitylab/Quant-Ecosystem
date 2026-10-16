import * as React from 'react';
import type { ContactsPagination as Pagination } from '../lib/contacts-pagination';

interface ContactsPaginationProps {
  page: number;
  pagination?: Pagination;
  isFetching: boolean;
  hasError: boolean;
  onPageChange: (page: number) => void;
  /**
   * What the A–Z letter counts describe. `'all'` — the index shows true
   * per-letter totals aggregated server-side across the whole address book
   * (GET /contacts/letters). `'page'` — the index falls back to the loaded
   * page (the contact-group view, whose client-side group filter the endpoint
   * does not honour), and the note says so. Export always covers all of the
   * user's contacts server-side — it was never page-scoped despite the old
   * note claiming it was.
   */
  letterScope?: 'all' | 'page';
}

export function ContactsPagination({
  page,
  pagination,
  isFetching,
  hasError,
  onPageChange,
  letterScope = 'all',
}: ContactsPaginationProps): React.ReactElement | null {
  const current = pagination?.page === page ? pagination : undefined;
  // Don't add a pager to a known single-page book. On a later page, keep Back
  // available after an error even when no metadata was returned for that page.
  if (page === 1 && (!current || current.totalPages <= 1)) return null;

  const status = isFetching
    ? `Loading page ${page}…`
    : hasError
      ? `Page ${page} could not be loaded.`
      : current
        ? `Page ${page} of ${Math.max(1, current.totalPages)} · ${current.total} contacts`
        : `Page ${page}`;
  const buttonClass =
    'min-h-11 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-3 text-sm font-medium text-[var(--quant-foreground)] transition-colors hover:border-[#3A404D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <nav
      aria-label="Contacts pagination"
      aria-busy={isFetching}
      className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3 sm:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm text-[var(--quant-muted-foreground)]">
          {status}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Previous contacts page"
            className={buttonClass}
            disabled={page <= 1 || isFetching}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            Previous
          </button>
          <button
            type="button"
            aria-label="Next contacts page"
            className={buttonClass}
            disabled={isFetching || hasError || !current?.hasNext}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-[var(--quant-muted-foreground)]">
        {letterScope === 'all'
          ? 'Letter counts and export cover all contacts.'
          : 'Letter index covers this page · export covers all contacts.'}
      </p>
    </nav>
  );
}
