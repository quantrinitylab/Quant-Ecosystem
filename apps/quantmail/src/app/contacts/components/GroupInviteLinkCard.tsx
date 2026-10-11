'use client';

import { useState } from 'react';
import {
  useGroupInviteLink,
  useCreateGroupInviteLink,
  useRevokeGroupInviteLink,
} from '../../../hooks/useContactGroups';
import { useConfirm } from '../../../hooks/useConfirm';

/**
 * Create/copy UI for a contact group's join link, shown on the contacts
 * Groups tab when a group is selected. Everything is the real backend row:
 * the URL and its created date come from GET/POST /contact-groups/:id/invite-link
 * — never a placeholder, and no expiry is claimed because links do not
 * expire (they stay active until revoked or regenerated).
 */
export function GroupInviteLinkCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { data: link, isLoading, error, refetch } = useGroupInviteLink(groupId, true);
  const createLink = useCreateGroupInviteLink();
  const revokeLink = useRevokeGroupInviteLink();
  const { confirm, dialog } = useConfirm();
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const busy = createLink.isPending || revokeLink.isPending;

  const copyLink = async () => {
    if (!link?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(link.inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the URL is still visible to copy by hand */
    }
  };

  const handleCreate = async () => {
    setActionError(null);
    try {
      await createLink.mutateAsync(groupId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not create the invite link.');
    }
  };

  const handleRevoke = async () => {
    const confirmed = await confirm({
      title: 'Revoke invite link?',
      message: `The current link for "${groupName}" will stop working immediately for everyone it was shared with.`,
      confirmLabel: 'Revoke link',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setActionError(null);
    try {
      await revokeLink.mutateAsync(groupId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not revoke the invite link.');
    }
  };

  const createdAt = link?.createdAt ? new Date(link.createdAt) : null;

  return (
    <section
      aria-label={`Invite link for ${groupName}`}
      className="rounded-xl border border-[#232938] bg-[var(--quant-surface)] p-3"
    >
      <p className="text-xs font-bold text-white">Invite link</p>
      <p className="mt-0.5 text-[11px] text-[var(--quant-muted-foreground)]">
        Anyone with this link can join {groupName}.
      </p>

      {isLoading && (
        <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">Loading invite link…</p>
      )}

      {!isLoading && error && (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-red-400">
            {error instanceof Error ? error.message : 'Could not load the invite link.'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--quant-muted-foreground)] hover:text-white transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && link && (
        <div className="mt-2 space-y-2">
          <p className="truncate rounded-lg bg-[var(--quant-background)] px-2.5 py-2 font-mono text-[11px] text-[var(--app-accent)]">
            {link.inviteUrl}
          </p>
          <p className="text-[11px] text-[var(--quant-muted-foreground)]">
            {createdAt && !Number.isNaN(createdAt.getTime())
              ? `Created ${createdAt.toLocaleString()} · stays active until revoked or regenerated`
              : 'Stays active until revoked or regenerated'}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyLink}
              className="min-h-[36px] rounded-lg bg-[var(--app-accent)] px-3 text-xs font-bold text-black hover:bg-[var(--app-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="min-h-[36px] rounded-lg border border-[#232938] bg-[var(--quant-surface-elevated)] px-3 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
            >
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={busy}
              className="min-h-[36px] rounded-lg border border-red-500/30 bg-[var(--quant-surface-elevated)] px-3 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Revoke
            </button>
          </div>
        </div>
      )}

      {!isLoading && !error && !link && (
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="mt-2 min-h-[36px] rounded-lg border border-[var(--app-accent)]/40 bg-[var(--app-accent)]/10 px-3 text-xs font-bold text-[var(--app-accent)] hover:bg-[var(--app-accent)]/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)]"
        >
          {busy ? 'Creating…' : 'Create invite link'}
        </button>
      )}

      {actionError && <p className="mt-2 text-xs text-red-400">{actionError}</p>}

      {dialog}
    </section>
  );
}
