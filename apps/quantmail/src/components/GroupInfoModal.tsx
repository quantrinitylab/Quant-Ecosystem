'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import type { Contact, ContactGroup, Email, EmailAttachment, GroupInviteLink } from '../types';
import { apiClient } from '../services/api-client';
import { useConfirm } from '../hooks/useConfirm';
import { useOptionalAuth } from '../providers/auth-provider';
import {
  contactNameAccountKey,
  ensureContactNamesNamespaceV2,
  getContactName,
  saveContactName,
  windowContactNameStorage,
} from '../lib/contactNameCache';
import {
  useCreateGroupInviteLink,
  useDemoteGroupAdmin,
  useGroupInviteLink,
  usePromoteGroupAdmin,
  useRemoveGroupMember,
  useRevokeGroupInviteLink,
} from '../hooks/useContactGroups';

type Tab = 'members' | 'media' | 'files' | 'links';
type SharedAttachment = { attachment: EmailAttachment; sender: string; date: Date };
type SharedLink = { id: string; url: string; label: string; sender: string; date: Date };

const URL_PATTERN = /https?:\/\/[^\s<>"')\]}]+/gi;
const normalize = (value?: string) => (value ?? '').trim().toLowerCase();
const displayName = (email: string) => {
  const local = normalize(email)
    .split('@')[0]
    .replace(/\d+/g, '')
    .replace(/[._-]+/g, ' ')
    .trim();
  const first = local.split(/\s+/).filter(Boolean)[0] || 'Contact';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};
const initials = (value: string) =>
  value
    .replace(/[@._\-\d]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || '?';
const dateLabel = (date: Date) =>
  date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const bytes = (size: number) =>
  size < 1024
    ? `${size} B`
    : size < 1024 ** 2
      ? `${(size / 1024).toFixed(1)} KB`
      : `${(size / 1024 ** 2).toFixed(1)} MB`;
const safeOpen = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    }
  } catch {
    /* ignore malformed URLs */
  }
};

