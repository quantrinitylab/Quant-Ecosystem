'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { quantMailBrandLockup } from '../brand/identity';
import { useCreateLabel, useLabels } from '../hooks/useLabels';
import { useInbox } from '../hooks/useInbox';
import { NotificationBell } from './NotificationBell';
import type { EmailLabel } from '../types';
import { AccountBadge } from './AccountBadge';
import { QuantrinityMark } from './QuantrinityMark';

const PRESET_COLORS = [
  '#ef4444', '#ff9933', '#eab308', '#138808', '#06b6d4',
  '#3b82f6', '#6366f1', '#ec4899', '#6b7280', '#14b8a6',
];

type IconName =
  | 'archive' | 'calendar' | 'chevron' | 'clock' | 'code' | 'compose' | 'contacts'
  | 'drafts' | 'drive' | 'inbox' | 'pipeline' | 'search' | 'security' | 'sent'
  | 'settings' | 'spam' | 'star' | 'trash' | 'workspaces';

const ICON_PATHS: Record<IconName, ReactNode> = {
  archive: <><path d="M4 7h16" /><path d="M5 7l1-3h12l1 3v12H5z" /><path d="M9 11h6" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" /></>,
  code: <><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 5l-4 14" /></>,
  compose: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" /></>,
  contacts: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6M16 7a3 3 0 0 1 0 6M17 14c2.7.4 4 2.4 4 5" /></>,
  drafts: <><path d="M5 3h10l4 4v14H5z" /><path d="M14 3v5h5M8 13h8M8 17h5" /></>,
  drive: <><path d="M3 7h7l2 2h9v10H3z" /><path d="M3 7v12" /></>,
  inbox: <><path d="M4 4h16v16H4z" /><path d="M4 14h5l2 3h2l2-3h5" /></>,
  pipeline: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="12" r="2" /><circle cx="6" cy="19" r="2" /><path d="M8 5h3a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3M8 19h3a3 3 0 0 0 3-3v-1a3 3 0 0 1 3-3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  security: <><path d="M12 3 4 6v5c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z" /><path d="m9 12 2 2 4-4" /></>,
  sent: <><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  spam: <><path d="M12 3l9.5 16.5h-19z" /><path d="M12 10v4M12 17.2v.3" /></>,
  star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6" /></>,
  workspaces: <><circle cx="9" cy="7" r="3" /><circle cx="17" cy="9" r="2.4" /><path d="M3 20c0-3.6 2.4-5.6 6-5.6s6 2 6 5.6M16.4 14.2c2.8.3 4.6 2.1 4.6 5" /></>,
};

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

const NAV_GROUPS: Array<{
  label: string;
  items: Array<{ id: string; label: string; icon: IconName; path: string }>;
}> = [
  { label: 'Mail', items: [
    { id: 'inbox', label: 'Inbox', icon: 'inbox', path: '/' },
    { id: 'search', label: 'Search', icon: 'search', path: '/search' },
    { id: 'starred', label: 'Starred', icon: 'star', path: '/starred' },
    { id: 'snoozed', label: 'Snoozed', icon: 'clock', path: '/snoozed' },
    { id: 'sent', label: 'Sent', icon: 'sent', path: '/sent' },
    { id: 'drafts', label: 'Drafts', icon: 'drafts', path: '/drafts' },
    { id: 'archive', label: 'Archive', icon: 'archive', path: '/archive' },
    { id: 'spam', label: 'Spam', icon: 'spam', path: '/spam' },
    { id: 'trash', label: 'Trash', icon: 'trash', path: '/trash' },
  ] },
  { label: 'Context', items: [
    { id: 'calendar', label: 'Calendar', icon: 'calendar', path: '/calendar' },
    { id: 'contacts', label: 'Contacts', icon: 'contacts', path: '/contacts' },
    { id: 'drive', label: 'Drive', icon: 'drive', path: '/drive' },
  ] },
  { label: 'Team', items: [
    { id: 'workspaces', label: 'Workspaces', icon: 'workspaces', path: '/workspaces' },
  ] },
  { label: 'Code', items: [
    { id: 'codehub', label: 'CodeHub', icon: 'code', path: '/codehub' },
  ] },
  { label: 'Control', items: [
    { id: 'security', label: 'Security', icon: 'security', path: '/security' },
    { id: 'settings', label: 'Settings', icon: 'settings', path: '/settings' },
  ] },
];

