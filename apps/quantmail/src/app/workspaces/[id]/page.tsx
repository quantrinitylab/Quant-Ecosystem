'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  Modal,
  Skeleton,
} from '@quant/shared-ui';
import { AppShell } from '../../../components/AppShell';
import { AppSidebar } from '../../../components/AppSidebar';
import { PageTransition } from '../../../components/PageTransition';
import { RoleSelect } from '../../../components/workspaces/RoleSelect';
import {
  useDeleteWorkspace,
  useInviteToWorkspace,
  useLeaveWorkspace,
  useRemoveMember,
  useResendInvite,
  useRevokeInvite,
  useUpdateMemberRole,
  useUpdateWorkspace,
  useWorkspace,
} from '../../../hooks/useWorkspaces';
import {
  ROLE_COPY,
  can,
  type InviteRole,
  type InviteSendResult,
  type WorkspaceRole,
} from '../../../types/workspace';

type Tab = 'members' | 'invites' | 'settings';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'members', label: 'Members' },
  { id: 'invites', label: 'Invitations' },
  { id: 'settings', label: 'Settings' },
];

export default function WorkspaceDetailPage() {
  const params = useParams<{ id: string }>();
  const workspaceId = params?.id ?? '';
  const router = useRouter();

  const { data: workspace, isLoading, error, refetch } = useWorkspace(workspaceId);
  const invite = useInviteToWorkspace(workspaceId);
  const resendInvite = useResendInvite(workspaceId);
  const revokeInvite = useRevokeInvite(workspaceId);
  const updateRole = useUpdateMemberRole(workspaceId);
  const removeMember = useRemoveMember(workspaceId);
  const updateWorkspace = useUpdateWorkspace(workspaceId);
  const deleteWorkspace = useDeleteWorkspace(workspaceId);
  const leaveWorkspace = useLeaveWorkspace(workspaceId);

  const [tab, setTab] = useState<Tab>('members');
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('MEMBER');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResults, setInviteResults] = useState<InviteSendResult[] | null>(null);

  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const role = workspace?.role;
  const pendingInvites = useMemo(
    () => (workspace?.invites ?? []).filter((item) => item.status === 'PENDING'),
    [workspace],
  );

  const run = async (task: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await task();
    } catch (taskError) {
      setActionError(taskError instanceof Error ? taskError.message : 'That action failed.');
    }
  };

  const handleInvite = async () => {
    const emails = inviteEmails
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setInviteError('Add at least one email address.');
      return;
    }
    setInviteError(null);
    try {
      const result = await invite.mutateAsync({
        emails,
        role: inviteRole as InviteRole,
        ...(inviteMessage.trim() ? { message: inviteMessage.trim() } : {}),
      });
      setInviteResults(result.results);
      setInviteEmails('');
      setInviteMessage('');
    } catch (mutationError) {
      setInviteError(
        mutationError instanceof Error ? mutationError.message : 'Could not send the invitations.',
      );
    }
  };

  if (isLoading) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <div className="space-y-3 p-6">
          <Skeleton variant="rect" width="40%" height="32px" />
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} variant="rect" width="100%" height="64px" />
          ))}
        </div>
      </AppShell>
    );
  }

  if (error || !workspace) {
    return (
      <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
        <div className="p-6">
          <ErrorState
            title="Workspace unavailable"
            message={error?.message ?? 'This workspace could not be loaded.'}
            onRetry={() => void refetch()}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <PageTransition className="workspace-page flex h-full flex-col">
        <div className="border-b border-[var(--quant-border)] p-4">
          <button
            type="button"
            onClick={() => router.push('/workspaces')}
            className="text-xs text-[var(--quant-muted-foreground)] hover:underline"
          >
            &larr; All workspaces
          </button>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-semibold">{workspace.name}</h1>
                <Badge variant={role === 'OWNER' ? 'primary' : 'default'}>
                  {ROLE_COPY[workspace.role].label}
                </Badge>
              </div>
              <p className="text-xs text-[var(--quant-muted-foreground)]">
                {workspace.description || `/${workspace.slug}`}
              </p>
            </div>
            {can(role, 'invite') && (
              <Button variant="primary" onClick={() => setShowInvite(true)}>
                Invite people
              </Button>
            )}
          </div>

          <div className="mt-4 flex gap-1">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background:
                    tab === item.id ? 'var(--quant-muted, rgba(255,255,255,.08))' : 'transparent',
                  color:
                    tab === item.id
                      ? 'var(--quant-foreground, #f5f3f7)'
                      : 'var(--quant-muted-foreground, #9b99a6)',
                }}
              >
                {item.label}
                {item.id === 'invites' && pendingInvites.length > 0 ? ` (${pendingInvites.length})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {actionError && (
            <Card padding="none" className="mb-3 p-3 text-xs text-[var(--quant-danger,#ef4444)]">
              {actionError}
            </Card>
          )}

          {tab === 'members' &&
            workspace.members.map((member) => (
              <Card key={member.id} padding="none" className="mb-2 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar src={member.avatarUrl} name={member.displayName || member.email} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{member.displayName}</span>
                      {member.isYou && <Badge variant="info">You</Badge>}
                    </div>
                    <p className="truncate text-xs text-[var(--quant-muted-foreground)]">
                      {member.email}
                    </p>
                  </div>
                  {can(role, 'manageMembers') && !member.isYou && member.role !== 'OWNER' ? (
                    <select
                      value={member.role}
                      onChange={(event) =>
                        void run(() =>
                          updateRole.mutateAsync({
                            memberId: member.userId,
                            role: event.target.value as WorkspaceRole,
                          }),
                        )
                      }
                      className="rounded-lg border border-[var(--quant-border)] bg-transparent px-2 py-1 text-xs"
                    >
                      {(['ADMIN', 'MEMBER', 'VIEWER'] as WorkspaceRole[]).map((option) => (
                        <option key={option} value={option}>
                          {ROLE_COPY[option].label}
                        </option>
                      ))}
                      {role === 'OWNER' && <option value="OWNER">Transfer ownership</option>}
                    </select>
                  ) : (
                    <Badge variant={member.role === 'OWNER' ? 'primary' : 'default'}>
                      {ROLE_COPY[member.role].label}
                    </Badge>
                  )}
                  {can(role, 'manageMembers') && !member.isYou && member.role !== 'OWNER' && (
                    <Button
                      variant="secondary"
                      onClick={() => void run(() => removeMember.mutateAsync(member.userId))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </Card>
            ))}

          {tab === 'invites' &&
            (pendingInvites.length === 0 ? (
              <EmptyState
                title="No pending invitations"
                description="Invite teammates by email — they get a secure link that adds them to this workspace with the role you pick."
                {...(can(role, 'invite')
                  ? { actionLabel: 'Invite people', onAction: () => setShowInvite(true) }
                  : {})}
              />
            ) : (
              pendingInvites.map((item) => (
                <Card key={item.id} padding="none" className="mb-2 p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.email}</p>
                      <p className="text-xs text-[var(--quant-muted-foreground)]">
                        Invited as {ROLE_COPY[item.role].label} &middot; expires{' '}
                        {new Date(item.expiresAt).toLocaleDateString()}
                        {item.sendCount > 1 ? ` · sent ${item.sendCount}×` : ''}
                      </p>
                    </div>
                    {can(role, 'invite') && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={() => void run(() => resendInvite.mutateAsync(item.id))}
                        >
                          Resend
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => void run(() => revokeInvite.mutateAsync(item.id))}
                        >
                          Revoke
                        </Button>
                      </>
                    )}
                  </div>
                </Card>
              ))
            ))}

          {tab === 'settings' && (
            <div className="max-w-xl space-y-4">
              {can(role, 'editWorkspace') && (
                <Card padding="none" className="space-y-4 p-4">
                  <h2 className="text-sm font-semibold">Workspace details</h2>
                  <FormField label="Name">
                    <Input
                      value={nameDraft ?? workspace.name}
                      onChange={(event) => setNameDraft(event.target.value)}
                      fullWidth
                    />
                  </FormField>
                  <FormField label="Description">
                    <Input
                      value={descriptionDraft ?? workspace.description ?? ''}
                      onChange={(event) => setDescriptionDraft(event.target.value)}
                      fullWidth
                    />
                  </FormField>
                  <Button
                    variant="primary"
                    loading={updateWorkspace.isPending}
                    onClick={() =>
                      void run(async () => {
                        await updateWorkspace.mutateAsync({
                          name: nameDraft ?? workspace.name,
                          description: descriptionDraft ?? workspace.description,
                        });
                        setNameDraft(null);
                        setDescriptionDraft(null);
                      })
                    }
                  >
                    Save changes
                  </Button>
                </Card>
              )}

              <Card padding="none" className="space-y-3 p-4">
                <h2 className="text-sm font-semibold">Your membership</h2>
                <p className="text-xs text-[var(--quant-muted-foreground)]">
                  {role === 'OWNER'
                    ? 'Transfer ownership to another member before you can leave this workspace.'
                    : 'Leaving removes your access to this workspace immediately.'}
                </p>
                <Button
                  variant="secondary"
                  disabled={role === 'OWNER'}
                  loading={leaveWorkspace.isPending}
                  onClick={() =>
                    void run(async () => {
                      await leaveWorkspace.mutateAsync();
                      router.push('/workspaces');
                    })
                  }
                >
                  Leave workspace
                </Button>
              </Card>

              {can(role, 'deleteWorkspace') && (
                <Card
                  padding="none"
                  variant="outlined"
                  className="space-y-3 p-4 border-[var(--quant-danger,#ef4444)]"
                >
                  <h2 className="text-sm font-semibold text-[var(--quant-danger,#ef4444)]">
                    Danger zone
                  </h2>
                  <p className="text-xs text-[var(--quant-muted-foreground)]">
                    Deleting this workspace removes all memberships and pending invitations. This
                    cannot be undone.
                  </p>
                  <Button variant="danger" onClick={() => setShowDelete(true)}>
                    Delete workspace
                  </Button>
                </Card>
              )}
            </div>
          )}
        </div>

        {/* Invite modal */}
        <Modal
          isOpen={showInvite}
          onClose={() => {
            setShowInvite(false);
            setInviteResults(null);
          }}
          title="Invite people"
          description="Paste one or many email addresses — each person gets their own secure join link."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowInvite(false);
                  setInviteResults(null);
                }}
              >
                Done
              </Button>
              <Button variant="primary" loading={invite.isPending} onClick={() => void handleInvite()}>
                Send invitations
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <FormField
              label="Email addresses"
              required
              hint="Separate with commas, spaces or new lines."
              error={inviteError ?? undefined}
            >
              <Input
                value={inviteEmails}
                onChange={(event) => setInviteEmails(event.target.value)}
                placeholder="kundan@quantmail.in, dev@quantrinity.in"
                fullWidth
              />
            </FormField>
            <FormField label="Role">
              <RoleSelect
                value={inviteRole}
                onChange={setInviteRole}
                roles={['ADMIN', 'MEMBER', 'VIEWER']}
              />
            </FormField>
            <FormField label="Personal note" hint="Optional — included in the invite email.">
              <Input
                value={inviteMessage}
                onChange={(event) => setInviteMessage(event.target.value)}
                placeholder="Joining us on the trading platform build."
                fullWidth
              />
            </FormField>

            {inviteResults && (
              <div className="space-y-2 rounded-xl border border-[var(--quant-border)] p-3">
                {inviteResults.map((result) => (
                  <div key={result.email} className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate">{result.email}</span>
                    <Badge
                      variant={
                        result.status === 'invited'
                          ? 'success'
                          : result.status === 'already_member'
                            ? 'info'
                            : 'danger'
                      }
                    >
                      {result.status === 'invited'
                        ? result.emailSent
                          ? 'Invite sent'
                          : 'Link ready'
                        : result.status === 'already_member'
                          ? 'Already a member'
                          : (result.reason ?? 'Failed')}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>

        {/* Delete confirmation */}
        <Modal
          isOpen={showDelete}
          onClose={() => setShowDelete(false)}
          title="Delete workspace"
          description={`Type “${workspace.name}” to confirm.`}
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={deleteConfirm !== workspace.name}
                loading={deleteWorkspace.isPending}
                onClick={() =>
                  void run(async () => {
                    await deleteWorkspace.mutateAsync();
                    router.push('/workspaces');
                  })
                }
              >
                Delete permanently
              </Button>
            </div>
          }
        >
          <FormField label="Workspace name">
            <Input
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder={workspace.name}
              fullWidth
            />
          </FormField>
        </Modal>
      </PageTransition>
    </AppShell>
  );
}
