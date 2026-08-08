'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Email } from '../types';

/**
 * Superhuman-style J/K keyboard navigation for the inbox.
 * Also adds:
 * - E = archive focused email
 * - # = delete focused email
 * - R = reply to focused email
 * - S = star/unstar focused email
 * - X = toggle select focused email
 * - Enter/O = open focused email
 * - Escape = deselect / close reading pane
 */
export function useInboxKeyboard(options: {
  emails: Email[] | undefined;
  selectedEmail: Email | null;
  onSelectEmail: (email: Email | null) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkUnread: (id: string) => void;
}) {
  const {
    emails,
    selectedEmail,
    onSelectEmail,
    onArchive,
    onDelete,
    onToggleStar,
    onToggleSelect,
    onMarkRead,
    onMarkUnread,
  } = options;

  const router = useRouter();
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync focused index when selectedEmail changes externally
  useEffect(() => {
    if (!selectedEmail || !emails) {
      setFocusedIndex(-1);
      return;
    }
    const idx = emails.findIndex((e) => e.id === selectedEmail.id);
    if (idx !== -1) setFocusedIndex(idx);
  }, [selectedEmail, emails]);

  const focusedEmail = emails && focusedIndex >= 0 ? emails[focusedIndex] : null;

  const scrollToFocused = useCallback((index: number) => {
    if (!listRef.current) return;
    const rows = listRef.current.querySelectorAll('.mail-row-shell');
    const row = rows[index] as HTMLElement | undefined;
    if (row) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable ||
        target.closest('[role="dialog"]') ||
        target.closest('.command-palette') ||
        target.closest('.snooze-menu')
      ) {
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!emails || emails.length === 0) return;

      switch (e.key) {
        case 'j':
        case 'J':
        case 'ArrowDown': {
          e.preventDefault();
          const next = Math.min(focusedIndex + 1, emails.length - 1);
          setFocusedIndex(next);
          onSelectEmail(emails[next]);
          scrollToFocused(next);
          break;
        }
        case 'k':
        case 'K':
        case 'ArrowUp': {
          e.preventDefault();
          const prev = Math.max(focusedIndex - 1, 0);
          setFocusedIndex(prev);
          onSelectEmail(emails[prev]);
          scrollToFocused(prev);
          break;
        }
        case 'Enter':
        case 'o':
        case 'O': {
          e.preventDefault();
          if (focusedEmail) {
            onSelectEmail(focusedEmail);
          }
          break;
        }
        case 'e':
        case 'E': {
          e.preventDefault();
          if (focusedEmail) {
            onArchive(focusedEmail.id);
            // Move focus to next
            const next = Math.min(focusedIndex + 1, emails.length - 1);
            setFocusedIndex(next);
            if (emails[next] && emails[next].id !== focusedEmail.id) {
              onSelectEmail(emails[next]);
            }
          }
          break;
        }
        case '#': {
          e.preventDefault();
          if (focusedEmail) {
            onDelete(focusedEmail.id);
            const next = Math.min(focusedIndex + 1, emails.length - 1);
            setFocusedIndex(next);
          }
          break;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          if (focusedEmail) onToggleStar(focusedEmail.id);
          break;
        }
        case 'x':
        case 'X': {
          e.preventDefault();
          if (focusedEmail) onToggleSelect(focusedEmail.id);
          break;
        }
        case 'r':
        case 'R': {
          e.preventDefault();
          if (focusedEmail) {
            router.push(`/compose?replyTo=${focusedEmail.threadId}`);
          }
          break;
        }
        case 'f':
        case 'F': {
          e.preventDefault();
          if (focusedEmail) {
            router.push(`/compose?forward=${focusedEmail.id}`);
          }
          break;
        }
        case 'u':
        case 'U': {
          // Toggle read/unread
          e.preventDefault();
          if (focusedEmail) {
            if (focusedEmail.isRead) onMarkUnread(focusedEmail.id);
            else onMarkRead(focusedEmail.id);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          onSelectEmail(null);
          setFocusedIndex(-1);
          break;
        }
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [emails, focusedIndex, focusedEmail, onSelectEmail, onArchive, onDelete, onToggleStar, onToggleSelect, onMarkRead, onMarkUnread, router, scrollToFocused]);

  return { focusedIndex, listRef };
}
