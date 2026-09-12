import type { Contact } from '../types';

export interface ContactsPageOptions {
  q?: string;
  tag?: string;
  favorites?: boolean;
  page?: number;
}

export interface ContactsPagination {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ContactsPage {
  contacts: Contact[];
  pagination: ContactsPagination;
}

export interface ContactsPageResponse {
  success: boolean;
  data?: Contact[];
  metadata?: unknown;
  error?: { message?: string };
}

type ContactsPageRequest = ContactsPageOptions & { page: number };
type FetchContactsPage = (options: ContactsPageRequest) => Promise<ContactsPageResponse>;

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** Preserve the list route's metadata instead of silently treating page one as the whole book. */
export function readContactsPage(response: ContactsPageResponse, requestedPage = 1): ContactsPage {
  if (!response.success) {
    throw new Error(response.error?.message || 'Failed to load contacts');
  }
  if (!Array.isArray(response.data)) {
    throw new Error('Contacts list is unavailable. Please retry.');
  }

  const raw = response.metadata;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Contacts pagination is unavailable. Please retry.');
  }
  const metadata = raw as Record<string, unknown>;
  const { total, page, pageSize } = metadata;
  if (
    !isIntegerAtLeast(total, 0) ||
    !isIntegerAtLeast(page, 1) ||
    !isIntegerAtLeast(pageSize, 1) ||
    page !== requestedPage ||
    response.data.length > pageSize
  ) {
    throw new Error('Contacts pagination is unavailable. Please retry.');
  }

  const totalPages = Math.ceil(total / pageSize);
  // Older client typings make totalPages optional; total and pageSize still
  // define it. A supplied contradictory value is not a trustworthy page count.
  if (metadata.totalPages !== undefined && metadata.totalPages !== totalPages) {
    throw new Error('Contacts pagination is unavailable. Please retry.');
  }

  return {
    contacts: response.data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/** One request for one page. The contacts prefix preserves mutation invalidation. */
export function createContactsPageQuery(
  fetchPage: FetchContactsPage,
  options: ContactsPageOptions = {},
) {
  const request: ContactsPageRequest = {
    q: options.q?.trim() || undefined,
    tag: options.tag?.trim() || undefined,
    favorites: options.favorites,
    page: options.page ?? 1,
  };
  if (!isIntegerAtLeast(request.page, 1)) {
    throw new Error('Contacts page must be a positive integer.');
  }

  return {
    queryKey: ['contacts', 'page', request] as const,
    queryFn: async () => readContactsPage(await fetchPage(request), request.page),
  };
}

/** Deletions may remove the last page. A correction only moves backwards, never loops forward. */
export function getContactPageCorrection(
  page: number,
  pagination?: ContactsPagination,
): number | null {
  if (!pagination || pagination.page !== page) return null;
  const lastPage = Math.max(1, pagination.totalPages);
  return page > lastPage ? lastPage : null;
}
