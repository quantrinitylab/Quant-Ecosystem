'use client';

// ============================================================================
// QuantDrive — Link Share Dialog (QM-M39-006, M39 screen 22)
// Full link sharing: scope (anyone / organization / specific people),
// audience, expiry date picker, permission (view/edit), and an authoritative
// confirmation step BEFORE anything is saved. Every state comes from the real
// backend — the dialog never claims a link exists before the server confirms
// it, and expired links are shown as expired, never as active.
// ============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@quant/shared-ui';
import { showToast } from '../../../components/InboxToast';
import {
  createDriveLink,
  fetchDriveLinks,
  revokeDriveLink,
  updateDriveLink,
  type DriveLinkEntry,
  type LinkFormValues,
  type LinkRole,
  type LinkScope,
} from './link-share-api';

interface LinkShareDialogProps {
  fileId: string;
  fileName: string;
}

type View = 'list' | 'form' | 'confirm';
type ConfirmKind = 'create' | 'update' | 'revoke';

const SCOPE_OPTIONS: Array<{ value: LinkScope; title: string; detail: string }> = [
  {
    value: 'anyone',
    title: 'Anyone with the link',
    detail: 'No sign-in needed. Anyone who has the URL can open it.',
  },
  {
    value: 'org',
    title: 'People in my organization',
    detail: 'Only signed-in members of an organization you belong to. Everyone else is blocked.',
  },
  {
    value: 'specific',
    title: 'Specific people',
    detail: 'Only the people you name, signed in to their Quant account.',
  },
];

function formatDate(iso: string | null): string {
  if (!iso) return 'No expiry';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'No expiry';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function expiryText(link: DriveLinkEntry): string {
  if (!link.expiresAt) return 'No expiry';
  return link.expired ? `Expired ${formatDate(link.expiresAt)}` : `Expires ${formatDate(link.expiresAt)}`;
}

function roleLabel(role: string): string {
  return role === 'editor' ? 'Can edit' : 'Can view';
}

function scopeTitle(scope: LinkScope): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.title ?? scope;
}

const inputClass =
  'bg-[#0D1117] border border-[#30363D] rounded-xl px-3 py-2 text-xs text-[#F0F6FC] placeholder-[#6E7681] focus:outline-none focus:border-[#38BDF8]';

