import type { ContactsPagination as Pagination } from '../lib/contacts-pagination';

interface ContactsPaginationProps {
  page: number;
  pagination?: Pagination;
  isFetching: boolean;
  hasError: boolean;
  onPageChange: (page: number) => void;
}

export function ContactsPagination({
  page,
  pagination,
  isFetching,
  hasError,
  onPageChange,
}: ContactsPaginationProps) {
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
    'min-h-11 rounded-xl border border-[#282C35] bg-[#16181D] px-3 text-sm font-medium text-[#F5F5F5] transition-colors hover:border-[#3A404D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <nav
      aria-label="Contacts pagination"
      aria-busy={isFetching}
      className="shrink-0 border-b border-[var(--quant-border)] bg-[var(--quant-surface)] px-4 py-3 sm:px-8"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-sm text-[#A1A4AC]">
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
      <p className="mt-2 text-sm text-[#A1A4AC]">Letter index and export cover this page.</p>
    </nav>
  );
}
