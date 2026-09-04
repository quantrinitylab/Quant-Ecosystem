'use client';

import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useInbox } from '../hooks/useInbox';
import { useStorageQuota } from '../hooks/useStorageQuota';
import { formatBytes } from '../lib/format-bytes';
import { QuantMailLogo } from './QuantMailLogo';
import { BrandWordmark } from './BrandWordmark';
import { AccountBadge } from './AccountBadge';

type IconName =
  | 'archive'
  | 'calendar'
  | 'chevron'
  | 'clock'
  | 'code'
  | 'compose'
  | 'contacts'
  | 'drafts'
  | 'drive'
  | 'inbox'
  | 'labels'
  | 'pipeline'
  | 'postcard'
  | 'search'
  | 'security'
  | 'sent'
  | 'settings'
  | 'spam'
  | 'star'
  | 'trash'
  | 'workspaces';

const ICON_PATHS: Record<IconName, ReactNode> = {
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M5 7l1-3h12l1 3v12H5z" />
      <path d="M9 11h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  code: (
    <>
      <path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" />
    </>
  ),
  compose: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    </>
  ),
  contacts: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  drafts: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </>
  ),
  drive: (
    <>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </>
  ),
  inbox: (
    <>
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </>
  ),
  labels: (
    <>
      <path d="M20.6 12.4 12 3.8H4v8l8.6 8.6a2 2 0 0 0 2.8 0l5.2-5.2a2 2 0 0 0 0-2.8z" />
      <circle cx="7.6" cy="7.6" r="1.1" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="19" r="2" />
      <path d="M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 1 3-3" />
    </>
  ),
  postcard: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M12 4v16M17 7h2v3h-2z" />
      <path d="M5 9h4M5 12h4M5 15h3" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  security: (
    <>
      <path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  sent: (
    <>
      <path d="m22 2-7 20-4-9-9-4z" />
      <path d="M22 2 11 13" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  spam: (
    <>
      <path d="M12 2 2 12l10 10 10-10L12 2z" />
      <path d="M12 8v5M12 16h.01" />
    </>
  ),
  star: (
    <>
      <path d="m12 3.6 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 10l6-.9z" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" />
    </>
  ),
  workspaces: (
    <>
      <rect x="2" y="3" width="9" height="9" rx="1.5" />
      <rect x="13" y="3" width="9" height="9" rx="1.5" />
      <rect x="2" y="14" width="9" height="7" rx="1.5" />
      <rect x="13" y="14" width="9" height="7" rx="1.5" />
    </>
  ),
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

/*
  Eight mail folders, flat, in the order the keyboard registry already declares
  them (`g i`, `g s`, `g d`, `g *`, `g b`, `g e`, `g t`, `g !` —
  KeyboardProvider.tsx:138-209).

  Five of these routes were fully built and completely unreachable by pointer.
  `/sent` (a 271-line delivery-trail page with per-row send status and Resend),
  `/starred`, `/snoozed` and `/archive` (real screens over the shared
  `MailFolderPage`, each with its own row action) and `/labels` (a 314-line
  label CRUD screen) had ZERO `href`/`router.push` anywhere in `src` outside
  their own files. The only way in was a keypress: `nav.*` in the command
  registry, reachable from the palette, which itself only opens on ⌘K. So on a
  phone with no hardware keyboard, five finished features did not exist.

  Flat rather than a "More" disclosure on purpose. A disclosure would be a new
  interaction pattern used exactly once (against §18), it would cost Spam and
  Trash the one-click reach they have today, and `.sidebar-scroll` already
  scrolls — so the long list costs nothing structurally while a collapsed one
  costs a click on every folder behind it.

  Labels sits in Control, not Mail: it manages labels, it is not a folder of
  mail. Keeping the Mail group purely folders is what makes the group heading
  mean something.

  No count badge on the new rows. The two that exist are fed by `useInbox`
  calls (lines 216-217); a count per folder means a poll per folder on every
  route. That is the trade the inbox's Spam chip already declined in writing at
  `src/app/page.tsx:1861-1866`, and this matches it.
*/
const NAV_GROUPS: Array<{
  label: string;
  items: Array<{
    id: string;
    label: string;
    icon: IconName;
    path: string;
    shortcut?: string;
    desktopOnly?: boolean;
  }>;
}> = [
  {
    label: 'Mail',
    items: [
      { id: 'inbox', label: 'Mail', icon: 'inbox', path: '/' },
      { id: 'sent', label: 'Sent', icon: 'sent', path: '/sent' },
      { id: 'drafts', label: 'Drafts', icon: 'drafts', path: '/drafts' },
      { id: 'starred', label: 'Starred', icon: 'star', path: '/starred' },
      { id: 'snoozed', label: 'Snoozed', icon: 'clock', path: '/snoozed' },
      { id: 'archive', label: 'Archive', icon: 'archive', path: '/archive' },
      { id: 'spam', label: 'Spam', icon: 'spam', path: '/spam' },
      { id: 'trash', label: 'Trash', icon: 'trash', path: '/trash' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'teams', label: 'Teams', icon: 'workspaces', path: '/workspaces' },
      { id: 'calendar', label: 'Calendar', icon: 'calendar', path: '/calendar', desktopOnly: true },
      { id: 'contacts', label: 'Contacts', icon: 'contacts', path: '/contacts', desktopOnly: true },
      { id: 'drive', label: 'Drive', icon: 'drive', path: '/drive', desktopOnly: true },
      { id: 'code', label: 'Git', icon: 'code', path: '/codehub', desktopOnly: true },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: 'pipeline',
        path: '/pipelines',
        desktopOnly: true,
      },
    ],
  },
  {
    label: 'Control',
    items: [
      { id: 'labels', label: 'Labels', icon: 'labels', path: '/labels' },
      { id: 'settings', label: 'Settings', icon: 'settings', path: '/settings' },
    ],
  },
];

export interface AppSidebarProps {
  /**
   * Rendered inside the scroll region, after the nav groups and before the
   * storage readout. A route that has its own navigation — Contacts and its
   * A–Z index — puts it here rather than teaching this component about
   * contacts, so the sidebar stays the same component on every screen.
   */
  extra?: ReactNode;
}

export function AppSidebar({ extra }: AppSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path));
  const { data: inboxEmails } = useInbox();
  const { data: draftEmails } = useInbox({ folderType: 'DRAFTS' });
  const unreadCount = inboxEmails?.filter((e) => !e.isRead).length ?? 0;
  const draftCount = draftEmails?.length ?? 0;
  const { quota, known: quotaKnown, usedPct } = useStorageQuota();

  return (
    <nav className="quant-sidebar" aria-label="QuantMail navigation">
      <header className="sidebar-brand flex items-center justify-between px-3.5 py-3 border-b border-[var(--quant-border-subtle)]">
        <div
          className="flex items-center gap-2.5 cursor-pointer select-none group"
          onClick={() => router.push('/')}
          title="QuantMail — Go to Inbox"
        >
          <QuantMailLogo size={36} showBadge={false} interactive={false} />
          <BrandWordmark app="mail" size="text-lg" />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('quant:sidebar:close'));
            }}
            className="size-11 sm:size-8 inline-flex items-center justify-center rounded-xl text-[#A1A4AC] hover:text-white hover:bg-[#282C35]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
            title="Close navigation"
            aria-label="Close navigation menu"
          >
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </header>

      <div className="sidebar-compose-wrap">
        <button type="button" onClick={() => router.push('/compose')} className="sidebar-compose">
          <Icon name="compose" className="h-[18px] w-[18px]" />
          <span>Compose</span>
          <kbd className="hidden md:inline-flex">C</kbd>
        </button>
      </div>

      <div className="sidebar-scroll">
        {NAV_GROUPS.map((group) => (
          <section
            key={group.label}
            className="sidebar-group"
            aria-labelledby={`nav-${group.label.toLowerCase()}`}
          >
            <h2 id={`nav-${group.label.toLowerCase()}`}>{group.label}</h2>
            <ul role="list">
              {group.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.id} className={item.desktopOnly ? 'hidden md:block' : ''}>
                    <button
                      type="button"
                      onClick={() => router.push(item.path)}
                      className={`sidebar-nav-item ${active ? 'is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {item.id === 'inbox' && unreadCount > 0 && (
                        <span className="sidebar-count">{unreadCount}</span>
                      )}
                      {item.id === 'drafts' && draftCount > 0 && (
                        <span className="sidebar-count sidebar-count-muted">{draftCount}</span>
                      )}
                      {item.id === 'inbox' && (
                        <span className="sidebar-nav-spark" aria-hidden="true" />
                      )}
                      {item.shortcut && (
                        <kbd className="ml-auto text-[10px] text-[var(--quant-muted-foreground)] bg-[var(--quant-surface-hover)] px-1.5 py-0.5 rounded">
                          {item.shortcut}
                        </kbd>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {extra}

        {/* QuantMail Storage Indicator */}
        {/*
          This read `1.2 / 15 GB` over an 8% bar, both hardcoded, while
          `components/Sidebar.tsx` hardcoded `3.5 GB of 15 GB used` over a 35%
          bar and the Drive page showed the real total. All three now come from
          `GET /drive/quota`, which sums the user's undeleted files server-side,
          and the bar is a real `progressbar` so a screen reader gets the number
          instead of an unlabelled sliver of orange.
        */}
        <section
          className="mt-4 px-2.5 py-3 border-t border-[var(--quant-border-subtle)]"
          aria-label="Storage status"
        >
          <div className="flex items-center justify-between text-[11px] text-[#A1A4AC]">
            <span className="font-medium flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-[#FF8C42]" />
              Cloud Storage
            </span>
            <span className="font-mono text-[10px] text-[#F5F5F5]">
              {quotaKnown && quota
                ? `${formatBytes(quota.used)} / ${formatBytes(quota.total)}`
                : 'Calculating…'}
            </span>
          </div>
          <div
            className="mt-2 h-1.5 w-full rounded-full bg-[#16181D] border border-[#282C35] overflow-hidden"
            role="progressbar"
            aria-label="Cloud storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={quotaKnown ? usedPct : undefined}
            aria-valuetext={
              quotaKnown && quota
                ? `${formatBytes(quota.used)} of ${formatBytes(quota.total)} used`
                : 'Calculating'
            }
          >
            <div
              className="h-full rounded-full bg-[#FF8C42] transition-all duration-300"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </section>
      </div>

      <AccountBadge />
      <footer className="sidebar-footer">
        <span>QuantMail by Quantrinity</span>
        <span className="ml-auto text-[10px] font-mono text-[var(--quant-muted-foreground)]">
          v1.0
        </span>
      </footer>
    </nav>
  );
}