function LabelSection() {
  const { data: labels, isLoading } = useLabels();
  const createLabel = useCreateLabel();
  const prefersReducedMotion = useReducedMotion();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(PRESET_COLORS[1]);
  const [labelsExpanded, setLabelsExpanded] = useState(true);

  const handleCreateLabel = useCallback(async () => {
    const name = newLabelName.trim();
    if (!name) return;
    try {
      await createLabel.mutateAsync({ name, color: newLabelColor });
      setNewLabelName('');
      setNewLabelColor(PRESET_COLORS[1]);
      setShowCreateForm(false);
    } catch {
      // The mutation hook exposes the failure state next to this form.
    }
  }, [createLabel, newLabelColor, newLabelName]);

  return (
    <section className="sidebar-labels" aria-labelledby="sidebar-labels-heading">
      <button type="button" className="sidebar-section-trigger"
        onClick={() => setLabelsExpanded((value) => !value)} aria-expanded={labelsExpanded}
        aria-controls="sidebar-labels-list">
        <span id="sidebar-labels-heading">Labels</span>
        <Icon name="chevron" className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${labelsExpanded ? 'rotate-90' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {labelsExpanded && (
          <motion.div id="sidebar-labels-list"
            initial={prefersReducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReducedMotion ? undefined : { height: 0, opacity: 0 }}
            className="overflow-hidden">
            {isLoading && <div className="sidebar-label-skeleton" />}
            {labels?.map((label: EmailLabel) => (
              <button type="button" key={label.id} className="sidebar-label-item">
                <span className="h-2 w-2 flex-none rounded-full" style={{ backgroundColor: label.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{label.name}</span>
                {label.unreadCount > 0 && <span className="sidebar-count">{label.unreadCount}</span>}
              </button>
            ))}
            {!showCreateForm ? (
              <button type="button" className="sidebar-create-label" onClick={() => setShowCreateForm(true)}>
                <span aria-hidden="true">＋</span> New label
              </button>
            ) : (
              <div className="sidebar-label-form">
                <label className="sr-only" htmlFor="new-label-name">Label name</label>
                <input id="new-label-name" type="text" placeholder="Label name" value={newLabelName}
                  onChange={(event) => setNewLabelName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void handleCreateLabel(); }} autoFocus />
                <div className="sidebar-color-grid" aria-label="Label color">
                  {PRESET_COLORS.map((color) => (
                    <button key={color} type="button" style={{ backgroundColor: color }}
                      onClick={() => setNewLabelColor(color)} aria-label={`Use color ${color}`}
                      aria-pressed={newLabelColor === color}
                      className={newLabelColor === color ? 'is-selected' : ''} />
                  ))}
                </div>
                {createLabel.isError && <p className="sidebar-label-error" role="alert">Label could not be created.</p>}
                <div className="sidebar-label-actions">
                  <button type="button" onClick={() => void handleCreateLabel()}
                    disabled={!newLabelName.trim() || createLabel.isPending}>
                    {createLabel.isPending ? 'Creating…' : 'Create'}
                  </button>
                  <button type="button" onClick={() => { setShowCreateForm(false); setNewLabelName(''); }}>Cancel</button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path));
  const { data: inboxEmails } = useInbox();
  const { data: draftEmails } = useInbox({ folderType: 'DRAFTS' });
  const unreadCount = inboxEmails?.filter((e) => !e.isRead).length ?? 0;
  const draftCount = draftEmails?.length ?? 0;

  return (
    <nav className="quant-sidebar" aria-label="QuantMail navigation">
      <header className="sidebar-brand">
        <QuantrinityMark compact label={quantMailBrandLockup.accessibleName} />
        <div className="min-w-0" aria-hidden="true">
          <p className="sidebar-product">{quantMailBrandLockup.productName}</p>
          <p className="sidebar-parent">{quantMailBrandLockup.byline}</p>
        </div>
        <NotificationBell />
        <span className="sidebar-live-dot" title="All systems operational" aria-label="All systems operational" />
      </header>

      <div className="sidebar-compose-wrap">
        <button type="button" onClick={() => router.push('/compose')} className="sidebar-compose">
          <Icon name="compose" className="h-[18px] w-[18px]" />
          <span>New message</span>
          <kbd>C</kbd>
        </button>
      </div>

      <div className="sidebar-scroll">
        {NAV_GROUPS.map((group) => (
          <section key={group.label} className="sidebar-group" aria-labelledby={`nav-${group.label.toLowerCase()}`}>
            <h2 id={`nav-${group.label.toLowerCase()}`}>{group.label}</h2>
            <ul role="list">
              {group.items.map((item) => {
                const active = isActive(item.path);
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => router.push(item.path)}
                      className={`sidebar-nav-item ${active ? 'is-active' : ''}`}
                      aria-current={active ? 'page' : undefined}>
                      <Icon name={item.icon} />
                      <span>{item.label}</span>
                      {item.id === 'inbox' && unreadCount > 0 && <span className="sidebar-count">{unreadCount}</span>}
                      {item.id === 'drafts' && draftCount > 0 && <span className="sidebar-count sidebar-count-muted">{draftCount}</span>}
                      {item.id === 'inbox' && <span className="sidebar-nav-spark" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <LabelSection />
      </div>

      <AccountBadge />
      <footer className="sidebar-footer">
        <span className="sidebar-india" aria-hidden="true"><i /><i /><i /></span>
        <span>Built in India</span>
        <span className="ml-auto text-[9px] uppercase tracking-[0.16em] text-[var(--quant-muted-foreground)]">Private beta</span>
      </footer>
    </nav>
  );
}
