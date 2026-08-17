'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { showToast } from './InboxToast';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: string;
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
        label: 'Go to Inbox',
        description: 'View all email threads and messages',
        icon: '📥',
        category: 'navigation',
        action: () => router.push('/'),
      },
      {
        id: 'compose',
        label: 'Compose new message',
        description: 'Write an email with Quanty AI assistant',
        icon: '✏️',
        shortcut: 'C',
        category: 'navigation',
        action: () => router.push('/compose'),
      },
      {
        id: 'calendar',
        label: 'Open Calendar',
        description: 'Schedule meetings and view agenda',
        icon: '📅',
        category: 'navigation',
        action: () => router.push('/calendar'),
      },
      {
        id: 'drive',
        label: 'Open QuantDrive',
        description: 'Zero-knowledge encrypted cloud files',
        icon: '📁',
        category: 'navigation',
        action: () => router.push('/drive'),
      },
      {
        id: 'contacts',
        label: 'Open Contacts & Directory',
        description: 'Address book and vCard manager',
        icon: '👥',
        category: 'navigation',
        action: () => router.push('/contacts'),
      },
      {
        id: 'codehub',
        label: 'Open CodeHub',
        description: 'Repositories, agent fleets, and CI pipelines',
        icon: '💻',
        category: 'navigation',
        action: () => router.push('/codehub'),
      },
      {
        id: 'settings',
        label: 'Open Settings & Preferences',
        description: 'Themes, E2EE vault, and signatures',
        icon: '⚙️',
        category: 'navigation',
        action: () => router.push('/settings'),
      },

      // Actions
      {
        id: 'action-meet',
        label: 'Schedule QuantMeet Video Call',
        description: 'Generate 1-click video conference room',
        icon: '🎥',
        category: 'actions',
        action: () => {
          router.push('/calendar');
          showToast({ text: 'Opening calendar scheduler…', type: 'info' });
        },
      },
      {
        id: 'action-new-folder',
        label: 'Create new folder in Drive',
        description: 'Organize cloud files and mail attachments',
        icon: '📂',
        category: 'actions',
        action: () => router.push('/drive'),
      },
      {
        id: 'action-new-repo',
        label: 'Create repository in CodeHub',
        description: 'Scaffold repo with autonomous agent setup',
        icon: '🐙',
        category: 'actions',
        action: () => router.push('/codehub'),
      },
      {
        id: 'action-new-contact',
        label: 'Add new contact',
        description: 'Save email, phone, and organization details',
        icon: '👤',
        category: 'actions',
        action: () => router.push('/contacts'),
      },

      // AI Commands
      {
        id: 'ai-compose',
        label: 'QuantAI: Write draft with Cloudflare AI',
        description: 'Autonomous edge LLM email drafting',
        icon: '✨',
        category: 'ai',
        action: () => router.push('/compose'),
      },
      {
        id: 'ai-summarize',
        label: 'QuantAI: Summarize inbox',
        description: 'Extract top priorities and action items',
        icon: '📋',
        category: 'ai',
        action: () => {
          showToast({ text: 'Analyzing inbox with Cloudflare Workers AI…', type: 'info' });
          router.push('/');
        },
      },

      // Settings & Themes
      {
        id: 'theme-obsidian',
        label: 'Theme: Obsidian OLED (Dark)',
        description: 'Deep pure black aesthetic',
        icon: '🌙',
        category: 'settings',
        action: () => {
          document.documentElement.classList.add('dark');
          localStorage.setItem('quant-theme', 'dark');
          showToast({ text: 'Switched to Obsidian OLED theme', type: 'info' });
        },
      },
      {
        id: 'theme-midnight',
        label: 'Theme: Midnight Blue',
        description: 'Deep cosmic slate aesthetic',
        icon: '🌌',
        category: 'settings',
        action: () => {
          document.documentElement.classList.add('dark');
          localStorage.setItem('quant-theme', 'midnight');
          showToast({ text: 'Switched to Midnight Blue theme', type: 'info' });
        },
      },
      {
        id: 'accent-saffron',
        label: 'Accent: Bharat Saffron',
        description: 'Warm energetic saffron tone',
        icon: '🟠',
        category: 'settings',
        action: () => {
          localStorage.setItem('quant-accent', '#ff9933');
          document.documentElement.style.setProperty('--brand-primary', '#ff9933');
          showToast({ text: 'Set accent to Bharat Saffron', type: 'info' });
        },
      },
      {
        id: 'accent-emerald',
        label: 'Accent: Emerald Vault',
        description: 'Cryptographic green tone',
        icon: '🟢',
        category: 'settings',
        action: () => {
          localStorage.setItem('quant-accent', '#10b981');
          document.documentElement.style.setProperty('--brand-primary', '#10b981');
          showToast({ text: 'Set accent to Emerald Vault', type: 'info' });
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
    navigation: 'Navigation',
    actions: 'Quick Actions',
    ai: 'Cloudflare AI Assistant',
    settings: 'Appearance & System',
  };

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            className="fixed top-[15%] left-1/2 -translate-x-1/2 w-full max-w-xl bg-zinc-950/95 border border-zinc-800 shadow-2xl rounded-2xl overflow-hidden z-50 flex flex-col max-h-[70vh]"
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          >
            <div className="flex items-center px-4 py-3.5 border-b border-zinc-800 bg-zinc-900/60">
              <svg
                className="size-4 text-[#ff9933] mr-3 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
              <input
                ref={inputRef}
                className="flex-1 bg-transparent text-sm text-white placeholder-zinc-500 focus:outline-none"
                type="text"
                placeholder="Type a command, navigate, or search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-[10px] font-mono text-zinc-400">
                Esc
              </kbd>
            </div>

            <div className="overflow-y-auto p-2 space-y-3" ref={listRef} role="listbox">
              {filtered.length === 0 && (
                <div className="py-8 text-center text-xs text-zinc-500">
                  No commands match &ldquo;{query}&rdquo;
                </div>
              )}
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="space-y-1">
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
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
                            ? 'bg-[#ff9933]/15 text-white border border-[#ff9933]/30'
                            : 'text-zinc-300 hover:bg-zinc-900 border border-transparent'
                        }`}
                        onClick={() => executeCommand(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-base" aria-hidden="true">
                            {item.icon}
                          </span>
                          <div className="min-w-0">
                            <span className="block text-xs font-semibold truncate text-white">
                              {item.label}
                            </span>
                            {item.description && (
                              <span className="block text-[11px] text-zinc-400 truncate">
                                {item.description}
                              </span>
                            )}
                          </div>
                        </div>
                        {item.shortcut && (
                          <kbd className="px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-[10px] font-mono text-[#ff9933] shrink-0 ml-2">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <footer className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-[11px] text-zinc-500">
              <div className="flex items-center gap-3">
                <span>
                  <kbd className="font-mono text-zinc-400">↑↓</kbd> navigate
                </span>
                <span>
                  <kbd className="font-mono text-zinc-400">↵</kbd> select
                </span>
                <span>
                  <kbd className="font-mono text-zinc-400">esc</kbd> close
                </span>
              </div>
              <span className="text-[10px] text-[#ff9933] font-medium">Quant Omnibar</span>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
