import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { createContactsPageQuery, type ContactsPageOptions } from '../lib/contacts-pagination';
import type { Contact, CompanyGroup, LetterGroup, ContactActivitySuggestion } from '../types';

export function useContacts(options?: {
  q?: string;
  tag?: string;
  favorites?: boolean;
  page?: number;
}) {
  return useQuery({
    queryKey: ['contacts', options],
    queryFn: async () => {
      const response = await apiClient.getContacts(options);
      if (!response.success) throw new Error(response.error?.message || 'Failed to load contacts');
      return response.data ?? [];
    },
  });
}

/**
 * The signed-in user's address book as a lowercased `Set` of addresses.
 *
 * Exists so a caller can ask "do I know this person?" without paging through
 * `GET /contacts`, which returns 20 records at a time and caps at 100 — a join
 * against one page silently reports contact 21 as a stranger.
 *
 * The key sits under `['contacts']` so the create/update/delete mutations below,
 * which invalidate that prefix, refresh this too: save a contact and the inbox's
 * `Contacts` lens picks them up without any extra wiring.
 *
 * Addresses are folded to lower case on the server as well, because
 * `recordInteraction` trims but does not case-fold and the same person can hold
 * two rows. Compare lowercased or the membership test misses one of them.
 */
export function useContactDirectory() {
  return useQuery({
    queryKey: ['contacts', 'directory'] as const,
    queryFn: async () => {
      const response = await apiClient.getContactDirectory();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load contact directory');
      }
      return new Set((response.data?.emails ?? []).map((email) => email.trim().toLowerCase()));
    },
    // An address book changes on a human timescale, and every mutation that can
    // change it invalidates this key anyway.
    staleTime: 5 * 60_000,
  });
}

export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Contact>) => {
      const response = await apiClient.createContact(data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to create contact');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Contact> }) => {
      const response = await apiClient.updateContact(id, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update contact');
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.deleteContact(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete contact');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });
}

/** Paginated list for the contacts screen; folded from useContactsPage (Task K07). */
export function useContactsPage(options?: ContactsPageOptions) {
  return useQuery(createContactsPageQuery((request) => apiClient.getContacts(request), options));
}

/**
 * Company groups for the Companies tab, aggregated server-side across ALL of
 * the user's contacts. Grouping from the paginated list page silently dropped
 * companies whose members all sat on other pages and undercounted members —
 * `GET /contacts/companies` is unpaginated, which is the fix.
 *
 * The key sits under `['contacts']` so the create/update/delete mutations,
 * which invalidate that prefix, refresh the tab too: edit a contact's
 * company and the Companies tab regroups without any extra wiring.
 */
export function useCompanyGroups(options?: {
  q?: string;
  favorites?: boolean;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['contacts', 'companies', { q: options?.q, favorites: options?.favorites }] as const,
    queryFn: async (): Promise<CompanyGroup[]> => {
      const response = await apiClient.getCompanyGroups({
        q: options?.q,
        favorites: options?.favorites,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load companies');
      }
      return response.data ?? [];
    },
    enabled: options?.enabled ?? true,
    // An address book changes on a human timescale, and every mutation that
    // can change it invalidates this key anyway.
    staleTime: 5 * 60_000,
  });
}

/**
 * Per-letter contact totals for the A–Z index, aggregated server-side across
 * ALL of the user's contacts. The page's headers and sidebar index used to
 * count from the paginated list page, so "A (7)" on page 2 of 5 counted only
 * page 2's A-contacts while reading as a total — `GET /contacts/letters` is
 * unpaginated, which is the fix.
 *
 * The key sits under `['contacts']` so the create/update/delete mutations,
 * which invalidate that prefix, refresh the index too: add a contact and the
 * letter totals regroup without any extra wiring.
 */
export function useLetterGroups(options?: {
  q?: string;
  favorites?: boolean;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['contacts', 'letters', { q: options?.q, favorites: options?.favorites }] as const,
    queryFn: async (): Promise<LetterGroup[]> => {
      const response = await apiClient.getLetterGroups({
        q: options?.q,
        favorites: options?.favorites,
      });
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load letter index');
      }
      return response.data ?? [];
    },
    enabled: options?.enabled ?? true,
    // An address book changes on a human timescale, and every mutation that
    // can change it invalidates this key anyway.
    staleTime: 5 * 60_000,
  });
}

export type { ContactsPageOptions };

/**
 * Frequent correspondents who are NOT saved contacts yet (Gmail "Merge & Fix"
 * analogue) — aggregated from real mail by `GET /contacts/suggestions`.
 * Backs the contacts page's "Suggested from your mail" section.
 *
 * Named useContactActivitySuggestions (not useContactSuggestions) on purpose:
 * src/hooks/useContactSuggestions.ts already exports a useContactSuggestions
 * for the composer's recipient autocomplete (backed by /contacts/frequent);
 * this is a different hook with a different payload.
 *
 * The key sits under `['contacts']` so the create mutation below, which
 * invalidates that prefix, refreshes this too: add a suggestion and it
 * disappears from the list without any extra wiring.
 */
export function useContactActivitySuggestions(options?: { limit?: number; enabled?: boolean }) {
  return useQuery({
    queryKey: ['contacts', 'suggestions', { limit: options?.limit }] as const,
    queryFn: async (): Promise<ContactActivitySuggestion[]> => {
      const response = await apiClient.getContactSuggestions(options?.limit);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load suggestions');
      }
      return response.data ?? [];
    },
    enabled: options?.enabled ?? true,
    // Mail activity changes on a human timescale, and the create mutation
    // invalidates this key anyway.
    staleTime: 5 * 60_000,
  });
}
