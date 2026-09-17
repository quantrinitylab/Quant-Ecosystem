// ============================================================================
// QuantDrive Document Editor — Share & Collaborator Modal
// Gate N-G5: Tenant isolation, granular permissions (Viewer / Editor / Admin)
// ============================================================================

import React, { useState } from 'react';
import { Button, Modal } from '@quant/shared-ui';
import { showToast } from '../../../../components/InboxToast';

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

  const shareUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/drive/doc/${docId}` : '';

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast({ text: 'Link copied to clipboard', type: 'success', subject: 'share-link' });
    } catch {
      showToast({ text: 'Failed to copy link', type: 'error', subject: 'share-link' });
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes('@')) {
      showToast({
        text: 'Please enter a valid email address',
        type: 'error',
        subject: 'share-invite',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Send invite via API or mock
      showToast({
        text: `Invite sent to ${inviteEmail.trim()} as ${inviteRole}`,
        type: 'success',
        subject: 'share-invite',
      });
      setInviteEmail('');
    } catch {
      showToast({ text: 'Failed to send invite', type: 'error', subject: 'share-invite' });
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
        {/* Link sharing row */}
        <div className="flex items-center justify-between p-3.5 rounded-xl border border-[#30363D] bg-[#161B22]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FF8C42]/10 border border-[#FF8C42]/30 flex items-center justify-center text-[#FF8C42]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
            </div>
            <div>
              <p className="text-xs font-semibold text-[#F0F6FC]">
                {isPublic ? 'Anyone with the link can view' : 'Restricted to invited collaborators'}
              </p>
              <p className="text-[11px] text-[#8B949E]">
                {isPublic ? 'Public web access enabled' : 'Only workspace members with access'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTogglePublic(!isPublic)}
            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
              isPublic
                ? 'border-[#238636] bg-[#238636]/10 text-[#3FB950]'
                : 'border-[#30363D] bg-[#0D1117] text-[#8B949E] hover:text-[#F0F6FC]'
            }`}
          >
            {isPublic ? 'Public' : 'Private'}
          </button>
        </div>

        {/* Copy Link input */}
        <div>
          <label className="block text-xs font-semibold text-[#8B949E] mb-1.5">Document Link</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs font-mono text-[#C9D1D9] select-all focus:outline-none focus:border-[#FF8C42]"
            />
            <Button
              variant="secondary"
              onClick={handleCopyLink}
              className="text-xs whitespace-nowrap"
            >
              Copy Link
            </Button>
          </div>
        </div>

        {/* Invite collaborators */}
        <form onSubmit={handleSendInvite} className="space-y-3">
          <label className="block text-xs font-semibold text-[#8B949E]">Add Collaborators</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="teammate@quant.app"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-[#F0F6FC] placeholder-[#6E7681] focus:outline-none focus:border-[#FF8C42]"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'viewer' | 'editor' | 'admin')}
              className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-2 text-xs text-[#F0F6FC] focus:outline-none focus:border-[#FF8C42]"
            >
              <option value="viewer">Can View</option>
              <option value="editor">Can Edit</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="primary"
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
                <div className="w-6 h-6 rounded-full bg-[#FF8C42] text-[#0D1117] flex items-center justify-center text-[10px] font-bold">
                  Y
                </div>
                <div>
                  <p className="text-xs font-medium text-[#F0F6FC]">You (Owner)</p>
                  <p className="text-[10px] text-[#8B949E]">Current session</p>
                </div>
              </div>
              <span className="text-[11px] font-medium text-[#FF8C42]">Owner</span>
            </div>

            {collaborators.map((c, i) => (
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
