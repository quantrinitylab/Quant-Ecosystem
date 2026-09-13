'use client';

import { useId, useMemo, useState } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import type { ContactGroup, Email, EmailAttachment } from '../types';

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
}

function Inspector({
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
}: InspectorProps) {
  const id = useId();
  const [tab, setTab] = useState<Tab>(members ? 'members' : 'media');
  const panelRef = useFocusTrap<HTMLDivElement>({ active: open, onEscape: onClose });
  const shared = useMemo(() => inspect(messages), [messages]);
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
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-[#282C35] bg-[#090A0C] shadow-[0_24px_80px_rgba(0,0,0,.75)] sm:rounded-3xl"
      >
        <header className="flex items-center gap-3 border-b border-[#282C35] bg-[#111318] p-4 sm:p-5">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full text-base font-black text-[#090A0C]"
            style={{ backgroundColor: accent }}
          >
            {initials(avatarLabel)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-title`} className="truncate text-lg font-bold text-white">
              {title}
            </h2>
            <p className="truncate text-xs text-[#A1A4AC]">{subtitle}</p>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="mt-1 min-h-[44px] text-xs font-bold text-[#FF8C42] hover:text-[#FF9B5A]"
              >
                Edit group
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="flex size-11 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            ✕
          </button>
        </header>
        <div
          role="tablist"
          aria-label="Shared information"
          className="grid border-b border-[#282C35] bg-[#111318]"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}
        >
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`min-h-[52px] border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] ${
                tab === item.key
                  ? 'border-[#FF8C42] text-[#FF8C42]'
                  : 'border-transparent text-[#A1A4AC] hover:text-white'
              }`}
            >
              {item.label} <span className="ml-1 text-[10px]">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {tab === 'members' && members && (
            <div className="space-y-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="mb-2 min-h-[48px] w-full rounded-xl border border-dashed border-[#3A404D] bg-[#111318] text-sm font-bold text-[#FF8C42] hover:bg-[#2B1A11]"
                >
                  + Add or edit members
                </button>
              )}
              <ul className="space-y-2">
                {members.map((email) => (
                  <li
                    key={email}
                    className="flex min-h-[58px] items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] px-3"
                  >
                    <span
                      className="flex size-9 items-center justify-center rounded-full text-xs font-bold text-[#090A0C]"
                      style={{ backgroundColor: accent }}
                    >
                      {initials(email)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-sm text-white">
                        {normalize(email) === normalize(currentUserEmail)
                          ? 'You'
                          : displayName(email)}
                      </strong>
                      <span className="block truncate text-xs text-[#A1A4AC]">{email}</span>
                    </span>
                    <span className="rounded-full bg-[#16181D] px-2 py-1 text-[10px] text-[#A1A4AC]">
                      {normalize(email) === normalize(currentUserEmail) ? 'Owner' : 'Member'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {tab === 'media' &&
            (shared.media.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {shared.media.map(({ attachment, sender, date }) => (
                  <li
                    key={attachment.id}
                    className="overflow-hidden rounded-xl border border-[#282C35] bg-[#111318]"
                  >
                    <button
                      type="button"
                      onClick={() => safeOpen(attachment.url)}
                      className="aspect-square w-full bg-[#16181D] focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                    >
                      {attachment.mimeType.startsWith('image/') ? (
                        <img
                          src={attachment.url}
                          alt=""
                          loading="lazy"
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
                    <p className="truncate px-2 pb-2 text-[10px] text-[#A1A4AC]">
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
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] p-3 text-left hover:bg-[#16181D]"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-[#2B1A11] text-[10px] font-black text-[#FF8C42]">
                        FILE
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-white">
                          {attachment.filename}
                        </strong>
                        <span className="block truncate text-xs text-[#A1A4AC]">
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
                      className="flex min-h-[64px] w-full items-center rounded-xl border border-[#282C35] bg-[#111318] p-3 text-left hover:bg-[#16181D]"
                    >
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-sm text-white">{link.label}</strong>
                        <span className="block truncate text-xs text-[#A1A4AC]">
                          {link.sender} · {dateLabel(link.date)}
                        </span>
                      </span>
                      <span className="text-[#FF8C42]">↗</span>
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
    <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-[#282C35] bg-[#111318]/50 text-sm text-[#A1A4AC]">
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
}

export function GroupInfoModal(props: GroupInfoModalProps) {
  return (
    <Inspector
      open={props.open}
      title={props.group.name}
      subtitle={`${props.group.emails.length} ${
        props.group.emails.length === 1 ? 'member' : 'members'
      }`}
      accent={props.group.color ?? '#FF8C42'}
      avatarLabel={props.group.name}
      messages={props.messages}
      members={props.group.emails}
      currentUserEmail={props.currentUserEmail}
      onClose={props.onClose}
      onEdit={props.onEditGroup}
    />
  );
}

export interface ContactProfileInspectorProps {
  open: boolean;
  email: string;
  name?: string;
  messages: Email[];
  onClose: () => void;
}

export function ContactProfileInspector({
  open,
  email,
  name,
  messages,
  onClose,
}: ContactProfileInspectorProps) {
  const clean = name?.trim() || displayName(email);
  return (
    <Inspector
      open={open}
      title={clean}
      subtitle={email}
      accent="#FF8C42"
      avatarLabel={clean}
      messages={messages}
      onClose={onClose}
    />
  );
}
