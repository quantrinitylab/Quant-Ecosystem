'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';

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
      { id: 'inbox', label: 'Go to Inbox', icon: '📥', category: 'navigation', action: () => router.push('/') },
      { id: 'compose', label: 'Compose new message', icon: '✏️', shortcut: 'C', category: 'navigation', action: () => router.push('/compose') },
      { id: 'sent', label: 'Go to Sent', icon: '📤', category: 'navigation', action: () => router.push('/sent') },
      { id: 'drafts', label: 'Go to Drafts', icon: '📝', category: 'navigation', action: () => router.push('/drafts') },
      { id: 'search', label: 'Search emails', icon: '🔍', shortcut: '/', category: 'navigation', action: () => router.push('/search') },
      { id: 'calendar', label: 'Open Calendar', icon: '📅', category: 'navigation', action: () => router.push('/calendar') },
      { id: 'contacts', label: 'Open Contacts', icon: '👥', category: 'navigation', action: () => router.push('/contacts') },
      { id: 'drive', label: 'Open Drive', icon: '📁', category: 'navigation', action: () => router.push('/drive') },
      { id: 'repos', label: 'Open Repos', icon: '💻', category: 'navigation', action: () => router.push('/repos') },
      { id: 'pipelines', label: 'Open Pipelines', icon: '🔧', category: 'navigation', action: () => router.push('/pipelines') },
      { id: 'settings', label: 'Open Settings', icon: '⚙️', category: 'navigation', action: () => router.push('/settings') },
      { id: 'security', label: 'Security settings', icon: '🔒', category: 'navigation', action: () => router.push('/security') },
      // Actions
      { id: 'theme-dark', label: 'Switch to dark theme', icon: '🌙', category: 'settings', action: () => { document.documentElement.setAttribute('data-theme', 'dark'); document.documentElement.classList.add('dark'); localStorage.setItem('quant-theme', 'dark'); } },
      { id: 'theme-light', label: 'Switch to light theme', icon: '☀️', category: 'settings', action: () => { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.classList.remove('dark'); localStorage.setItem('quant-theme', 'light'); } },
      { id: 'mark-all-read', label: 'Mark all as read', icon: '✓', category: 'actions', action: () => {} },
      { id: 'empty-trash', label: 'Empty trash', icon: '🗑️', category: 'actions', action: () => router.push('/trash') },
      // AI
      { id: 'ai-compose', label: 'AI: Write an email for me', icon: '✨', category: 'ai', action: () => router.push('/compose') },
      { id: 'ai-summarize', label: 'AI: Summarize inbox', icon: '📋', category: 'ai', action: () => {} },
      { id: 'ai-prioritize', label: 'AI: Prioritize emails', icon: '🎯', category: 'ai', action: () => {} },
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      setIsOpen(false);
      cmd.action();
    },
    [],
  );

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

  // Scroll active item into view
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
    actions: 'Actions',
    ai: 'AI Assistant',
    settings: 'Settings',
  };

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="command-palette-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <motion.div
            className="command-palette"
            role="dialog"
            aria-label="Command palette"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18, ease: [0, 0, 0.2, 1] }}
          >
            <div className="command-palette-input-wrap">
              <svg className="command-palette-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
              </svg>
              <input
                ref={inputRef}
                className="command-palette-input"
                type="text"
                placeholder="Type a command or search…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="command-palette-esc">Esc</kbd>
            </div>
            <div className="command-palette-list" ref={listRef} role="listbox">
              {filtered.length === 0 && (
                <div className="command-palette-empty">
                  No commands match &ldquo;{query}&rdquo;
                </div>
              )}
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category} className="command-palette-group">
                  <div className="command-palette-group-label">{categoryLabels[category] || category}</div>
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
                        className={`command-palette-item ${isActive ? 'is-active' : ''}`}
                        onClick={() => executeCommand(item)}
                        onMouseEnter={() => setActiveIndex(idx)}
                      >
                        <span className="command-palette-item-icon" aria-hidden="true">{item.icon}</span>
                        <span className="command-palette-item-label">{item.label}</span>
                        {item.shortcut && (
                          <kbd className="command-palette-item-shortcut">{item.shortcut}</kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <footer className="command-palette-footer">
              <span><kbd>↑↓</kbd> navigate</span>
              <span><kbd>↵</kbd> select</span>
              <span><kbd>esc</kbd> close</span>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
