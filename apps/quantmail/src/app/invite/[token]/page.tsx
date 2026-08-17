'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, Badge, Button, Card, ErrorState, Skeleton } from '@quant/shared-ui';
import { QuantrinityMark } from '../../../components/QuantrinityMark';
import { useAcceptInvite, useInvitePreview } from '../../../hooks/useWorkspaces';
import { ROLE_COPY } from '../../../types/workspace';

export default function InviteAcceptPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const router = useRouter();

  const { data: invite, isLoading, error, refetch } = useInvitePreview(token);
  const acceptInvite = useAcceptInvite();
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const handleAccept = async () => {
    setAcceptError(null);
    try {
      const result = await acceptInvite.mutateAsync(token);
      router.push(`/workspaces/${result.workspaceId}`);
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Could not accept the invitation.';
      setAcceptError(message);
      if (/sign in|unauthor/i.test(message)) {
        router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      }
    }
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center p-6"
      style={{
        background: 'var(--quant-background, #0b0b0f)',
        color: 'var(--quant-foreground, #f5f3f7)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center">
          <QuantrinityMark />
        </div>

        {isLoading && <Skeleton variant="rect" width="100%" height="260px" />}

        {error && (
          <ErrorState
            title="Invitation not valid"
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {invite && (
          <Card padding="none" className="p-6 text-center">
            <div className="flex justify-center">
              <Avatar src={invite.invitedBy.avatarUrl} name={invite.invitedBy.name} size="lg" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">
              {invite.invitedBy.name} invited you to {invite.workspace.name}
            </h1>
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">
              {invite.workspace.description ||
                'Join the workspace to collaborate on mail, drive, calendar and CodeHub together.'}
            </p>

            <div className="mt-4 flex items-center justify-center gap-2">
              <Badge variant="primary">{ROLE_COPY[invite.role].label}</Badge>
              <Badge variant="default">
                {invite.workspace.memberCount} member
                {invite.workspace.memberCount === 1 ? '' : 's'}
              </Badge>
            </div>

            {invite.message && (
              <p className="mt-4 rounded-xl border border-[var(--quant-border)] p-3 text-left text-xs italic text-[var(--quant-muted-foreground)]">
                &ldquo;{invite.message}&rdquo;
              </p>
            )}

            <p className="mt-4 text-[11px] text-[var(--quant-muted-foreground)]">
              This invite is for <strong>{invite.email}</strong> and expires on{' '}
              {new Date(invite.expiresAt).toLocaleDateString()}.
            </p>

            {invite.status !== 'PENDING' ? (
              <p className="mt-4 text-xs text-[var(--quant-danger,#ef4444)]">
                This invitation is no longer active ({invite.status.toLowerCase()}). Ask for a fresh
                invite.
              </p>
            ) : (
              <div className="mt-5 space-y-2">
                <Button
                  variant="primary"
                  fullWidth
                  loading={acceptInvite.isPending}
                  onClick={() => void handleAccept()}
                >
                  Accept invitation
                </Button>
                <Button variant="ghost" fullWidth onClick={() => router.push('/')}>
                  Not now
                </Button>
              </div>
            )}

            {acceptError && (
              <p className="mt-3 text-xs text-[var(--quant-danger,#ef4444)]">{acceptError}</p>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
