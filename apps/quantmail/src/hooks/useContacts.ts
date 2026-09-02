import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { Contact } from '../types';

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
