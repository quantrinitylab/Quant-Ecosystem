import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Email, SearchEmailRequest } from '../types';

/**
 * Pull the list out of whichever envelope the search route sent.
 *
 * `GET /emails` puts its array straight in `data`. `GET /emails/search` used to put
 * a pagination object there and the array one level further down, and the type said
 * `Email[]` either way — so the page received `{data, total, page, …}`, `?? []` never
 * fired because an object is truthy, and the inbox crashed inside
 * `groupEmailsIntoThreads`. The route is flat now; this stays because the two sides
 * deploy separately, and search going quiet is not something a version skew should be
 * able to do twice.
 */
function toEmailList(payload: unknown): Email[] {
  if (Array.isArray(payload)) return payload as Email[];
  const nested = (payload as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(nested) ? (nested as Email[]) : [];
}

export function useSearchEmails(params: Partial<SearchEmailRequest> | null) {
  return useQuery<Email[]>({
    queryKey: ['email-search', params],
    queryFn: async () => {
      if (!params) return [];
      const response = await apiClient.searchEmails(params);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to search emails');
      }
      return toEmailList(response.data);
    },
    enabled: !!params,
  });
}

export default useSearchEmails;
