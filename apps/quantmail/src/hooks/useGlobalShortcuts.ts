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

      // Gmail-style "g" prefix combos: g+i=inbox, g+s=sent, g+d=drafts, g+t=trash, g+c=calendar, etc.
      if (gPressed) {
        gPressed = false;
        if (gTimeout) clearTimeout(gTimeout);
        switch (e.key.toLowerCase()) {
          case 'i':
            e.preventDefault();
            router.push('/');
            break;
          case 's':
            e.preventDefault();
            router.push('/sent');
            break;
          case 'd':
            e.preventDefault();
            router.push('/drafts');
            break;
          case 't':
            e.preventDefault();
            router.push('/trash');
            break;
          case 'a':
            e.preventDefault();
            router.push('/contacts');
            break;
          case 'c':
          case 'l':
            e.preventDefault();
            router.push('/calendar');
            break;
          case 'v':
            e.preventDefault();
            router.push('/drive');
            break;
          case 'k':
          case 'r':
          case 'p':
            e.preventDefault();
            router.push('/codehub');
            break;
          case 'e':
            e.preventDefault();
            router.push('/archive');
            break;
          case 'b':
            e.preventDefault();
            router.push('/snoozed');
            break;
          case '*':
            e.preventDefault();
            router.push('/starred');
            break;
          case '!':
            e.preventDefault();
            router.push('/spam');
            break;
          case ',':
            e.preventDefault();
            router.push('/settings');
            break;
          case '2':
            e.preventDefault();
            router.push('/security');
            break;
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
        case 'r':
        case 'R': {
          const replyInput = document.getElementById('chatbot-reply-input');
          if (replyInput) {
            e.preventDefault();
            replyInput.focus();
          }
          break;
        }
        case '[':
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('quant:sidebar:toggle'));
          break;
        case 't':
        case 'T': {
          e.preventDefault();
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
          const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', nextTheme);
          document.documentElement.classList.toggle('dark', nextTheme === 'dark');
          try {
            localStorage.setItem('quant-theme', nextTheme);
          } catch {}
          break;
        }
        case 'g':
          // Start "go to" prefix — wait for next key
          e.preventDefault();
          gPressed = true;
          gTimeout = setTimeout(() => {
            gPressed = false;
          }, 1200);
          break;
        case 'z':
          // Handled by undo system
          break;
        case '?':
          // Handled by KeyboardShortcutsHelp component
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
