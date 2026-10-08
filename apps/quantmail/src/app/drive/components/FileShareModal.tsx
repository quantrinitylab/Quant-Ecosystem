'use client';

// ============================================================================
// QuantDrive — File Share Modal
// Real sharing for Drive files: share with people by email + public links.
// Every action hits a real API; toasts reflect real outcomes only.
// ============================================================================

import React, { useState, useEffect } from 'react';
import { Button, Modal } from '@quant/shared-ui';
import { showToast } from '../../../components/InboxToast';
import { apiFetchRaw } from '@quant/api-client';
import { LinkShareDialog } from './LinkShareDialog';

interface FileShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
}

type SharePermission = 'view' | 'edit' | 'admin';

export const FileShareModal: React.FC<FileShareModalProps> = ({
  isOpen,
  onClose,
  fileId,
  fileName,
}) => {
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [invitePermission, setInvitePermission] = useState<SharePermission>('view');
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [sharedWith, setSharedWith] = useState<Array<{ email: string; permission: string }>>([]);

  // Reset state whenever a different file is opened
  useEffect(() => {
    if (isOpen) {
      setInviteEmail('');
      setInvitePermission('view');
      setSharedWith([]);
    }
  }, [isOpen, fileId]);

  const handleShareWithEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim();
    if (!email || !email.includes('@')) {
      showToast({
        text: 'Please enter a valid email address',
        type: 'error',
        subject: 'drive-share-email',
      });
      return;
    }
    setIsSharing(true);
    try {
      const res = await apiFetchRaw(`/api/drive/files/${encodeURIComponent(fileId)}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, permission: invitePermission }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to share file');
      }
      const shared = data?.share;
      setSharedWith((prev) => {
        const next = prev.filter((s) => s.email.toLowerCase() !== email.toLowerCase());
        next.push({ email: shared?.email || email, permission: shared?.permission || invitePermission });
        return next;
      });
      setInviteEmail('');
      showToast({
        text: `Shared "${fileName}" with ${email}`,
        type: 'success',
        subject: 'drive-share-email',
      });
    } catch (err: any) {
      showToast({
        text: err?.message || 'Failed to share file',
        type: 'error',
        subject: 'drive-share-email',
      });
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Share "${fileName}"`} size="md">
      <div className="space-y-6 pt-1">
        {/* Share with people by email */}
        <form onSubmit={handleShareWithEmail} className="space-y-3">
          <label className="block text-xs font-semibold text-[#8B949E]">Share with people</label>
          <div className="flex items-center gap-2">
            <input
              type="email"
              placeholder="teammate@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-[#F0F6FC] placeholder-[#6E7681] focus:outline-none focus:border-[#38BDF8]"
            />
            <select
              value={invitePermission}
              onChange={(e) => setInvitePermission(e.target.value as SharePermission)}
              className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-2 text-xs text-[#F0F6FC] focus:outline-none focus:border-[#38BDF8]"
              aria-label="Permission"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
              <option value="admin">Admin</option>
            </select>
            <Button
              variant="primary"
              type="submit"
              disabled={isSharing || !inviteEmail.trim()}
              className="text-xs whitespace-nowrap"
            >
              {isSharing ? 'Sharing…' : 'Share'}
            </Button>
          </div>
          {sharedWith.length > 0 && (
            <div className="space-y-1.5">
              {sharedWith.map((s) => (
                <div
                  key={s.email}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#0D1117] border border-[#21262D]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-[#38BDF8] text-[#0D1117] flex items-center justify-center text-[10px] font-bold">
                      {s.email[0].toUpperCase()}
                    </div>
                    <p className="text-xs font-medium text-[#F0F6FC]">{s.email}</p>
                  </div>
                  <span className="text-[11px] text-[#8B949E] capitalize">{s.permission}</span>
                </div>
              ))}
            </div>
          )}
        </form>

        {/* Link sharing — QM-M39-006 (screen 22): scope/audience/expiry dialog
            with authoritative confirmation. Replaces the old create-only
            public-link box, which claimed "Active" from local state. */}
        <LinkShareDialog fileId={fileId} fileName={fileName} />

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-[#30363D]">
          <Button variant="secondary" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
};