function inspect(messages: Email[]) {
  const media: SharedAttachment[] = [];
  const files: SharedAttachment[] = [];
  const links: SharedLink[] = [];
  const seenLinks = new Set<string>();
  for (const message of messages) {
    const sender = message.from?.name || displayName(message.from?.email || '');
    const date = new Date(message.receivedAt || message.createdAt);
    for (const attachment of message.attachments ?? []) {
      const item = { attachment, sender, date };
      if (/^(image|video)\//i.test(attachment.mimeType)) media.push(item);
      else if (!attachment.isInline) files.push(item);
    }
    for (const raw of (message.bodyText || '').match(URL_PATTERN) ?? []) {
      const cleaned = raw.replace(/[.,!?;:]+$/, '');
      if (seenLinks.has(cleaned)) continue;
      try {
        const parsed = new URL(cleaned);
        if (!['http:', 'https:'].includes(parsed.protocol)) continue;
        seenLinks.add(cleaned);
        links.push({
          id: `${message.id}:${cleaned}`,
          url: cleaned,
          label: `${parsed.hostname}${parsed.pathname === '/' ? '' : parsed.pathname}`,
          sender,
          date,
        });
      } catch {
        /* ignore malformed URLs */
      }
    }
  }
  return { media, files, links };
}

interface InspectorProps {
  open: boolean;
  title: string;
  subtitle: string;
  accent: string;
  avatarLabel: string;
  messages: Email[];
  members?: string[];
  currentUserEmail?: string;
  onClose: () => void;
  onEdit?: () => void;
  onAddMembers?: () => void;
  contactEmail?: string;
  onSaveContactName?: (name: string) => void;
  /**
   * Optional action row under the header subtitle — the mail view's contact
   * card (ContactProfileInspector) renders its Add to Contacts / Edit Contact
   * action here. Groups never pass it, so group headers are unchanged.
   */
  headerAction?: ReactNode;
  /** Present only for groups: admin roles, member removal and invite links. */
  management?: GroupMemberManagement;
}

/**
 * Everything the Members tab needs to manage a group, bundled into one prop
 * so the Inspector signature stays readable. All actions are owner-gated
 * server-side — the owner is the group's implicit admin — so these controls
 * only ever render for the owner.
 */
export interface GroupMemberManagement {
  /** Member addresses promoted to admin (always a subset of members). */
  adminEmails: string[];
  /** Address of the member currently being promoted/demoted/removed, if any. */
  busyEmail: string | null;
  /** Last management failure, shown above the list. Never a placeholder. */
  error: string | null;
  onPromote: (email: string) => void;
  onDemote: (email: string) => void;
  onRemove: (email: string) => void;
  /** The active join link, or null while none exists. */
  inviteLink: GroupInviteLink | null;
  inviteLinkLoading: boolean;
  inviteLinkBusy: boolean;
  onCreateInviteLink: () => void;
  onRevokeInviteLink: () => void;
}

function MembersTab({
  members,
  currentUserEmail,
  accent,
  management,
  onAddMembers,
  onEdit,
}: {
  members: string[];
  currentUserEmail?: string;
  accent: string;
  management?: GroupMemberManagement;
  onAddMembers?: () => void;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = async () => {
    const url = management?.inviteLink?.inviteUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the URL is still visible to copy by hand */
    }
  };

  return (
    <div className="space-y-2">
      {(onAddMembers || onEdit) && (
        <button
          type="button"
          onClick={() => {
            if (onAddMembers) onAddMembers();
            else if (onEdit) onEdit();
          }}
          className="mb-2 min-h-[48px] w-full rounded-xl border border-dashed border-[var(--quant-primary)]/40 bg-[var(--quant-surface)] text-sm font-semibold text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/10 hover:border-[var(--quant-primary)]/60 hover:shadow-[0_0_14px_rgba(255,140,66,0.1)] transition-all"
        >
          + Add or edit members
        </button>
      )}

      {management && (
        <div className="mb-2 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] p-3">
          <p className="text-xs font-bold text-white">Invite link</p>
          <p className="mt-0.5 text-[11px] text-[var(--quant-muted-foreground)]">
            Anyone with the link can join this group.
          </p>
          {management.inviteLinkLoading ? (
            <p className="mt-2 text-xs text-[var(--quant-muted-foreground)]">Loading invite link…</p>
          ) : management.inviteLink ? (
            <div className="mt-2 space-y-2">
              <p className="truncate rounded-lg bg-[var(--quant-background)] px-2.5 py-2 font-mono text-[11px] text-[var(--quant-primary)]">
                {management.inviteLink.inviteUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyInviteLink}
                  className="min-h-[36px] rounded-lg bg-[var(--quant-primary)] px-3 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--quant-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={management.onCreateInviteLink}
                  disabled={management.inviteLinkBusy}
                  className="min-h-[36px] rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-3 text-xs font-semibold text-[var(--quant-muted-foreground)] hover:text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={management.onRevokeInviteLink}
                  disabled={management.inviteLinkBusy}
                  className="min-h-[36px] rounded-lg border border-red-500/30 bg-[var(--quant-surface-elevated)] px-3 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                >
                  Revoke
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={management.onCreateInviteLink}
              disabled={management.inviteLinkBusy}
              className="mt-2 min-h-[36px] rounded-lg border border-[var(--quant-primary)]/40 bg-[var(--quant-primary)]/10 px-3 text-xs font-bold text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
            >
              Create invite link
            </button>
          )}
        </div>
      )}

      {management?.error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {management.error}
        </p>
      )}

      <ul className="space-y-2">
        {members.map((email) => {
          const isSelf = normalize(email) === normalize(currentUserEmail);
          const isAdmin =
            isSelf || management?.adminEmails.some((a) => normalize(a) === normalize(email));
          const busy = management?.busyEmail === email;
          return (
            <li key={email} className="rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] px-3 py-2">
              <div className="flex min-h-[48px] items-center gap-3">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[var(--quant-background)]"
                  style={{ backgroundColor: accent }}
                >
                  {initials(email)}
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-white">
                    {isSelf ? 'You' : displayName(email)}
                  </strong>
                  <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">{email}</span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${
                    isSelf
                      ? 'bg-[var(--quant-primary)]/15 text-[var(--quant-primary)]'
                      : isAdmin
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-[var(--quant-surface-elevated)] text-[var(--quant-muted-foreground)]'
                  }`}
                >
                  {isSelf ? 'Owner' : isAdmin ? 'Admin' : 'Member'}
                </span>
              </div>
              {management && !isSelf && (
                <div className="mt-1 flex items-center gap-2 border-t border-[var(--quant-surface-elevated)]/60 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      isAdmin ? management.onDemote(email) : management.onPromote(email)
                    }
                    disabled={busy}
                    className="min-h-[32px] rounded-lg px-2 text-[11px] font-semibold text-[var(--quant-primary)] hover:bg-[var(--quant-primary)]/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                  >
                    {isAdmin ? 'Remove admin' : 'Make admin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => management.onRemove(email)}
                    disabled={busy}
                    className="min-h-[32px] rounded-lg px-2 text-[11px] font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    Remove
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Inspector({
  open,
  title,
  subtitle,
  accent,
  avatarLabel,
  messages,
  members,
  currentUserEmail,
  onClose,
  onEdit,
  onAddMembers,
  contactEmail,
  onSaveContactName,
  headerAction,
  management,
}: InspectorProps) {
  const id = useId();
  const [tab, setTab] = useState<Tab>(members ? 'members' : 'media');
  const [isEditingContactName, setIsEditingContactName] = useState(false);
  const [contactNameInput, setContactNameInput] = useState(title);
  const panelRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose });
  const shared = useMemo(() => inspect(messages), [messages]);

  useEffect(() => {
    setContactNameInput(title);
  }, [title]);

  if (!open) return null;
  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    ...(members ? [{ key: 'members' as const, label: 'Members', count: members.length }] : []),
    { key: 'media', label: 'Media', count: shared.media.length },
    { key: 'files', label: 'Files', count: shared.files.length },
    { key: 'links', label: 'Links', count: shared.links.length },
  ];
  return (
    <div
      className="fixed inset-0 z-[75] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-background)] shadow-[0_24px_80px_rgba(0,0,0,.75)] sm:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] p-4 sm:p-5">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="group relative flex size-14 shrink-0 items-center justify-center rounded-full text-base font-black text-[var(--quant-background)] transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
              style={{ backgroundColor: accent }}
              title="Change group photo or color"
              aria-label="Change group photo or color"
            >
              {initials(avatarLabel)}
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <svg
                  className="size-5 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </span>
            </button>
          ) : (
            <div
              className="flex size-14 shrink-0 items-center justify-center rounded-full text-base font-black text-[var(--quant-background)]"
              style={{ backgroundColor: accent }}
            >
              {initials(avatarLabel)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            {!isEditingContactName ? (
              <div className="flex items-center gap-2">
                <h2 id={`${id}-title`} className="truncate text-lg font-bold text-white">
                  {title}
                </h2>
                {!members && contactEmail && (
                  <button
                    type="button"
                    onClick={() => {
                      setContactNameInput(title);
                      setIsEditingContactName(true);
                    }}
                    className="rounded p-1 text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-[var(--quant-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                    title="Edit contact nickname"
                    aria-label="Edit contact nickname"
                  >
                    <svg
                      className="size-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (contactNameInput.trim()) {
                    onSaveContactName?.(contactNameInput.trim());
                    setIsEditingContactName(false);
                  }
                }}
                className="flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={contactNameInput}
                  onChange={(e) => setContactNameInput(e.target.value)}
                  placeholder="Enter friendly name"
                  autoFocus
                  className="min-h-[36px] rounded-lg border border-[var(--quant-primary)] bg-[var(--quant-background)] px-2.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                />
                <button
                  type="submit"
                  className="min-h-[36px] rounded-lg bg-[var(--quant-primary)] px-3 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--quant-primary-hover)]"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingContactName(false)}
                  className="min-h-[36px] rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-2.5 text-xs text-[var(--quant-muted-foreground)] hover:text-white"
                >
                  Cancel
                </button>
              </form>
            )}
            <p className="truncate text-xs text-[var(--quant-muted-foreground)]">{subtitle}</p>
            {headerAction ? <div className="mt-2 flex flex-wrap items-center gap-2">{headerAction}</div> : null}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="mt-1 min-h-[44px] text-xs font-bold text-[var(--quant-primary)] hover:text-[var(--quant-primary-hover)]"
              >
                Edit group
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="flex size-11 items-center justify-center rounded-xl text-[var(--quant-muted-foreground)] hover:bg-[var(--quant-surface-elevated)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            ✕
          </button>
        </header>
        <div
          role="tablist"
          aria-label="Shared information"
          className="grid border-b border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`min-h-[52px] border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--quant-primary)] ${
                tab === item.key
                  ? 'border-[var(--quant-primary)] text-[var(--quant-primary)]'
                  : 'border-transparent text-[var(--quant-muted-foreground)] hover:text-white'
              }`}
            >
              {item.label} <span className="ml-1 text-[10px]">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === 'members' && members && (
            <MembersTab
              members={members}
              currentUserEmail={currentUserEmail}
              accent={accent}
              management={management}
              onAddMembers={onAddMembers}
              onEdit={onEdit}
            />
          )}
          {tab === 'media' &&
            (shared.media.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shared.media.map(({ attachment, sender, date }) => (
                  <li
                    key={attachment.id}
                    className="overflow-hidden rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)]"
                  >
                    <button
                      type="button"
                      onClick={() => safeOpen(attachment.url)}
                      className="aspect-square w-full bg-[var(--quant-surface-elevated)] focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
                    >
                      {attachment.mimeType.startsWith('image/') ? (
                        <img
                          src={attachment.url}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className="size-full object-cover"
                        />
                      ) : (
                        <video
                          src={attachment.url}
                          muted
                          preload="metadata"
                          className="size-full object-cover"
                        />
                      )}
                    </button>
                    <p className="truncate px-2 pt-2 text-xs font-semibold text-white">
                      {attachment.filename}
                    </p>
                    <p className="truncate px-2 pb-2 text-[10px] text-[var(--quant-muted-foreground)]">
                      {sender} · {dateLabel(date)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No shared media" />
            ))}
          {tab === 'files' &&
            (shared.files.length ? (
              <ul className="space-y-2">
                {shared.files.map(({ attachment, sender, date }) => (
                  <li key={attachment.id}>
                    <button
                      type="button"
                      onClick={() => safeOpen(attachment.url)}
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] p-3 text-left hover:bg-[var(--quant-surface-elevated)]"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[var(--quant-primary)]/12 border border-[var(--quant-primary)]/30 text-[10px] font-black text-[var(--quant-primary)] shadow-[0_0_10px_rgba(255,140,66,0.12)]">
                        FILE
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-white">
                          {attachment.filename}
                        </strong>
                        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                          {bytes(attachment.size)} · {sender} · {dateLabel(date)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No shared files" />
            ))}
          {tab === 'links' &&
            (shared.links.length ? (
              <ul className="space-y-2">
                {shared.links.map((link) => (
                  <li key={link.id}>
                    <button
                      type="button"
                      onClick={() => safeOpen(link.url)}
                      className="flex min-h-[64px] w-full items-center rounded-xl border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)] p-3 text-left hover:bg-[var(--quant-surface-elevated)]"
                    >
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-white">{link.label}</strong>
                        <span className="block truncate text-xs text-[var(--quant-muted-foreground)]">
                          {link.sender} · {dateLabel(link.date)}
                        </span>
                      </span>
                      <span className="text-[var(--quant-primary)]">↗</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty text="No shared links" />
            ))}
        </div>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-[var(--quant-surface-elevated)] bg-[var(--quant-surface)]/50 text-sm text-[var(--quant-muted-foreground)]">
      {text}
    </div>
  );
}

export interface GroupInfoModalProps {
  open: boolean;
  group: ContactGroup;
  messages: Email[];
  currentUserEmail?: string;
  onClose: () => void;
  onEditGroup: () => void;
  onAddMembers?: () => void;
}

export function GroupInfoModal(props: GroupInfoModalProps) {
  const promoteAdmin = usePromoteGroupAdmin();
  const demoteAdmin = useDemoteGroupAdmin();
  const removeMember = useRemoveGroupMember();
  const createInviteLink = useCreateGroupInviteLink();
  const revokeInviteLink = useRevokeGroupInviteLink();
  const { confirm, dialog } = useConfirm();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [managementError, setManagementError] = useState<string | null>(null);
  const inviteQuery = useGroupInviteLink(props.open ? props.group.id : undefined, props.open);

  const fail = (error: unknown, fallback: string) => {
    setManagementError(error instanceof Error ? error.message : fallback);
  };

  const runMemberAction = async (
    email: string,
    action: (args: { id: string; email: string }) => Promise<unknown>,
    fallback: string,
  ) => {
    setBusyEmail(email);
    setManagementError(null);
    try {
      await action({ id: props.group.id, email });
    } catch (error) {
      fail(error, fallback);
    } finally {
      setBusyEmail(null);
    }
  };

  const handleRemoveMember = async (email: string) => {
    const confirmed = await confirm({
      title: 'Remove member?',
      message: `${email} will be removed from "${props.group.name}".`,
      confirmLabel: 'Remove',
      variant: 'destructive',
    });
    if (!confirmed) return;
    await runMemberAction(
      email,
      (args) => removeMember.mutateAsync(args),
      'Could not remove the member.',
    );
  };

  const handleCreateInviteLink = async () => {
    setManagementError(null);
    try {
      await createInviteLink.mutateAsync(props.group.id);
    } catch (error) {
      fail(error, 'Could not create the invite link.');
    }
  };

  const handleRevokeInviteLink = async () => {
    const confirmed = await confirm({
      title: 'Revoke invite link?',
      message: 'The current link will stop working immediately for everyone it was shared with.',
      confirmLabel: 'Revoke link',
      variant: 'destructive',
    });
    if (!confirmed) return;
    setManagementError(null);
    try {
      await revokeInviteLink.mutateAsync(props.group.id);
    } catch (error) {
      fail(error, 'Could not revoke the invite link.');
    }
  };

  const management: GroupMemberManagement = {
    adminEmails: props.group.adminEmails ?? [],
    busyEmail,
    error: managementError,
    onPromote: (email) =>
      void runMemberAction(
        email,
        (args) => promoteAdmin.mutateAsync(args),
        'Could not promote the member.',
      ),
    onDemote: (email) =>
      void runMemberAction(
        email,
        (args) => demoteAdmin.mutateAsync(args),
        'Could not demote the admin.',
      ),
    onRemove: (email) => void handleRemoveMember(email),
    inviteLink: inviteQuery.data ?? null,
    inviteLinkLoading: inviteQuery.isLoading,
    inviteLinkBusy: createInviteLink.isPending || revokeInviteLink.isPending,
    onCreateInviteLink: () => void handleCreateInviteLink(),
    onRevokeInviteLink: () => void handleRevokeInviteLink(),
  };

  return (
    <>
      <Inspector
        open={props.open}
        title={props.group.name}
        subtitle={`${props.group.emails.length} ${
          props.group.emails.length === 1 ? 'member' : 'members'
        }`}
        accent={props.group.color ?? 'var(--quant-primary)'}
        avatarLabel={props.group.name}
        messages={props.messages}
        members={props.group.emails}
        currentUserEmail={props.currentUserEmail}
        onClose={props.onClose}
        onEdit={props.onEditGroup}
        onAddMembers={props.onAddMembers}
        management={management}
      />
      {dialog}
    </>
  );
}

/**
 * Exact-email match over a contact search result. The backend search is a
 * substring match over name/email, so a query for `ada@x.com` also returns
 * `adana@x.com` and name matches — only a case-insensitive email equality
 * proves this sender is already a saved contact, and only that may flip the
 * card from "Add to Contacts" to "Edit Contact".
 */
export function findContactByEmail(
  contacts: Array<Pick<Contact, 'email'>> | undefined,
  email: string,
): boolean {
  const wanted = email.trim().toLowerCase();
  if (!wanted) return false;
  return (contacts ?? []).some((contact) => contact.email?.trim().toLowerCase() === wanted);
}

/**
 * Normalized email equality for keying a lookup/create to one sender.
 * Case and surrounding whitespace never distinguish two addresses, but a
 * create started for one address must never reconcile into the card for a
 * DIFFERENT address after the card's email prop changes.
 */
export function isSameContactEmail(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  return Boolean(left) && left === right;
}

export type ContactLookupResult =
  | { status: 'saved'; savedContactId: string }
  | { status: 'unsaved'; savedContactId: null }
  | { status: 'unknown'; savedContactId: null };

/**
 * Success-checked interpretation of a searchContacts envelope. The lookup
 * MUST check `res.success`: the api client returns error envelopes (401 /
 * 403 / 5xx / timeout) instead of throwing, so an unchecked lookup reads a
 * failed response's empty `data` as "not saved" and renders "Add to
 * Contacts" for a sender who may already be saved. A failed envelope — or a
 * throw, handled by the caller — is `unknown`, never `unsaved`: the card
 * must say it could not check, not offer Add as if the answer were known.
 */
export function resolveContactLookup(
  res: { success: boolean; data?: Array<Pick<Contact, 'id' | 'email'>> | null } | null | undefined,
  email: string,
): ContactLookupResult {
  if (!res || !res.success) return { status: 'unknown', savedContactId: null };
  const match = (res.data ?? []).find(
    (contact) => contact.email?.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  return match ? { status: 'saved', savedContactId: match.id } : { status: 'unsaved', savedContactId: null };
}

export interface ContactCardActionProps {
  /** Id of the already-saved contact, or null when the sender is not one yet. */
  savedContactId: string | null;
  /** A create is in flight — the button disables instead of double-submitting. */
  saving: boolean;
  /** Honest failure text from the last create attempt, or null. */
  error: string | null;
  onAdd: () => void;
  /**
   * The saved-state lookup failed (401 / 403 / 5xx / timeout / throw), so
   * the card does NOT know whether the sender is saved. When true the card
   * renders an honest unknown state — never "Add to Contacts", which would
   * assert "not saved" on no evidence.
   */
  lookupFailed?: boolean;
  /** Re-runs the saved-state lookup after an unknown state, if provided. */
  onRetryLookup?: () => void;
}

/**
 * The mail view's contact-card action, Gmail parity: "Add to Contacts" for an
 * unknown sender, "Edit Contact" (deep link to the contact's detail sheet,
 * where editing lives) once they are saved. Purely presentational — the
 * inspector owns the lookup and the create — so it renders under
 * renderToStaticMarkup without an auth or router provider.
 */
export function ContactCardAction({
  savedContactId,
  saving,
  error,
  onAdd,
  lookupFailed,
  onRetryLookup,
}: ContactCardActionProps) {
  if (lookupFailed && !savedContactId) {
    return (
      <>
        <span role="alert" className="text-xs font-semibold text-amber-300">
          Couldn&apos;t check whether this sender is already saved.
        </span>
        {onRetryLookup ? (
          <button
            type="button"
            onClick={onRetryLookup}
            className="min-h-[36px] rounded-lg border border-[var(--quant-surface-elevated)] bg-[var(--quant-surface-elevated)] px-3 py-2 text-xs font-bold text-white hover:bg-[var(--quant-primary)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
          >
            Try again
          </button>
        ) : null}
      </>
    );
  }
  if (savedContactId) {
    return (
      <>
        <span className="text-xs font-bold text-[var(--quant-muted-foreground)]">
          ✓ Saved to Contacts
        </span>
        <a
          href={`/contacts?contact=${encodeURIComponent(savedContactId)}`}
          className="min-h-[36px] rounded-lg bg-[var(--quant-primary)] px-3 py-2 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--quant-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)]"
        >
          Edit Contact
        </a>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onAdd}
        disabled={saving}
        className="min-h-[36px] rounded-lg bg-[var(--quant-primary)] px-3 py-2 text-xs font-bold text-[var(--quant-background)] hover:bg-[var(--quant-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--quant-primary)] disabled:cursor-wait disabled:opacity-60"
      >
        {saving ? 'Adding…' : 'Add to Contacts'}
      </button>
      {error ? (
        <span role="alert" className="text-xs font-semibold text-red-400">
          {error}
        </span>
      ) : null}
    </>
  );
}

export interface ContactProfileInspectorProps {
  open: boolean;
  email: string;
  name?: string;
  messages: Email[];
  onClose: () => void;
  onSaveContactName?: (name: string) => void;
}

export function ContactProfileInspector({
  open,
  email,
  name,
  messages,
  onClose,
  onSaveContactName,
}: ContactProfileInspectorProps) {
  // qm-contact-names-scope (P1): user-renamed contact names are
  // account-scoped by the backend-verified immutable user id
  // (lib/contactNameCache). An unknown account fails closed (no
  // persistence, never the old shared key); the retired unscoped legacy key
  // is purged rather than migrated. useOptionalAuth: tests can render this
  // inspector outside an AuthProvider — there it falls back to the
  // passed-in/prop name.
  const authUserId = useOptionalAuth()?.user?.id;
  const accountKey = contactNameAccountKey(authUserId);

  const [localName, setLocalName] = useState(() => name?.trim() || displayName(email));

  useEffect(() => {
    const store = windowContactNameStorage();
    if (accountKey) ensureContactNamesNamespaceV2(store);
    const saved = getContactName(store, accountKey, email);
    setLocalName(saved || name?.trim() || displayName(email));
  }, [accountKey, email, name]);

  const handleSave = (newName: string) => {
    setLocalName(newName);
    if (saveContactName(windowContactNameStorage(), accountKey, email, newName)) {
      window.dispatchEvent(new Event('storage'));
    }
    onSaveContactName?.(newName);
  };

  // Add-to-Contacts (P2 competitor gap): the mail view's contact card is the
  // one-click place a new sender becomes a contact, Gmail-style. Lookup runs
  // only while the card is open.
  //
  // Honesty + keying rules (CODEX corrective, PR #1562):
  // - The lookup MUST check res.success. A failed envelope (401 / 403 / 5xx /
  //   timeout) or a throw is an UNKNOWN saved state, rendered as such — never
  //   "Add to Contacts", which would assert "not saved" on no evidence.
  // - Every create / 409 reconciliation is keyed to the email it was started
  //   for AND to a sequence token. The inspector stays mounted while the
  //   thread view switches senders, so the email prop can change mid-flight:
  //   the lookup effect bumps the sequence on every email change, and a
  //   superseded create's settlement (success, 409 re-search, or error) is
  //   discarded — A's savedContactId can never land in B's card, and a
  //   stale finally can never clear a newer create's "Adding…" state.
  // - A 409 re-resolves via a success-checked lookup for the REQUESTED email
  //   only, and applies only while that email is still the card's email.
  const [savedContactId, setSavedContactId] = useState<string | null>(null);
  // Start true so the first open never flashes "Add to Contacts" for a sender
  // who is already saved — the lookup below is what clears it.
  const [checkingContact, setCheckingContact] = useState(true);
  const [savingContact, setSavingContact] = useState(false);
  const [saveContactError, setSaveContactError] = useState<string | null>(null);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookupAttempt, setLookupAttempt] = useState(0);
  // Always-current email for settlement guards: a promise closure's `email`
  // is frozen at call time, so it cannot tell whether the card moved on.
  const emailRef = useRef(email);
  emailRef.current = email;
  // Monotonic token: bumped by the lookup effect on every email change (and
  // by each new create). A settlement applies only if its token is still
  // current AND its requested email still matches the card's email.
  const contactOpSeqRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Supersede any in-flight create / 409 reconciliation from a previous
    // email: its token stops matching, so its settlement is discarded below.
    contactOpSeqRef.current += 1;
    setCheckingContact(true);
    setSavedContactId(null);
    setSaveContactError(null);
    setLookupFailed(false);
    setSavingContact(false);
    void apiClient
      .searchContacts(email)
      .then((res) => {
        if (cancelled) return;
        setCheckingContact(false);
        const resolved = resolveContactLookup(res, email);
        if (resolved.status === 'unknown') {
          setLookupFailed(true);
          return;
        }
        if (resolved.savedContactId) setSavedContactId(resolved.savedContactId);
      })
      .catch(() => {
        // apiClient returns envelopes, never throws — but an unexpected throw
        // (e.g. a timeout surfacing as a rejection) is still an unknown
        // state, never evidence of "not saved".
        if (!cancelled) {
          setCheckingContact(false);
          setLookupFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, email, lookupAttempt]);

  const handleAddToContacts = () => {
    if (savingContact) return;
    const requestedEmail = email;
    const requestedName = localName;
    const seq = contactOpSeqRef.current + 1;
    contactOpSeqRef.current = seq;
    const isCurrent = () =>
      contactOpSeqRef.current === seq && isSameContactEmail(emailRef.current, requestedEmail);
    setSavingContact(true);
    setSaveContactError(null);
    void apiClient
      .createContact({ name: requestedName, email: requestedEmail })
      .then(async (res) => {
        if (!isCurrent()) return;
        if (res.success && res.data?.id) {
          setSavedContactId(res.data.id);
          return;
        }
        if (res.error?.statusCode === 409) {
          // Already a contact (e.g. added from another card): resolve the id
          // so the card shows Edit Contact instead of reporting an error —
          // but only for the requested email, and only while it is still
          // this card's email. A failed re-search is unknown, not "unsaved".
          const again = await apiClient.searchContacts(requestedEmail);
          if (!isCurrent()) return;
          const resolved = resolveContactLookup(again, requestedEmail);
          if (resolved.status === 'saved' && resolved.savedContactId) {
            setSavedContactId(resolved.savedContactId);
            return;
          }
          if (resolved.status === 'unknown') {
            setSaveContactError(
              'Could not confirm whether this contact was already saved. Please try again.',
            );
            return;
          }
        }
        setSaveContactError(res.error?.message || 'Could not add this contact. Please try again.');
      })
      .catch(() => {
        if (!isCurrent()) return;
        setSaveContactError('Could not add this contact. Please try again.');
      })
      .finally(() => {
        // Only the current operation may clear the spinner: a superseded
        // create's finally must not re-enable Add while a newer create runs.
        if (contactOpSeqRef.current === seq) setSavingContact(false);
      });
  };

  return (
    <Inspector
      open={open}
      title={localName}
      subtitle={email}
      accent="var(--quant-primary)"
      avatarLabel={localName}
      messages={messages}
      onClose={onClose}
      contactEmail={email}
      onSaveContactName={handleSave}
      headerAction={
        checkingContact ? undefined : (
          <ContactCardAction
            savedContactId={savedContactId}
            saving={savingContact}
            error={saveContactError}
            onAdd={handleAddToContacts}
            lookupFailed={lookupFailed}
            onRetryLookup={() => setLookupAttempt((attempt) => attempt + 1)}
          />
        )
      }
    />
  );
}
