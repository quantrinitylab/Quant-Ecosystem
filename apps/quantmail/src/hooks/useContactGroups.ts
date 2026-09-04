import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type { ContactGroup } from '../types';

/**
 * Named sets of addresses the user writes to as a unit.
 *
 * Shaped exactly like {@link useContacts} — same envelope unwrapping, same
 * `response.data!` after a `success` check, same single invalidation key on every
 * mutation — because the two hooks are read side by side and a reader should not
 * have to work out whether the rules changed.
 *
 * The key is `['contact-groups']` rather than a child of `['contacts']`: a group
 * is not derived from the address book (its members need not be saved contacts),
 * so saving a contact must not refetch groups and renaming a group must not
 * invalidate the directory.
 */
const GROUPS_KEY = ['contact-groups'] as const;

export function useContactGroups() {
  return useQuery({
    queryKey: GROUPS_KEY,
    queryFn: async () => {
      const response = await apiClient.getContactGroups();
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load groups');
      }
      return response.data ?? [];
    },
    // A hand-built chip strip changes on a human timescale, and every mutation
    // below invalidates this key anyway.
    staleTime: 5 * 60_000,
  });
}

export interface CreateContactGroupInput {
  name: string;
  emails?: string[];
  color?: string | null;
}

export function useCreateContactGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateContactGroupInput): Promise<ContactGroup> => {
      const response = await apiClient.createContactGroup(data);
      if (!response.success) {
        // The server's message is the useful one here: a duplicate name comes
        // back as `You already have a group called "Family"`, which is what the
        // editor should show instead of a generic failure.
        throw new Error(response.error?.message || 'Failed to create group');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export interface UpdateContactGroupInput {
  name?: string;
  emails?: string[];
  color?: string | null;
}

export function useUpdateContactGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateContactGroupInput;
    }): Promise<ContactGroup> => {
      const response = await apiClient.updateContactGroup(id, data);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update group');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useDeleteContactGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.deleteContactGroup(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete group');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}
