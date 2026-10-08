// ============================================================================
// QuantDrive Document Editor — Share & Collaborator Modal
// Gate N-G5: Tenant isolation, granular permissions (Viewer / Editor / Admin)
// ============================================================================

import React, { useState } from 'react';
import { Button, Modal } from '@quant/shared-ui';
import { showToast } from '../../../../components/InboxToast';
import { apiClient } from '../../../../services/api-client';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  docId: string;
  docTitle: string;
  isPublic: boolean;
  onTogglePublic: (isPublic: boolean) => void;
  collaborators?: Array<{
    id?: string;
    email: string;
    role: string;
  }>;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  docId,
  docTitle,
  isPublic,
  onTogglePublic,
  collaborators = [],
}) => {
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor' | 'admin'>('editor');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Public share link state (Tasks N12 & D04)
  const [publicShareToken, setPublicShareToken] = useState<string>('');
  const [publicShareUrl, setPublicShareUrl] = useState<string>('');
  const [publicRole, setPublicRole] = useState<'view' | 'edit'>('view');
  const [expiresIn, setExpiresIn] = useState<'never' | '1d' | '7d' | '30d'>('7d');
  const [isGeneratingLink, setIsGeneratingLink] = useState<boolean>(false);
  const [isRevokingLink, setIsRevokingLink] = useState<boolean>(false);

  // Newly invited collaborators, shown immediately alongside the `collaborators`
  // prop (P0-4b: invite must add the collaborator visibly, or show a real error).
  const [addedCollaborators, setAddedCollaborators] = useState<
    Array<{ id?: string; email: string; role: string }>
  >([]);
  const visibleCollaborators = [...collaborators, ...addedCollaborators];

  const directDocUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/drive/doc/${docId}` : '';

  const handleCopyLink = async (urlToCopy: string) => {
    try {
      await navigator.clipboard.writeText(urlToCopy);
      showToast({ text: 'Link copied to clipboard', type: 'success', subject: 'share-link' });
    } catch {
      showToast({ text: 'Failed to copy link', type: 'error', subject: 'share-link' });
    }
  };

  const handleGeneratePublicLink = async () => {
    setIsGeneratingLink(true);
    try {
      let expiresAt: string | undefined = undefined;
      const now = Date.now();
      if (expiresIn === '1d') expiresAt = new Date(now + 86400000).toISOString();
      else if (expiresIn === '7d') expiresAt = new Date(now + 7 * 86400000).toISOString();
      else if (expiresIn === '30d') expiresAt = new Date(now + 30 * 86400000).toISOString();

      const res = await apiClient.createDocumentShareLink(docId, {
        role: publicRole,
        expiresAt,
      });

      // P0-4a fix: the server answers { data: { token, shareUrl, ... } } — the
      // old code read `res.data?.shareToken`, which never exists, so every
      // successful link creation was reported as "Server did not return a
      // share link". Read the real field, and surface real server errors
      // instead of masking them (apiClient returns success:false envelopes,
      // it does not throw on 4xx/5xx).
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to generate public share link');
      }

      const token = res.data?.token;
      const sharePath = res.data?.shareUrl;
      if (token) {
        const fullPublicUrl =
          sharePath && sharePath.startsWith('/')
            ? `${window.location.origin}${sharePath}`
            : `${window.location.origin}/documents/public/share/${token}`;
        setPublicShareToken(token);
        setPublicShareUrl(fullPublicUrl);
        showToast({ text: 'Public share link generated!', type: 'success', subject: 'share-link' });
      } else {
        // Never fail silently: the API responded without a share token.
        showToast({
          text: 'Server did not return a share link. Please try again.',
          type: 'error',
          subject: 'share-link',
        });
      }
    } catch (err: any) {
      showToast({
        text: err?.message || 'Failed to generate public share link',
        type: 'error',
        subject: 'share-link',
      });
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleRevokePublicLink = async () => {
    setIsRevokingLink(true);
    try {
      await apiClient.revokeDocumentShareLink(docId);
      setPublicShareToken('');
      setPublicShareUrl('');
      showToast({ text: 'Public share link revoked', type: 'success', subject: 'share-link' });
    } catch (err: any) {
      showToast({
        text: err?.message || 'Failed to revoke public share link',
        type: 'error',
        subject: 'share-link',
      });
    } finally {
      setIsRevokingLink(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) {
      showToast({
        text: 'Please enter a valid email address',
        type: 'error',
        subject: 'share-invite',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // P0-4b fix: this handler previously showed a fabricated "Invite sent"
      // toast without any network call. Now it calls the real invite endpoint
      // and reports the REAL outcome — success adds the collaborator visibly,
      // failure shows the server's actual error.
      const res = await apiClient.addDocumentCollaborator(docId, {
        email,
        role: inviteRole,
      });
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to send invite');
      }
      const added = {
        id: res.data?.id,
        email: res.data?.email || email,
        role: res.data?.role || inviteRole,
      };
      setAddedCollaborators((prev) =>
        prev
          .filter((c) => c.email.toLowerCase() !== email.toLowerCase())
          .concat([added]),
      );
      setInviteEmail('');
      showToast({
        text: `${added.email} added as ${added.role}`,
        type: 'success',
        subject: 'share-invite',
      });
    } catch (err: any) {
      // Never silent, never fabricated: show the real error.
      showToast({
        text: err?.message || 'Failed to send invite',
        type: 'error',
        subject: 'share-invite',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Share "${docTitle || 'Untitled Document'}"`}
      size="md"
    >
      <div className="space-y-6 pt-1">
        {/* Direct Workspace Link */}
        <div>
          <label htmlFor="share-direct-link" className="block text-xs font-semibold text-[#8B949E] mb-1.5">
            Workspace Direct Link
          </label>
          <div className="flex items-center gap-2">
            <input
              id="share-direct-link"
              type="text"
              readOnly
              value={directDocUrl}
              className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs font-mono text-[#C9D1D9] select-all focus:outline-none focus:border-[var(--quant-primary)]"
            />
            <Button
              variant="secondary"
              onClick={() => handleCopyLink(directDocUrl)}
              className="text-xs whitespace-nowrap"
            >
              Copy Link
            </Button>
          </div>
        </div>

        {/* Public Share Token Link (Tasks N12 & D04) */}
        <div className="p-4 rounded-xl border border-[#30363D] bg-[var(--quant-surface-elevated)] space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--quant-primary)]/10 border border-[var(--quant-primary)]/30 flex items-center justify-center text-[var(--quant-primary)]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </div>
              <div>
                <p className="text-xs font-semibold text-[#F0F6FC]">Public Share Link</p>
                <p className="text-[11px] text-[#8B949E]">
                  Share with anyone outside your workspace with role and expiration
                </p>
              </div>
            </div>
            {publicShareUrl && (
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-medium border border-[#238636] bg-[#238636]/10 text-[#3FB950]">
                Active
              </span>
            )}
          </div>

          {!publicShareUrl ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                aria-label="Public share permission"
                value={publicRole}
                onChange={(e) => setPublicRole(e.target.value as 'view' | 'edit')}
                className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-1.5 text-xs text-[#F0F6FC] focus:outline-none focus:border-[var(--quant-primary)]"
              >
                <option value="view">Can View</option>
                <option value="edit">Can Edit</option>
              </select>
              <select
                aria-label="Share link expiration"
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value as any)}
                className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-1.5 text-xs text-[#F0F6FC] focus:outline-none focus:border-[var(--quant-primary)]"
              >
                <option value="1d">Expires in 1 day</option>
                <option value="7d">Expires in 7 days</option>
                <option value="30d">Expires in 30 days</option>
                <option value="never">Never expires</option>
              </select>
              <Button
                variant="primary"
                onClick={handleGeneratePublicLink}
                disabled={isGeneratingLink}
                className="text-xs ml-auto"
              >
                {isGeneratingLink ? 'Creating...' : '+ Create Public Link'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  aria-label="Public share URL"
                  value={publicShareUrl}
                  className="flex-1 bg-[#0D1117] border border-[#238636]/50 rounded-xl px-3 py-2 text-xs font-mono text-[#3FB950] select-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                />
                <Button
                  variant="primary"
                  onClick={() => handleCopyLink(publicShareUrl)}
                  className="text-xs whitespace-nowrap"
                >
                  Copy Link
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRevokePublicLink}
                  disabled={isRevokingLink}
                  className="text-xs whitespace-nowrap"
                >
                  Revoke
                </Button>
              </div>
              <p className="text-[11px] text-[#8B949E]">
                Role: <span className="text-[#F0F6FC] capitalize">{publicRole}</span> • Expiration:{' '}
                <span className="text-[#F0F6FC]">{expiresIn === 'never' ? 'None' : expiresIn}</span>
              </p>
            </div>
          )}
        </div>

        {/* Invite collaborators */}
        <form onSubmit={handleSendInvite} className="space-y-3">
          <label className="block text-xs font-semibold text-[#8B949E]">Add Collaborators</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="teammate@quant.app"
              aria-label="Invite by email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-[#F0F6FC] placeholder-[#6E7681] focus:outline-none focus:border-[var(--quant-primary)]"
            />
            <select
              aria-label="Invite role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor' | 'admin')}
              className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-2 text-xs text-[#F0F6FC] focus:outline-none focus:border-[var(--quant-primary)]"
            >
              <option value="viewer">Can View</option>
              <option value="editor">Can Edit</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="primary"
              type="submit"
              disabled={isSubmitting || !inviteEmail.trim()}
              className="text-xs whitespace-nowrap"
            >
              Invite
            </Button>
          </div>
        </form>

        {/* Current Collaborators list */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[#8B949E]">Collaborators</label>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D1117] border border-[#21262D]">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-[var(--quant-primary)] text-[#0D1117] flex items-center justify-center text-[10px] font-bold">
                  Y
                </div>
                <div>
                  <p className="text-xs font-medium text-[#F0F6FC]">You (Owner)</p>
                  <p className="text-[10px] text-[#8B949E]">Current session</p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[var(--quant-primary)]">Owner</span>
            </div>

            {visibleCollaborators.map((c, i) => (
              <div
                key={c.id || i}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D1117] border border-[#21262D]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-[#58A6FF] text-[#0D1117] flex items-center justify-center text-[10px] font-bold">
                    {c.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#F0F6FC]">{c.email}</p>
                    <p className="text-[10px] text-[#8B949E] capitalize">{c.role}</p>
                  </div>
                </div>
                <span className="text-[11px] text-[#8B949E] capitalize">{c.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end pt-2 border-t border-[#30363D]">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