export const LinkShareDialog: React.FC<LinkShareDialogProps> = ({ fileId, fileName }) => {
  const [links, setLinks] = useState<DriveLinkEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [editing, setEditing] = useState<DriveLinkEntry | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>('create');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state
  const [scope, setScope] = useState<LinkScope>('anyone');
  const [audienceEmails, setAudienceEmails] = useState<string[]>([]);
  const [audienceInput, setAudienceInput] = useState('');
  const [role, setRole] = useState<LinkRole>('viewer');
  const [noExpiry, setNoExpiry] = useState(true);
  const [expiresDate, setExpiresDate] = useState('');
  const [createdLink, setCreatedLink] = useState<DriveLinkEntry | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const loadLinks = useCallback(async () => {
    setLoadError(null);
    try {
      setLinks(await fetchDriveLinks(fileId));
    } catch (err: any) {
      setLinks([]);
      setLoadError(err?.message || 'Could not load share links');
    }
  }, [fileId]);

  useEffect(() => {
    setLinks(null);
    setView('list');
    setEditing(null);
    setCreatedLink(null);
    setFormError(null);
    loadLinks();
  }, [fileId, loadLinks]);

  const resetForm = (link?: DriveLinkEntry | null) => {
    setScope((link?.scope as LinkScope) ?? 'anyone');
    setAudienceEmails(link?.audienceEmails ?? []);
    setAudienceInput('');
    setRole(link?.role === 'editor' ? 'editor' : 'viewer');
    setNoExpiry(!link?.expiresAt);
    setExpiresDate(link?.expiresAt ? link.expiresAt.slice(0, 10) : '');
    setFormError(null);
    setCreatedLink(null);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm(null);
    setView('form');
  };

  const openEdit = (link: DriveLinkEntry) => {
    setEditing(link);
    resetForm(link);
    setView('form');
  };

  const addAudienceEmail = () => {
    const email = audienceInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError('Enter a valid email address');
      return;
    }
    if (audienceEmails.includes(email)) {
      setFormError('That person is already on the list');
      return;
    }
    setFormError(null);
    setAudienceEmails((prev) => [...prev, email]);
    setAudienceInput('');
  };

  const formValues = (): LinkFormValues => ({
    scope,
    audienceEmails,
    role,
    expiresDate: noExpiry ? null : expiresDate || null,
  });

  const validateForm = (): string | null => {
    if (scope === 'specific' && audienceEmails.length === 0)
      return 'Add at least one person for a specific-people link';
    if (!noExpiry && !expiresDate) return 'Pick an expiry date or choose “No expiry”';
    if (!noExpiry && expiresDate < today) return 'Expiry date must be today or later';
    return null;
  };

  const goToConfirm = (kind: ConfirmKind) => {
    const problem = kind === 'revoke' ? null : validateForm();
    if (problem) {
      setFormError(problem);
      return;
    }
    setFormError(null);
    setConfirmKind(kind);
    setView('confirm');
  };

  const handleConfirm = async () => {
    setBusy(true);
    setFormError(null);
    try {
      if (confirmKind === 'create') {
        const created = await createDriveLink(fileId, formValues());
        setCreatedLink(created);
        showToast({
          text: `Share link created for “${fileName}”`,
          type: 'success',
          subject: 'drive-share-link',
        });
      } else if (confirmKind === 'update' && editing) {
        await updateDriveLink(editing.id, formValues());
        showToast({
          text: `Share link updated for “${fileName}”`,
          type: 'success',
          subject: 'drive-share-link',
        });
      } else if (confirmKind === 'revoke' && editing) {
        await revokeDriveLink(editing.id);
        showToast({ text: 'Share link revoked', type: 'success', subject: 'drive-share-link' });
      }
      await loadLinks();
      setView('list');
      setEditing(null);
    } catch (err: any) {
      setFormError(err?.message || 'Something went wrong');
      setView(confirmKind === 'create' ? 'form' : 'list');
    } finally {
      setBusy(false);
    }
  };

  const handleCopyLink = async (shareUrl: string) => {
    const fullUrl =
      typeof window !== 'undefined' && shareUrl.startsWith('/')
        ? `${window.location.origin}${shareUrl}`
        : shareUrl;
    try {
      await navigator.clipboard.writeText(fullUrl);
      showToast({ text: 'Link copied to clipboard', type: 'success', subject: 'drive-share-link' });
    } catch {
      showToast({ text: 'Failed to copy link', type: 'error', subject: 'drive-share-link' });
    }
  };

  const summaryRows = (): Array<[string, string]> => {
    const values = formValues();
    const rows: Array<[string, string]> = [
      ['Who can open it', scopeTitle(values.scope)],
      [
        'Audience',
        values.scope === 'specific'
          ? values.audienceEmails.join(', ')
          : values.scope === 'org'
            ? 'Signed-in members of an organization you belong to'
            : 'Anyone who has the URL — no sign-in needed',
      ],
      ['Access', values.role === 'editor' ? 'Can edit' : 'Can view'],
      ['Link expires', values.expiresDate ? formatDate(values.expiresDate) : 'Never'],
    ];
    if (editing?.requiresPassword) rows.push(['Password', 'Password protected']);
    return rows;
  };

  const confirmCopy = (): { title: string; note: string; action: string } => {
    if (confirmKind === 'revoke')
      return {
        title: `Revoke this share link?`,
        note: 'The link stops working immediately for everyone. People you shared it with will lose access.',
        action: 'Revoke link',
      };
    if (confirmKind === 'update')
      return {
        title: `Save changes to this share link?`,
        note: 'The updated rules apply immediately to the existing link — no new URL is created.',
        action: 'Save changes',
      };
    return {
      title: `Create this share link?`,
      note: 'The link starts working the moment you confirm.',
      action: 'Create link',
    };
  };

  return (
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
          <p className="text-xs font-semibold text-[#F0F6FC]">Link sharing</p>
          <p className="text-[11px] text-[#8B949E]">Who can open this file with a link</p>
        </div>
        {view === 'list' && (
          <Button variant="primary" onClick={openCreate} className="text-xs ml-auto">
            + New link
          </Button>
        )}
      </div>

      {view === 'list' && (
        <>
          {links === null && !loadError && (
            <p className="text-xs text-[#8B949E] py-2">Loading share links…</p>
          )}
          {loadError && (
            <div className="space-y-2 py-1">
              <p className="text-xs text-[#FCA5A5]">Couldn’t load share links: {loadError}</p>
              <Button variant="secondary" onClick={loadLinks} className="text-xs">
                Retry
              </Button>
            </div>
          )}
          {links !== null && !loadError && links.length === 0 && (
            <p className="text-xs text-[#8B949E] py-2">
              No share links for this file yet. Create one to share it by link.
            </p>
          )}
          {links !== null && links.length > 0 && (
            <div className="space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="p-3 rounded-lg bg-[#0D1117] border border-[#21262D] space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-[#F0F6FC]">
                      {scopeTitle(link.scope as LinkScope)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                        link.expired
                          ? 'border-[#F85149]/50 bg-[#F85149]/10 text-[#F85149]'
                          : 'border-[#238636] bg-[#238636]/10 text-[#3FB950]'
                      }`}
                    >
                      {link.expired ? 'Expired' : 'Active'}
                    </span>
                    {link.requiresPassword && (
                      <span className="text-[10px] px-2 py-0.5 rounded font-medium border border-[#30363D] text-[#8B949E]">
                        Password
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-[#8B949E]">{roleLabel(link.role)}</span>
                  </div>
                  <p className="text-[11px] text-[#8B949E] truncate" title={link.audience}>
                    {link.audience}
                  </p>
                  <p className={`text-[11px] ${link.expired ? 'text-[#F85149]' : 'text-[#8B949E]'}`}>
                    {expiryText(link)}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    {!link.expired && (
                      <Button
                        variant="secondary"
                        onClick={() => handleCopyLink(link.shareUrl)}
                        className="text-xs"
                      >
                        Copy link
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => openEdit(link)} className="text-xs">
                      {link.expired ? 'Renew' : 'Edit'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditing(link);
                        goToConfirm('revoke');
                      }}
                      className="text-xs text-[#F85149]"
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {createdLink && (
            <div className="p-3 rounded-lg bg-[#0D1117] border border-[#238636]/50 space-y-2">
              <p className="text-xs font-medium text-[#3FB950]">Link created</p>
              <div className="flex items-center gap-2">
                <input
                  aria-label="New share URL"
                  type="text"
                  readOnly
                  value={
                    typeof window !== 'undefined' && createdLink.shareUrl.startsWith('/')
                      ? `${window.location.origin}${createdLink.shareUrl}`
                      : createdLink.shareUrl
                  }
                  className="flex-1 bg-[#0D1117] border border-[#238636]/50 rounded-xl px-3 py-2 text-xs font-mono text-[#3FB950] select-all focus:outline-none"
                />
                <Button
                  variant="primary"
                  onClick={() => handleCopyLink(createdLink.shareUrl)}
                  className="text-xs whitespace-nowrap"
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {view === 'form' && (
        <div className="space-y-4 pt-1">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#8B949E]">
              Who can open the link{editing ? ' (editing existing link)' : ''}
            </p>
            {SCOPE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                  scope === opt.value
                    ? 'border-[#38BDF8] bg-[#38BDF8]/5'
                    : 'border-[#21262D] bg-[#0D1117] hover:border-[#30363D]'
                }`}
              >
                <input
                  type="radio"
                  name="link-scope"
                  value={opt.value}
                  checked={scope === opt.value}
                  onChange={() => setScope(opt.value)}
                  className="mt-0.5 accent-[#38BDF8]"
                />
                <span>
                  <span className="block text-xs font-medium text-[#F0F6FC]">{opt.title}</span>
                  <span className="block text-[11px] text-[#8B949E] mt-0.5">{opt.detail}</span>
                </span>
              </label>
            ))}
          </div>

          {scope === 'specific' && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#8B949E]">
                People <span className="font-normal">(they need a Quant account)</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="email"
                  placeholder="teammate@example.com"
                  value={audienceInput}
                  onChange={(e) => setAudienceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addAudienceEmail();
                    }
                  }}
                  className={`${inputClass} flex-1`}
                  aria-label="Add a person by email"
                />
                <Button variant="secondary" onClick={addAudienceEmail} className="text-xs">
                  Add
                </Button>
              </div>
              {audienceEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {audienceEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-[#38BDF8]/10 border border-[#38BDF8]/30 text-[#F0F6FC]"
                    >
                      {email}
                      <button
                        type="button"
                        aria-label={`Remove ${email}`}
                        onClick={() =>
                          setAudienceEmails((prev) => prev.filter((e) => e !== email))
                        }
                        className="text-[#8B949E] hover:text-[#F85149]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#8B949E]" htmlFor="link-role">
                Permission
              </label>
              <select
                id="link-role"
                value={role}
                onChange={(e) => setRole(e.target.value as LinkRole)}
                className={`${inputClass} w-full`}
              >
                <option value="viewer">Can view</option>
                <option value="editor">Can edit</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-[#8B949E]">Expiry</span>
              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-1.5 text-xs text-[#F0F6FC] cursor-pointer">
                  <input
                    type="radio"
                    name="link-expiry"
                    checked={noExpiry}
                    onChange={() => setNoExpiry(true)}
                    className="accent-[#38BDF8]"
                  />
                  No expiry
                </label>
                <label className="flex items-center gap-1.5 text-xs text-[#F0F6FC] cursor-pointer">
                  <input
                    type="radio"
                    name="link-expiry"
                    checked={!noExpiry}
                    onChange={() => setNoExpiry(false)}
                    className="accent-[#38BDF8]"
                  />
                  On date
                </label>
              </div>
            </div>
          </div>

          {!noExpiry && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#8B949E]" htmlFor="link-expiry-date">
                Expiry date
              </label>
              <input
                id="link-expiry-date"
                type="date"
                min={today}
                value={expiresDate}
                onChange={(e) => setExpiresDate(e.target.value)}
                className={`${inputClass} w-full`}
              />
              <p className="text-[11px] text-[#8B949E]">
                The link stops working after this day. Expired links can be renewed later.
              </p>
            </div>
          )}

          {formError && <p className="text-xs text-[#FCA5A5]">{formError}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => {
                setView('list');
                setEditing(null);
                setFormError(null);
              }}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => goToConfirm(editing ? 'update' : 'create')}
              className="text-xs"
            >
              Review {editing ? 'changes' : 'link'}
            </Button>
          </div>
        </div>
      )}

      {view === 'confirm' && (
        <div className="space-y-3 pt-1">
          <p className="text-sm font-semibold text-[#F0F6FC]">{confirmCopy().title}</p>
          <div className="rounded-lg bg-[#0D1117] border border-[#21262D] divide-y divide-[#21262D]">
            {summaryRows().map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3 px-3 py-2">
                <span className="text-[11px] text-[#8B949E] shrink-0">{label}</span>
                <span className="text-xs text-[#F0F6FC] text-right break-words">{value}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#8B949E]">{confirmCopy().note}</p>
          <p className="text-[11px] text-[#8B949E]">
            {confirmKind === 'revoke'
              ? 'Nothing changes until you confirm.'
              : 'Nothing is saved until you confirm.'}
          </p>
          {formError && <p className="text-xs text-[#FCA5A5]">{formError}</p>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={() => setView(confirmKind === 'revoke' ? 'list' : 'form')}
              disabled={busy}
              className="text-xs"
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={busy}
              className={`text-xs ${confirmKind === 'revoke' ? '!bg-[#F85149] !border-[#F85149]' : ''}`}
            >
              {busy ? 'Working…' : confirmCopy().action}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
