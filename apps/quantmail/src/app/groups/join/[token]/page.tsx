'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, Badge, Button, Card, ErrorState, Skeleton } from '@quant/shared-ui';
import { QuantrinityMark } from '../../../../components/QuantrinityMark';
import {
  useGroupInvitePreview,
  useJoinGroupByInvite,
} from '../../../../hooks/useContactGroups';

/**
 * Join page for a contact-group invite link (`/groups/join/<token>`).
 *
 * Mirrors the workspace invite page (`/invite/[token]`): a public preview
 * first (group name, member count, owner's name — no member addresses leak),
 * then a join button that adds the signed-in user's own address to the
 * owner's group. Auth failures fall through to the app's global 401 handler,
 * which sends the visitor to login and back.
 */
export default function GroupJoinPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const router = useRouter();

  const { data: invite, isLoading, error, refetch } = useGroupInvitePreview(token);
  const joinGroup = useJoinGroupByInvite();
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoin = async () => {
    setJoinError(null);
    try {
      await joinGroup.mutateAsync(token);
      router.push('/contacts');
    } catch (mutationError) {
      const message =
        mutationError instanceof Error ? mutationError.message : 'Could not join the group.';
      setJoinError(message);
      if (/sign in|auth/i.test(message)) {
        router.push(`/login?returnTo=${encodeURIComponent(`/groups/join/${token}`)}`);
      }
    }
  };

  return (
    <main
      id="main-content"
      tabIndex={-1}
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
            title="Invite link not valid"
            message={error.message}
            onRetry={() => void refetch()}
          />
        )}

        {invite && (
          <Card padding="none" className="p-6 text-center">
            <div className="flex justify-center">
              <Avatar name={invite.groupName} size="lg" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">
              {invite.ownerName} invited you to join {invite.groupName}
            </h1>
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">
              Joining adds your email address to {invite.ownerName}&rsquo;s {invite.groupName}{' '}
              group so they can write to everyone at once.
            </p>

            <div className="mt-4 flex items-center justify-center gap-2">
              <Badge variant="default">
                {invite.memberCount} member{invite.memberCount === 1 ? '' : 's'}
              </Badge>
            </div>

            <div className="mt-5 space-y-2">
              <Button
                variant="primary"
                fullWidth
                loading={joinGroup.isPending}
                onClick={() => void handleJoin()}
              >
                Join group
              </Button>
              <Button variant="ghost" fullWidth onClick={() => router.push('/')}>
                Not now
              </Button>
            </div>

            {joinError && (
              <p className="mt-3 text-xs text-[var(--quant-danger,#ef4444)]">{joinError}</p>
            )}
          </Card>
        )}
      </div>
    </main>
  );
}
