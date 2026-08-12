import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import type {
  InviteRole,
  WorkspaceDetail,
  WorkspaceRole,
  WorkspaceSummary,
} from '../types/workspace';

const unwrap = <T,>(response: { success: boolean; data?: T; error?: { message?: string } }, fallback: string): T => {
  if (!response.success || response.data === undefined) {
    throw new Error(response.error?.message || fallback);
  }
  return response.data;
};

export function useWorkspaces() {
  return useQuery<WorkspaceSummary[]>({
    queryKey: ['workspaces'],
    queryFn: async () => unwrap(await apiClient.listWorkspaces(), 'Could not load your workspaces.'),
  });
}

export function useWorkspace(id: string | undefined) {
  return useQuery<WorkspaceDetail>({
    queryKey: ['workspace', id],
    enabled: Boolean(id),
    queryFn: async () => unwrap(await apiClient.getWorkspace(id as string), 'Could not load this workspace.'),
  });
}

function useWorkspaceInvalidation(id?: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    if (id) queryClient.invalidateQueries({ queryKey: ['workspace', id] });
  };
}

export function useCreateWorkspace() {
  const invalidate = useWorkspaceInvalidation();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) =>
      unwrap(await apiClient.createWorkspace(input), 'Could not create the workspace.'),
    onSuccess: invalidate,
  });
}

export function useUpdateWorkspace(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async (input: { name?: string; description?: string | null }) =>
      unwrap(await apiClient.updateWorkspace(id, input), 'Could not save the workspace.'),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkspace(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.deleteWorkspace(id), 'Could not delete the workspace.'),
    onSuccess: invalidate,
  });
}

export function useInviteToWorkspace(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async (input: { emails: string[]; role: InviteRole; message?: string }) =>
      unwrap(await apiClient.inviteToWorkspace(id, input), 'Could not send the invitations.'),
    onSuccess: invalidate,
  });
}

export function useResendInvite(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async (inviteId: string) =>
      unwrap(await apiClient.resendWorkspaceInvite(id, inviteId), 'Could not resend the invitation.'),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async (inviteId: string) =>
      unwrap(await apiClient.revokeWorkspaceInvite(id, inviteId), 'Could not revoke the invitation.'),
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: WorkspaceRole }) =>
      unwrap(await apiClient.updateWorkspaceMemberRole(id, memberId, role), 'Could not change the role.'),
    onSuccess: invalidate,
  });
}

export function useRemoveMember(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async (memberId: string) =>
      unwrap(await apiClient.removeWorkspaceMember(id, memberId), 'Could not remove the member.'),
    onSuccess: invalidate,
  });
}

export function useLeaveWorkspace(id: string) {
  const invalidate = useWorkspaceInvalidation(id);
  return useMutation({
    mutationFn: async () => unwrap(await apiClient.leaveWorkspace(id), 'Could not leave the workspace.'),
    onSuccess: invalidate,
  });
}

export function useInvitePreview(token: string | undefined) {
  return useQuery({
    queryKey: ['invite', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () =>
      unwrap(await apiClient.getInvitePreview(token as string), 'This invitation link is not valid.'),
  });
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) =>
      unwrap(await apiClient.acceptInvite(token), 'Could not accept the invitation.'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
