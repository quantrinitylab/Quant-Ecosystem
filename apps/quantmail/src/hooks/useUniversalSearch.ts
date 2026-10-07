'use client';

// ============================================================================
// QuantMail — Universal Search aggregation hook (K10 / M13).
//
// One query fans out to real backend endpoints and returns per-source sections,
// so a failing source is shown as failed rather than silently dropped (the spec
// calls this "partial results must identify which domain failed").
//
// Covered sources — and only these, so the UI never claims coverage it does not
// have:
//   mail     → POST /api/emails/search  (Gmail-style advanced search)
//   people   → GET  /api/contacts/search
//   calendar → GET  /api/events?q=      (K10: new backend text filter)
//   drive    → GET  /api/search/all     (drive files + collaborative documents)
//
// QuantGit has no search endpoint, so it is not a tab and not claimed.
// ============================================================================

import { useQueries } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Email, Contact, CalendarEvent } from '../types';

export type UniversalSearchScope = 'all' | 'mail' | 'people' | 'calendar' | 'drive';

export interface DriveFileHit {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  updatedAt?: string;
}

export interface DriveDocumentHit {
  id: string;
  title: string;
  updatedAt?: string;
}

export interface UniversalSearchResults {
  query: string;
  mail: { items: Email[]; error: string | null };
  people: { items: Contact[]; error: string | null };
  calendar: { items: CalendarEvent[]; error: string | null };
  drive: { files: DriveFileHit[]; documents: DriveDocumentHit[]; error: string | null };
}

const PER_SOURCE_LIMIT = 8;

function errorOf(error: unknown): string | null {
  if (!error) return null;
  return error instanceof Error ? error.message : 'Search failed.';
}

export function useUniversalSearch(query: string | null): {
  data: UniversalSearchResults | undefined;
  isLoading: boolean;
  isFetching: boolean;
} {
  const trimmed = query?.trim() ?? '';
  const enabled = trimmed.length > 0;

  const [mail, people, calendar, drive] = useQueries({
    queries: [
      {
        queryKey: ['universal-search', 'mail', trimmed],
        enabled,
        queryFn: async (): Promise<Email[]> => {
          const response = await apiClient.searchEmails({ query: trimmed } as never);
          if (!response.success)
            throw new Error(response.error?.message || 'Mail search failed.');
          // searchEmails returns a paginated envelope; tolerate either shape.
          const data = response.data as unknown;
          if (Array.isArray(data)) return data as Email[];
          if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items))
            return (data as { items: Email[] }).items;
          if (data && typeof data === 'object' && Array.isArray((data as { emails?: unknown }).emails))
            return (data as { emails: Email[] }).emails;
          return [];
        },
      },
      {
        queryKey: ['universal-search', 'people', trimmed],
        enabled,
        queryFn: async (): Promise<Contact[]> => {
          const response = await apiClient.searchContacts(trimmed);
          if (!response.success)
            throw new Error(response.error?.message || 'Contacts search failed.');
          return response.data ?? [];
        },
      },
      {
        queryKey: ['universal-search', 'calendar', trimmed],
        enabled,
        queryFn: async (): Promise<CalendarEvent[]> => {
          const response = await apiClient.searchCalendarEvents(trimmed, PER_SOURCE_LIMIT);
          if (!response.success)
            throw new Error(response.error?.message || 'Calendar search failed.');
          return response.data ?? [];
        },
      },
      {
        queryKey: ['universal-search', 'drive', trimmed],
        enabled,
        queryFn: async (): Promise<{ files: DriveFileHit[]; documents: DriveDocumentHit[] }> => {
          const response = await apiClient.searchAll(trimmed, PER_SOURCE_LIMIT);
          if (!response.success)
            throw new Error(response.error?.message || 'Drive search failed.');
          return {
            files: response.data?.files ?? [],
            documents: response.data?.documents ?? [],
          };
        },
      },
    ],
  });

  const isLoading = enabled && (mail.isLoading || people.isLoading || calendar.isLoading || drive.isLoading);
  const isFetching = mail.isFetching || people.isFetching || calendar.isFetching || drive.isFetching;

  const data: UniversalSearchResults | undefined = enabled
    ? {
        query: trimmed,
        mail: { items: mail.data ?? [], error: errorOf(mail.error) },
        people: { items: people.data ?? [], error: errorOf(people.error) },
        calendar: { items: calendar.data ?? [], error: errorOf(calendar.error) },
        drive: {
          files: drive.data?.files ?? [],
          documents: drive.data?.documents ?? [],
          error: errorOf(drive.error),
        },
      }
    : undefined;

  return { data, isLoading, isFetching };
}
