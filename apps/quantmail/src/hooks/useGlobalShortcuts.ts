'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Global keyboard shortcuts — Superhuman-style single-key navigation.
 * Only activates when no input/textarea/contenteditable is focused.
 * Supports Gmail-style "g" prefix key combos.
 */
export function useGlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let gPressed = false;
    let gTimeout: ReturnType<typeof setTimeout> | null = null;

    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
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

      // Don't trigger with modifier keys (except Cmd+K which is handled by CommandPalette)
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Gmail-style "g" prefix combos: g+i=inbox, g+s=sent, g+d=drafts, g+t=trash
      if (gPressed) {
        gPressed = false;
        if (gTimeout) clearTimeout(gTimeout);
        switch (e.key) {
          case 'i': e.preventDefault(); router.push('/'); break;
          case 's': e.preventDefault(); router.push('/sent'); break;
          case 'd': e.preventDefault(); router.push('/drafts'); break;
          case 't': e.preventDefault(); router.push('/trash'); break;
          case 'c': e.preventDefault(); router.push('/contacts'); break;
          case 'l': e.preventDefault(); router.push('/calendar'); break;
          case 'r': e.preventDefault(); router.push('/repos'); break;
          case 'p': e.preventDefault(); router.push('/pipelines'); break;
        }
        return;
      }

      switch (e.key) {
        case 'c':
        case 'C':
          e.preventDefault();
          router.push('/compose');
          break;
        case '/':
          e.preventDefault();
          router.push('/search');
          break;
        case 'g':
          // Start "go to" prefix — wait for next key
          e.preventDefault();
          gPressed = true;
          gTimeout = setTimeout(() => { gPressed = false; }, 1000);
          break;
        case 'z':
          // Undo last action — handled by toast system
          break;
        case '?':
          // Keyboard shortcuts help — handled by KeyboardShortcutsHelp component
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      if (gTimeout) clearTimeout(gTimeout);
    };
  }, [router]);
}
