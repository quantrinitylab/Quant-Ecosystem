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

  const [publicRole, setPublicRole] = useState<'viewer' | 'editor'>('viewer');
  const [expiresIn, setExpiresIn] = useState<'1' | '7' | '30' | 'never'>('7');
  const [publicShareUrl, setPublicShareUrl] = useState<string>('');
  const [isGeneratingLink, setIsGeneratingLink] = useState<boolean>(false);

  // Reset state whenever a different file is opened
  useEffect(() => {
    if (isOpen) {
      setInviteEmail('');
      setInvitePermission('view');
      setSharedWith([]);
      setPublicRole('viewer');
      setExpiresIn('7');
      setPublicShareUrl('');
    }
  }, [isOpen, fileId]);

  const handleCopyLink = async (urlToCopy: string) => {
    try {
      await navigator.clipboard.writeText(urlToCopy);
      showToast({ text: 'Link copied to clipboard', type: 'success', subject: 'drive-share-link' });
    } catch {
      showToast({ text: 'Failed to copy link', type: 'error', subject: 'drive-share-link' });
    }
  };

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

  const handleGeneratePublicLink = async () => {
    setIsGeneratingLink(true);
    try {
      const body: { fileId: string; role: 'viewer' | 'editor'; expiresInDays?: number } = {
        fileId,
        role: publicRole,
      };
      if (expiresIn !== 'never') body.expiresInDays = parseInt(expiresIn, 10);

      const res = await apiFetchRaw('/api/drive/shares/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to create public link');
      }
      const share = data?.share;
      if (share?.shareUrl) {
        const fullUrl =
          typeof window !== 'undefined' && share.shareUrl.startsWith('/')
            ? `${window.location.origin}${share.shareUrl}`
            : share.shareUrl;
        setPublicShareUrl(fullUrl);
        showToast({
          text: 'Public share link created',
          type: 'success',
          subject: 'drive-share-link',
        });
      } else {
        throw new Error('Server did not return a share link');
      }
    } catch (err: any) {
      showToast({
        text: err?.message || 'Failed to create public link',
        type: 'error',
        subject: 'drive-share-link',
      });
    } finally {
      setIsGeneratingLink(false);
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

        {/* Public share link */}
        <div className="p-4 rounded-xl border border-[#30363D] bg-[#161B22] space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/30 flex items-center justify-center text-[#38BDF8]">
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
              <p className="text-xs font-semibold text-[#F0F6FC]">Public Link</p>
              <p className="text-[11px] text-[#8B949E]">
                Anyone with the link can access this file
              </p>
            </div>
            {publicShareUrl && (
              <span className="ml-auto text-[10px] px-2 py-0.5 rounded font-mono font-medium border border-[#238636] bg-[#238636]/10 text-[#3FB950]">
                Active
              </span>
            )}
          </div>

          {!publicShareUrl ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={publicRole}
                onChange={(e) => setPublicRole(e.target.value as 'viewer' | 'editor')}
                className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-1.5 text-xs text-[#F0F6FC] focus:outline-none focus:border-[#38BDF8]"
                aria-label="Link role"
              >
                <option value="viewer">Can view</option>
                <option value="editor">Can edit</option>
              </select>
              <select
                value={expiresIn}
                onChange={(e) => setExpiresIn(e.target.value as '1' | '7' | '30' | 'never')}
                className="bg-[#0D1117] border border-[#30363D] rounded-xl px-2.5 py-1.5 text-xs text-[#F0F6FC] focus:outline-none focus:border-[#38BDF8]"
                aria-label="Link expiration"
              >
                <option value="1">Expires in 1 day</option>
                <option value="7">Expires in 7 days</option>
                <option value="30">Expires in 30 days</option>
                <option value="never">Never expires</option>
              </select>
              <Button
                variant="primary"
                onClick={handleGeneratePublicLink}
                disabled={isGeneratingLink}
                className="text-xs ml-auto"
              >
                {isGeneratingLink ? 'Creating…' : '+ Create Link'}
              </Button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicShareUrl}
                  className="flex-1 bg-[#0D1117] border border-[#238636]/50 rounded-xl px-3 py-2 text-xs font-mono text-[#3FB950] select-all focus:outline-none"
                />
                <Button
                  variant="primary"
                  onClick={() => handleCopyLink(publicShareUrl)}
                  className="text-xs whitespace-nowrap"
                >
                  Copy Link
                </Button>
              </div>
            </div>
          )}
        </div>

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
