'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['J'], description: 'Next email' },
      { keys: ['K'], description: 'Previous email' },
      { keys: ['Enter'], description: 'Open email' },
      { keys: ['Esc'], description: 'Close / deselect' },
      { keys: ['G', 'I'], description: 'Go to inbox' },
      { keys: ['G', 'S'], description: 'Go to sent' },
      { keys: ['G', 'D'], description: 'Go to drafts' },
      { keys: ['G', 'T'], description: 'Go to trash' },
      { keys: ['/'], description: 'Search' },
      { keys: ['C'], description: 'Compose' },
      { keys: ['['], description: 'Toggle sidebar' },
      { keys: ['⌘', 'K'], description: 'Command palette' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['E'], description: 'Archive' },
      { keys: ['#'], description: 'Delete' },
      { keys: ['S'], description: 'Star / unstar' },
      { keys: ['U'], description: 'Mark read / unread' },
      { keys: ['X'], description: 'Select / deselect' },
      { keys: ['R'], description: 'Reply' },
      { keys: ['F'], description: 'Forward' },
      { keys: ['Z'], description: 'Undo last action' },
    ],
  },
  {
    title: 'Composer',
    shortcuts: [
      { keys: ['⌘', 'Enter'], description: 'Send' },
      { keys: ['⌘', 'S'], description: 'Save draft' },
      { keys: ['⌘', 'Shift', 'C'], description: 'Toggle Cc' },
      { keys: ['⌘', 'Shift', 'B'], description: 'Toggle Bcc' },
    ],
  },
];

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="shortcuts-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-label="Keyboard shortcuts"
          aria-modal="true"
        >
          <motion.div
            className="shortcuts-panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="shortcuts-header">
              <h2>Keyboard shortcuts</h2>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close">×</button>
            </header>
            <div className="shortcuts-body">
              {SHORTCUT_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  <ul>
                    {group.shortcuts.map((shortcut) => (
                      <li key={shortcut.description}>
                        <span className="shortcut-desc">{shortcut.description}</span>
                        <span className="shortcut-keys">
                          {shortcut.keys.map((key) => (
                            <kbd key={key}>{key}</kbd>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <footer className="shortcuts-footer">
              <span>Press <kbd>?</kbd> to toggle this panel</span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
