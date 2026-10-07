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

/**
 * Admin roles and member management, shown in the group info modal's Members
 * tab. Every one of these is owner-gated server-side (the owner is the
 * group's implicit admin), so a 403 here means the caller is not the owner —
 * the modal only ever opens on the owner's own groups.
 */
export function usePromoteGroupAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const response = await apiClient.promoteGroupAdmin(id, email);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to promote admin');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useDemoteGroupAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const response = await apiClient.demoteGroupAdmin(id, email);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to demote admin');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useRemoveGroupMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const response = await apiClient.removeGroupMember(id, email);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to remove member');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/**
 * The group's active join link, if one exists. Queried (not derived from the
 * group row) so Generate/Revoke in the modal always shows the live token.
 */
export function useGroupInviteLink(groupId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [...GROUPS_KEY, groupId, 'invite-link'] as const,
    enabled: enabled && Boolean(groupId),
    queryFn: async () => {
      const response = await apiClient.getGroupInviteLink(groupId as string);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load invite link');
      }
      return response.data ?? null;
    },
    staleTime: 60_000,
  });
}

export function useCreateGroupInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.createGroupInviteLink(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create invite link');
      }
      return response.data!;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [...GROUPS_KEY, id, 'invite-link'] });
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

export function useRevokeGroupInviteLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.revokeGroupInviteLink(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to revoke invite link');
      }
      return response.data!;
    },
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: [...GROUPS_KEY, id, 'invite-link'] });
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}

/**
 * Public preview of a join link — what the join page shows before the visitor
 * signs in. Follows the workspace `useInvitePreview` shape: same `unwrap`
 * failure message becomes the ErrorState copy.
 */
export function useGroupInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['group-invite', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await apiClient.getGroupInvitePreview(token as string);
      if (!response.success) {
        throw new Error(response.error?.message || 'This invite link is not valid.');
      }
      return response.data!;
    },
  });
}

export function useJoinGroupByInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await apiClient.joinGroupByInvite(token);
      if (!response.success) {
        throw new Error(response.error?.message || 'Could not join the group.');
      }
      return response.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: GROUPS_KEY });
    },
  });
}
