'use client';

import { useId, useMemo, useState } from 'react';
import { useFocusTrap } from '@quant/shared-ui';
import type { ContactGroup, Email, EmailAttachment } from '../types';

type GroupInfoTab = 'members' | 'media' | 'files' | 'links';

interface GroupLink {
  id: string;
  url: string;
  title: string;
  sender: string;
  date: Date;
}

export interface GroupInfoModalProps {
  isOpen: boolean;
  group: ContactGroup;
  messages: Email[];
  currentUserEmail?: string;
  onClose: () => void;
  onEditGroup: (group: ContactGroup) => void;
}

const MEDIA_MIME_PREFIXES = ['image/', 'video/'];

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

const URL_PATTERN = /https?:\/\/[^\s<>"')\]}]+/gi;

function normalizeEmail(value?: string): string {
  return (value ?? '').trim().toLowerCase();
}

function initials(value: string): string {
  const cleaned = value
    .replace(/@.*$/, '')
    .replace(/[._-]+/g, ' ')
    .trim();

  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';

  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);

  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${
    units[exponent]
  }`;
}

function formatDate(value: string | Date): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isMediaAttachment(attachment: EmailAttachment): boolean {
  return MEDIA_MIME_PREFIXES.some((prefix) => attachment.mimeType.toLowerCase().startsWith(prefix));
}

function isFileAttachment(attachment: EmailAttachment): boolean {
  const mimeType = attachment.mimeType.toLowerCase();

  return (
    DOCUMENT_MIME_TYPES.has(mimeType) ||
    (!isMediaAttachment(attachment) && !attachment.isInline && Boolean(attachment.filename))
  );
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function linkTitle(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname === '/' ? '' : url.pathname;

    return `${url.hostname}${path}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

function fileIcon(mimeType: string): string {
  const normalized = mimeType.toLowerCase();

  if (normalized === 'application/pdf') return 'PDF';
  if (normalized.includes('zip') || normalized.includes('rar')) return 'ZIP';
  if (normalized.includes('word')) return 'DOC';
  if (normalized.includes('sheet') || normalized.includes('excel')) return 'XLS';
  if (normalized.includes('presentation') || normalized.includes('powerpoint')) {
    return 'PPT';
  }

  return 'FILE';
}

function openExternal(url: string): void {
  const safeUrl = safeExternalUrl(url);
  if (!safeUrl) return;

  window.open(safeUrl, '_blank', 'noopener,noreferrer');
}

function downloadAttachment(attachment: EmailAttachment): void {
  const safeUrl = safeExternalUrl(attachment.url);

  // Data URLs are also used by optimistic, not-yet-refetched attachments.
  const usableUrl = safeUrl ?? (attachment.url.startsWith('data:') ? attachment.url : null);
  if (!usableUrl) return;

  const anchor = document.createElement('a');
  anchor.href = usableUrl;
  anchor.download = attachment.filename || 'attachment';
  anchor.rel = 'noopener noreferrer';
  anchor.target = '_blank';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function GroupInfoModal({
  isOpen,
  group,
  messages,
  currentUserEmail,
  onClose,
  onEditGroup,
}: GroupInfoModalProps) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const tabsId = `${baseId}-tabs`;

  const panelRef = useFocusTrap<HTMLDivElement>({
    active: isOpen,
    onEscape: onClose,
  });

  const [activeTab, setActiveTab] = useState<GroupInfoTab>('members');

  const currentAddress = normalizeEmail(currentUserEmail);
  const accent = group.color ?? '#FF8C42';

  const members = useMemo(() => {
    const records: Array<{
      email: string;
      label: string;
      role: 'Owner' | 'Member';
    }> = [];

    if (currentAddress) {
      records.push({
        email: currentAddress,
        label: currentAddress,
        role: 'Owner',
      });
    }

    const seen = new Set(records.map((member) => member.email));

    for (const rawEmail of group.emails) {
      const email = normalizeEmail(rawEmail);
      if (!email || seen.has(email)) continue;

      seen.add(email);
      records.push({
        email,
        label: email,
        role: email === currentAddress ? 'Owner' : 'Member',
      });
    }

    return records;
  }, [currentAddress, group.emails]);

  const media = useMemo(
    () =>
      messages.flatMap((message) =>
        (message.attachments ?? []).filter(isMediaAttachment).map((attachment) => ({
          attachment,
          sender: message.from?.name || message.from?.email || 'Unknown sender',
          date: message.receivedAt,
        })),
      ),
    [messages],
  );

  const files = useMemo(
    () =>
      messages.flatMap((message) =>
        (message.attachments ?? []).filter(isFileAttachment).map((attachment) => ({
          attachment,
          sender: message.from?.name || message.from?.email || 'Unknown sender',
          date: message.receivedAt,
        })),
      ),
    [messages],
  );

  const links = useMemo<GroupLink[]>(() => {
    const seen = new Set<string>();
    const extracted: GroupLink[] = [];

    for (const message of messages) {
      const body = message.bodyText || message.snippet || '';
      const matches = body.match(URL_PATTERN) ?? [];

      for (const rawMatch of matches) {
        const candidate = rawMatch.replace(/[.,!?;:]+$/, '');
        const url = safeExternalUrl(candidate);

        if (!url || seen.has(url)) continue;
        seen.add(url);

        extracted.push({
          id: `${message.id}:${url}`,
          url,
          title: linkTitle(url),
          sender: message.from?.name || message.from?.email || 'Unknown sender',
          date: new Date(message.receivedAt),
        });
      }
    }

    return extracted.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [messages]);

  if (!isOpen) return null;

  const tabs: Array<{
    id: GroupInfoTab;
    label: string;
    count: number;
  }> = [
    { id: 'members', label: 'Members', count: members.length },
    { id: 'media', label: 'Media', count: media.length },
    { id: 'files', label: 'Files', count: files.length },
    { id: 'links', label: 'Links', count: links.length },
  ];

  const selectAdjacentTab = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex = currentIndex;

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    setActiveTab(tabs[nextIndex].id);

    requestAnimationFrame(() => {
      document.getElementById(`${tabsId}-${tabs[nextIndex].id}`)?.focus();
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-[#282C35] bg-[#090A0C] shadow-[0_24px_80px_rgba(0,0,0,0.75)] sm:max-w-2xl sm:rounded-3xl"
      >
        <header className="border-b border-[#282C35] bg-[#111318] px-4 pb-4 pt-3 sm:px-6 sm:pt-5">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#3A404D] sm:hidden" />

          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <div
                className="flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-black text-[#090A0C]"
                style={{ backgroundColor: accent }}
                aria-hidden="true"
              >
                {initials(group.name)}
              </div>

              <div className="min-w-0">
                <h2 id={titleId} className="truncate text-lg font-bold text-[#F5F5F5]">
                  {group.name}
                </h2>

                <p className="mt-0.5 text-sm text-[#A1A4AC]">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                </p>

                <button
                  type="button"
                  onClick={() => onEditGroup(group)}
                  className="mt-2 min-h-[44px] rounded-lg px-2 text-sm font-semibold text-[#FF8C42] transition-colors hover:bg-[#2B1A11] hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                >
                  Edit group
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close group information"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] transition-colors hover:bg-[#282C35] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            >
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div
          role="tablist"
          aria-label="Group information"
          className="grid grid-cols-4 border-b border-[#282C35] bg-[#111318] px-2 sm:px-4"
        >
          {tabs.map((tab, index) => {
            const selected = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                id={`${tabsId}-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`${tabsId}-${tab.id}-panel`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => selectAdjacentTab(event, index)}
                className={`relative flex min-h-[52px] min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42] sm:text-sm ${
                  selected ? 'text-[#FF8C42]' : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
                }`}
              >
                <span className="truncate">{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    selected ? 'bg-[#2B1A11] text-[#FF9B5A]' : 'bg-[#16181D] text-[#A1A4AC]'
                  }`}
                >
                  {tab.count}
                </span>

                {selected && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[#FF8C42]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#090A0C] p-4 sm:p-6">
          {activeTab === 'members' && (
            <section
              id={`${tabsId}-members-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-members`}
              className="space-y-3"
            >
              <button
                type="button"
                onClick={() => onEditGroup(group)}
                className="flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-dashed border-[#3A404D] bg-[#111318] px-4 text-left text-sm font-semibold text-[#FF8C42] transition-colors hover:border-[#5C3016] hover:bg-[#2B1A11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
              >
                <span className="flex size-8 items-center justify-center rounded-full bg-[#2B1A11] text-xl">
                  +
                </span>
                Add or edit members
              </button>

              <ul role="list" className="m-0 list-none space-y-2 p-0">
                {members.map((member) => (
                  <li
                    key={member.email}
                    className="flex min-h-[64px] items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] px-3.5 py-2.5"
                  >
                    <div
                      className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold text-[#090A0C]"
                      style={{ backgroundColor: accent }}
                      aria-hidden="true"
                    >
                      {initials(member.label)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#F5F5F5]">
                        {member.role === 'Owner' ? 'You' : member.email.split('@')[0]}
                      </p>
                      <p className="truncate text-xs text-[#A1A4AC]">{member.email}</p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold ${
                        member.role === 'Owner'
                          ? 'border-[#5C3016] bg-[#2B1A11] text-[#FF9B5A]'
                          : 'border-[#282C35] bg-[#16181D] text-[#A1A4AC]'
                      }`}
                    >
                      {member.role}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {activeTab === 'media' && (
            <section
              id={`${tabsId}-media-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-media`}
            >
              {media.length === 0 ? (
                <EmptyTabState
                  title="No shared media"
                  detail="Images and videos shared in this conversation will appear here."
                />
              ) : (
                <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                  {media.map(({ attachment, sender, date }) => (
                    <li
                      key={attachment.id}
                      className="group overflow-hidden rounded-xl border border-[#282C35] bg-[#111318]"
                    >
                      <button
                        type="button"
                        onClick={() => openExternal(attachment.url)}
                        className="relative block aspect-square w-full overflow-hidden bg-[#16181D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#FF8C42]"
                        aria-label={`Preview ${attachment.filename}`}
                      >
                        {attachment.mimeType.toLowerCase().startsWith('image/') ? (
                          <img
                            src={attachment.url}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                          />
                        ) : (
                          <video
                            src={attachment.url}
                            muted
                            preload="metadata"
                            className="size-full object-cover"
                          />
                        )}

                        <span className="absolute inset-x-2 bottom-2 rounded-lg bg-black/75 px-2 py-1 text-left text-[10px] text-white">
                          Preview
                        </span>
                      </button>

                      <div className="space-y-1 p-2.5">
                        <p className="truncate text-xs font-semibold text-[#F5F5F5]">
                          {attachment.filename}
                        </p>
                        <p className="truncate text-[10px] text-[#A1A4AC]">
                          {sender} · {formatDate(date)}
                        </p>
                        <button
                          type="button"
                          onClick={() => downloadAttachment(attachment)}
                          className="min-h-[44px] text-xs font-semibold text-[#FF8C42] hover:text-[#FF9B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                        >
                          Download
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {activeTab === 'files' && (
            <section
              id={`${tabsId}-files-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-files`}
            >
              {files.length === 0 ? (
                <EmptyTabState
                  title="No shared files"
                  detail="Documents, PDFs, spreadsheets, and archives will appear here."
                />
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {files.map(({ attachment, sender, date }) => (
                    <li
                      key={attachment.id}
                      className="flex items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] p-3"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-[#5C3016] bg-[#2B1A11] text-[10px] font-black text-[#FF9B5A]">
                        {fileIcon(attachment.mimeType)}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[#F5F5F5]">
                          {attachment.filename}
                        </p>
                        <p className="truncate text-xs text-[#A1A4AC]">
                          {formatBytes(attachment.size)} · {sender} · {formatDate(date)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => downloadAttachment(attachment)}
                        aria-label={`Download ${attachment.filename}`}
                        className="flex size-11 shrink-0 items-center justify-center rounded-xl text-[#A1A4AC] hover:bg-[#282C35] hover:text-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                      >
                        <DownloadIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {activeTab === 'links' && (
            <section
              id={`${tabsId}-links-panel`}
              role="tabpanel"
              aria-labelledby={`${tabsId}-links`}
            >
              {links.length === 0 ? (
                <EmptyTabState
                  title="No shared links"
                  detail="Web links shared in message bodies will appear here."
                />
              ) : (
                <ul className="m-0 list-none space-y-2 p-0">
                  {links.map((link) => (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() => openExternal(link.url)}
                        className="flex min-h-[68px] w-full items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] p-3 text-left transition-colors hover:border-[#3A404D] hover:bg-[#16181D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#282C35] bg-[#16181D] text-[#FF8C42]">
                          <LinkIcon />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#F5F5F5]">
                            {link.title}
                          </span>
                          <span className="block truncate text-xs text-[#A1A4AC]">
                            {link.sender} · {formatDate(link.date)}
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-[#6B6E76]">
                            {link.url}
                          </span>
                        </span>

                        <ExternalIcon />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyTabState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#282C35] bg-[#111318]/50 px-6 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full border border-[#282C35] bg-[#16181D] text-[#A1A4AC]">
        <svg
          className="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M8 12h8M12 8v8" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <h3 className="text-sm font-bold text-[#F5F5F5]">{title}</h3>
      <p className="mt-1 max-w-xs text-xs leading-5 text-[#A1A4AC]">{detail}</p>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      className="size-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1" />
      <path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg
      className="size-4 shrink-0 text-[#A1A4AC]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M15 3h6v6" />
      <path d="m10 14 11-11" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
