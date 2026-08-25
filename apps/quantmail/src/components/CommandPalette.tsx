'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { showToast } from './InboxToast';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
  category: 'navigation' | 'actions' | 'ai' | 'settings';
}

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      {
        id: 'inbox',
        label: 'Go to Priority Inbox',
        description: 'View all active email threads and conversations',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"
            />
          </svg>
        ),
        shortcut: 'G I',
        category: 'navigation',
        action: () => router.push('/'),
      },
      {
        id: 'compose',
        label: 'Compose new message',
        description: 'Write an email with Quanty assistant',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
            />
          </svg>
        ),
        shortcut: 'C',
        category: 'navigation',
        action: () => router.push('/compose'),
      },
      {
        id: 'sent',
        label: 'Open Sent Mail',
        description: 'Outbound dispatched emails and delivery status',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <line
              x1="22"
              y1="2"
              x2="11"
              y2="13"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polygon
              points="22 2 15 22 11 13 2 9 22 2"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        shortcut: 'G S',
        category: 'navigation',
        action: () => router.push('/sent'),
      },
      {
        id: 'drafts',
        label: 'Open Drafts',
        description: 'Unsent drafts and saved messages',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14 2 14 8 20 8" strokeWidth={1.8} />
            <line x1="16" y1="13" x2="8" y2="13" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="16" y1="17" x2="8" y2="17" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        shortcut: 'G D',
        category: 'navigation',
        action: () => router.push('/drafts'),
      },
      {
        id: 'starred',
        label: 'Open Starred / Pinned',
        description: 'Important flagged conversations',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polygon
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            />
          </svg>
        ),
        shortcut: 'G *',
        category: 'navigation',
        action: () => router.push('/starred'),
      },
      {
        id: 'snoozed',
        label: 'Open Snoozed',
        description: 'Temporarily hidden messages returning later',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" strokeWidth={1.8} />
            <polyline points="12 6 12 12 16 14" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        shortcut: 'G B',
        category: 'navigation',
        action: () => router.push('/snoozed'),
      },
      {
        id: 'archive',
        label: 'Open Archive',
        description: 'All archived historical messages',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline
              points="21 8 21 21 3 21 3 8"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="1" y="3" width="22" height="5" rx="1" strokeWidth={1.8} />
            <line x1="10" y1="12" x2="14" y2="12" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        shortcut: 'G E',
        category: 'navigation',
        action: () => router.push('/archive'),
      },
      {
        id: 'trash',
        label: 'Open Trash',
        description: 'Deleted conversations and drafts',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline points="3 6 5 6 21 6" strokeWidth={1.8} strokeLinecap="round" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
          </svg>
        ),
        shortcut: 'G T',
        category: 'navigation',
        action: () => router.push('/trash'),
      },
      {
        id: 'search',
        label: 'Search mail & contacts',
        description: 'Full-text query across subjects, bodies, and people',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" strokeWidth={1.8} />
            <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        shortcut: '/',
        category: 'navigation',
        action: () => router.push('/search'),
      },
      {
        id: 'calendar',
        label: 'Open QuantCalendar',
        description: 'Schedule meetings and view agenda timeline',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth={1.8} />
            <line x1="16" y1="2" x2="16" y2="6" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="8" y1="2" x2="8" y2="6" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="3" y1="10" x2="21" y2="10" strokeWidth={1.8} />
          </svg>
        ),
        shortcut: 'G C',
        category: 'navigation',
        action: () => router.push('/calendar'),
      },
      {
        id: 'drive',
        label: 'Open QuantDrive',
        description: 'Zero-knowledge encrypted cloud storage',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
            />
          </svg>
        ),
        shortcut: 'G V',
        category: 'navigation',
        action: () => router.push('/drive'),
      },
      {
        id: 'contacts',
        label: 'Open QuantContacts & Directory',
        description: 'Address book, organization records, and vCards',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
            />
            <circle cx="9" cy="7" r="4" strokeWidth={1.8} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
            />
          </svg>
        ),
        shortcut: 'G A',
        category: 'navigation',
        action: () => router.push('/contacts'),
      },
      {
        id: 'codehub',
        label: 'Open QuantCode (QuantGit)',
        description: 'Developer repositories, branches, and commits',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polyline
              points="16 18 22 12 16 6"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points="8 6 2 12 8 18"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ),
        shortcut: 'G K',
        category: 'navigation',
        action: () => router.push('/codehub'),
      },
      {
        id: 'security',
        label: 'Account Security & Vault',
        description: 'Two-factor auth, active sessions, and keys',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="3" y="11" width="18" height="11" rx="2" strokeWidth={1.8} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M7 11V7a5 5 0 0 1 10 0v4"
            />
          </svg>
        ),
        shortcut: 'G 2',
        category: 'navigation',
        action: () => router.push('/security'),
      },
      {
        id: 'settings',
        label: 'Settings & Preferences',
        description: 'Themes, typography, signatures, and sync',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" strokeWidth={1.8} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
            />
          </svg>
        ),
        shortcut: 'G ,',
        category: 'navigation',
        action: () => router.push('/settings'),
      },

      // Actions
      {
        id: 'action-meet',
        label: 'Schedule Video Conference',
        description: 'Generate 1-click video meeting room',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <polygon
              points="23 7 16 12 23 17 23 7"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="1" y="5" width="15" height="14" rx="2" strokeWidth={1.8} />
          </svg>
        ),
        category: 'actions',
        action: () => {
          router.push('/calendar');
          showToast({ text: 'Opening calendar scheduler…', type: 'info' });
        },
      },
      {
        id: 'action-new-folder',
        label: 'Create folder in Drive',
        description: 'Organize cloud files and shared assets',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
            />
            <line x1="12" y1="11" x2="12" y2="17" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="9" y1="14" x2="15" y2="14" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        category: 'actions',
        action: () => router.push('/drive'),
      },
      {
        id: 'action-new-repo',
        label: 'Create repository in QuantGit',
        description: 'Initialize git repo with workspace settings',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="18" r="3" strokeWidth={1.8} />
            <circle cx="6" cy="6" r="3" strokeWidth={1.8} />
            <circle cx="18" cy="6" r="3" strokeWidth={1.8} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9m6 3v3"
            />
          </svg>
        ),
        category: 'actions',
        action: () => router.push('/codehub'),
      },
      {
        id: 'action-new-contact',
        label: 'Add contact',
        description: 'Save email, phone, and organization details',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
            />
            <circle cx="9" cy="7" r="4" strokeWidth={1.8} />
            <line x1="19" y1="8" x2="19" y2="14" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="22" y1="11" x2="16" y2="11" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        category: 'actions',
        action: () => router.push('/contacts'),
      },

      // AI Commands
      {
        id: 'ai-compose',
        label: 'Quanty AI: Draft with Assistant',
        description: 'Autonomous context-aware email drafting',
        icon: (
          <svg
            className="w-4 h-4 text-[#FF8C42]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
            />
          </svg>
        ),
        category: 'ai',
        action: () => router.push('/compose'),
      },
      {
        id: 'ai-summarize',
        label: 'Quanty AI: Summarize priority threads',
        description: 'Extract action items and key discussion points',
        icon: (
          <svg
            className="w-4 h-4 text-[#FF8C42]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <line x1="21" y1="10" x2="3" y2="10" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="21" y1="6" x2="3" y2="6" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="21" y1="14" x2="3" y2="14" strokeWidth={1.8} strokeLinecap="round" />
            <line x1="21" y1="18" x2="7" y2="18" strokeWidth={1.8} strokeLinecap="round" />
          </svg>
        ),
        category: 'ai',
        action: () => {
          showToast({ text: 'Analyzing priority threads with Quanty…', type: 'info' });
          router.push('/');
        },
      },

      // Settings & Appearance
      {
        id: 'theme-dark',
        label: 'Appearance: Dark Foundation (Default)',
        description: 'Signature charcoal canvas (#090A0C) with orange accents',
        icon: (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.8}
              d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
            />
          </svg>
        ),
        category: 'settings',
        action: () => {
          document.documentElement.classList.add('dark');
          localStorage.setItem('quant-theme', 'dark');
          showToast({ text: 'Applied Quant Dark Foundation', type: 'info' });
        },
      },
    ],
    [router],
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.category.includes(q) ||
        (cmd.description?.toLowerCase().includes(q) ?? false),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    const handleOpenEvent = () => setIsOpen(true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('quant:command-palette:open', handleOpenEvent);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('quant:command-palette:open', handleOpenEvent);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    setIsOpen(false);
    cmd.action();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        executeCommand(filtered[activeIndex]);
      }
    },
    [activeIndex, executeCommand, filtered],
  );

  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const grouped = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [filtered]);

  const categoryLabels: Record<string, string> = {
    navigation: 'Workspaces & Views',
    actions: 'Quick Actions',
    ai: 'Quanty Intelligence',
    settings: 'Appearance & System',
  };

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[110]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-[#16181D] border border-[#282C35] shadow-2xl rounded-2xl overflow-hidden z-[120] flex flex-col max-h-[70vh]"
            role="dialog"
            aria-label="Quant Command Omnibar"
            initial={{ opacity: 0, scale: 0.98, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center px-4 py-3.5 border-b border-[#282C35] bg-[#111318]">
              <svg
                className="w-4 h-4 text-[#FF8C42] mr-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="command-palette-input"
                name="commandQuery"
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder-[#6B6E76] focus:outline-none"
                type="text"
                placeholder="Type a command, jump to a workspace, or search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="px-1.5 py-0.5 rounded border border-[#282C35] bg-[#16181D] text-[10px] font-mono text-[#A1A4AC]">
                Esc
              </kbd>
            </div>

            <div className="overflow-y-auto p-2 space-y-3" ref={listRef} role="listbox">
              {filtered.length === 0 && (
                <div className="py-8 text-center text-xs text-[#6B6E76]">
                  No commands match &ldquo;{query}&rdquo;
                </div>
              )}
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6B6E76]">
                    {categoryLabels[category] || category}
                  </div>
                  {items.map((item) => {
                    const idx = flatIndex++;
                    const isActive = idx === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                          isActive
                            ? 'bg-[#2B1A11] text-[#F5F5F5] border border-[#5C3016]'
                            : 'text-[#A1A4AC] hover:bg-[#111318] hover:text-[#F5F5F5] border border-transparent'
                        }`}
                        onClick={() => executeCommand(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`shrink-0 ${isActive ? 'text-[#FF8C42]' : 'text-[#6B6E76]'}`}
                            aria-hidden="true"
                          >
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-semibold truncate text-[#F5F5F5]">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="block text-[11px] text-[#A1A4AC] truncate">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.shortcut && (
                          <kbd
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ml-2 ${
                              isActive
                                ? 'border-[#5C3016] bg-[#1D1410] text-[#FF8C42]'
                                : 'border-[#282C35] bg-[#111318] text-[#6B6E76]'
                            }`}
                          >
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <footer className="px-4 py-2 border-t border-[#282C35] bg-[#111318] flex items-center justify-between text-[11px] text-[#6B6E76]">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="font-mono text-[#A1A4AC]">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="font-mono text-[#A1A4AC]">↵</kbd> select
                </span>
                <span>
                  <kbd className="font-mono text-[#A1A4AC]">esc</kbd> close
                </span>
              </div>
              <span className="text-[10px] text-[#FF8C42] font-medium">Quant Omnibar</span>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
