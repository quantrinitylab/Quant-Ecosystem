'use client';

/**
 * The application's single keyboard surface.
 *
 * Replaces `GlobalShortcutsProvider`, which owned one of the fifteen competing
 * `document.addEventListener('keydown', …)` calls in the app. This mounts the
 * engine's one listener, registers every global command in the registry — so the
 * palette and the shortcuts sheet are generated from the same source the keys
 * are bound from — and renders the sequence hint that tells the user a `g` is
 * being held.
 *
 * It also owns the two global overlays' open state. Previously the palette
 * listened for ⌘K itself, `AppProviders` listened for ⌘K *again* into state
 * nothing rendered, and the palette's "show shortcuts" entry dispatched a
 * synthetic `KeyboardEvent` at the document to reach the help sheet. All three
 * are now plain function calls through this context.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { hasPendingUndo, runPendingUndo } from './InboxToast';
import { keyboardEngine } from '../lib/keyboard/engine';
import { useRegisterCommands, usePendingChords } from '../lib/keyboard/hooks';
import { chordToLabelParts } from '../lib/keyboard/chords';
import type { Command } from '../lib/keyboard/command-registry';
import { startOutbox } from '../lib/offline/outbox';

interface KeyboardSurfaces {
  isPaletteOpen: boolean;
  openPalette: () => void;
  closePalette: () => void;
  isHelpOpen: boolean;
  openHelp: () => void;
  closeHelp: () => void;
}

const KeyboardSurfacesContext = createContext<KeyboardSurfaces | null>(null);

/**
 * Control the command palette and shortcuts sheet from anywhere.
 *
 * Safe to call outside the provider — returns inert no-ops rather than throwing,
 * so a component can offer a "⌘K" affordance without depending on mount order.
 */
export function useKeyboardSurfaces(): KeyboardSurfaces {
  return useContext(KeyboardSurfacesContext) ?? INERT_SURFACES;
}

const INERT_SURFACES: KeyboardSurfaces = {
  isPaletteOpen: false,
  openPalette: () => {},
  closePalette: () => {},
  isHelpOpen: false,
  openHelp: () => {},
  closeHelp: () => {},
};

function setTheme(next: 'dark' | 'light'): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', next);
  root.classList.toggle('dark', next === 'dark');
  root.style.colorScheme = next;
  try {
    localStorage.setItem('quant-theme', next);
  } catch {
    // Private browsing — the DOM change still applies for this session.
  }
}

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPaletteOpen, setPaletteOpen] = useState(false);
  const [isHelpOpen, setHelpOpen] = useState(false);

  // One listener for the whole app. Reference counted, so a Fast Refresh
  // remount cannot leave a second one behind.
  useEffect(() => keyboardEngine.attach(), []);

  // Replay any mutations left queued by a previous session.
  useEffect(() => startOutbox(), []);

  /**
   * Both overlays render above the navigation drawer, so opening one while the
   * drawer is out would stack two modals and leave the drawer's focus trap
   * fighting the palette's. Closing it first is what a user pressing ⌘K from an
   * open drawer means anyway: they are done with the drawer.
   */
  const dismissDrawer = useCallback(() => {
    window.dispatchEvent(new CustomEvent('quant:sidebar:close'));
  }, []);

  const openPalette = useCallback(() => {
    dismissDrawer();
    setHelpOpen(false);
    setPaletteOpen(true);
  }, [dismissDrawer]);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openHelp = useCallback(() => {
    dismissDrawer();
    setPaletteOpen(false);
    setHelpOpen(true);
  }, [dismissDrawer]);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  const surfaces = useMemo<KeyboardSurfaces>(
    () => ({ isPaletteOpen, openPalette, closePalette, isHelpOpen, openHelp, closeHelp }),
    [isPaletteOpen, openPalette, closePalette, isHelpOpen, openHelp, closeHelp],
  );

  const go = useCallback(
    (path: string) => () => {
      setPaletteOpen(false);
      router.push(path);
    },
    [router],
  );

  // Rebuilt every render and registered by structural signature, so the closures
  // stay fresh without churning the engine's binding table.
  const commands: Command[] = [
    // ── Navigation ────────────────────────────────────────────────────────────
    {
      id: 'nav.inbox',
      label: 'Go to inbox',
      group: 'Navigation',
      keys: 'g i',
      icon: 'inbox',
      keywords: ['mail', 'priority', 'home'],
      run: go('/'),
    },
    {
      id: 'nav.sent',
      label: 'Go to sent',
      group: 'Navigation',
      keys: 'g s',
      icon: 'send',
      keywords: ['outbox', 'delivered'],
      run: go('/sent'),
    },
    {
      id: 'nav.drafts',
      label: 'Go to drafts',
      group: 'Navigation',
      keys: 'g d',
      icon: 'draft',
      keywords: ['unsent', 'saved'],
      run: go('/drafts'),
    },
    {
      id: 'nav.starred',
      label: 'Go to starred',
      group: 'Navigation',
      keys: 'g *',
      icon: 'star',
      keywords: ['pinned', 'important', 'flagged'],
      run: go('/starred'),
    },
    {
      id: 'nav.snoozed',
      label: 'Go to snoozed',
      group: 'Navigation',
      keys: 'g b',
      icon: 'clock',
      keywords: ['later', 'deferred', 'remind'],
      run: go('/snoozed'),
    },
    {
      id: 'nav.archive',
      label: 'Go to archive',
      group: 'Navigation',
      keys: 'g e',
      icon: 'archive',
      keywords: ['all mail', 'history'],
      run: go('/archive'),
    },
    {
      id: 'nav.trash',
      label: 'Go to trash',
      group: 'Navigation',
      keys: 'g t',
      icon: 'trash',
      keywords: ['deleted', 'bin'],
      run: go('/trash'),
    },
    {
      id: 'nav.spam',
      label: 'Go to spam',
      group: 'Navigation',
      keys: 'g !',
      icon: 'spam',
      keywords: ['junk', 'phishing'],
      run: go('/spam'),
    },
    {
      id: 'nav.search',
      label: 'Search mail',
      group: 'Navigation',
      keys: '/',
      icon: 'search',
      description: 'Full-text search across subjects, bodies and people',
      keywords: ['find', 'query', 'filter'],
      run: go('/search'),
    },
    // ── Apps ──────────────────────────────────────────────────────────────────
    // Separate from Navigation: these leave QuantMail. Keeping them together
    // with the mailbox jumps made one 13-row section that no two-column layout
    // could balance, and told the reader that `g s` and `g c` do the same sort
    // of thing.
    {
      id: 'nav.calendar',
      label: 'Go to QuantCalendar',
      group: 'Apps',
      keys: ['g c', 'g l'],
      icon: 'calendar',
      keywords: ['schedule', 'agenda', 'meetings', 'events'],
      run: go('/calendar'),
    },
    {
      id: 'nav.contacts',
      label: 'Go to QuantContacts',
      group: 'Apps',
      keys: 'g a',
      icon: 'contacts',
      keywords: ['address book', 'directory', 'people'],
      run: go('/contacts'),
    },
    {
      id: 'nav.drive',
      label: 'Go to QuantDrive',
      group: 'Apps',
      keys: 'g v',
      icon: 'drive',
      keywords: ['files', 'storage', 'documents', 'encrypted'],
      run: go('/drive'),
    },
    {
      id: 'nav.codehub',
      label: 'Go to CodeHub',
      group: 'Apps',
      keys: ['g k', 'g p'],
      icon: 'code',
      keywords: ['git', 'repositories', 'branches', 'pull requests'],
      run: go('/codehub'),
    },

    // ── Compose ───────────────────────────────────────────────────────────────
    {
      id: 'compose.new',
      label: 'Compose message',
      group: 'Compose',
      keys: 'c',
      icon: 'compose',
      description: 'Start a new message with Quanty assistance',
      keywords: ['write', 'new mail', 'draft'],
      run: go('/compose'),
    },
    {
      id: 'compose.replyInline',
      label: 'Focus inline reply',
      group: 'Compose',
      keys: 'r',
      icon: 'reply',
      hidden: true,
      // The sheet already lists `inbox.reply` on `r`; printing this one too put two
      // different Compose rows on the same key, which reads as a conflict rather
      // than as the same key doing the contextual thing.
      hiddenInHelp: true,
      // Only claims `r` when an inline reply box is actually on screen; the inbox
      // binds its own `r` in a deeper scope, which takes precedence there.
      enabled: () =>
        typeof document !== 'undefined' && document.getElementById('chatbot-reply-input') !== null,
      run: () => document.getElementById('chatbot-reply-input')?.focus(),
    },

    // ── Conversation ──────────────────────────────────────────────────────────
    {
      id: 'mail.undo',
      label: 'Undo last action',
      group: 'Conversation',
      keys: 'z',
      icon: 'undo',
      description: 'Reverses the last archive, trash or snooze while its confirmation is on screen',
      keywords: ['revert', 'restore', 'oops', 'back'],
      // Global rather than inbox-scoped: an archive confirmed from the reading
      // pane or a folder view is just as reversible as one from the list.
      enabled: hasPendingUndo,
      run: () => {
        runPendingUndo();
      },
    },

    // ── View ──────────────────────────────────────────────────────────────────
    {
      id: 'view.commandPalette',
      label: 'Open command palette',
      group: 'View',
      keys: ['mod+k', 'mod+shift+p'],
      icon: 'command',
      keywords: ['omnibar', 'commands', 'run'],
      allowInInput: true,
      // The one shortcut that must work from anywhere, including from inside the
      // navigation drawer and the snooze menu, which mask every other binding.
      unmaskable: true,
      run: openPalette,
    },
    {
      id: 'view.shortcuts',
      label: 'Show keyboard shortcuts',
      group: 'View',
      keys: '?',
      icon: 'keyboard',
      keywords: ['help', 'cheat sheet', 'keys'],
      unmaskable: true,
      run: openHelp,
    },
    {
      id: 'view.toggleSidebar',
      label: 'Toggle sidebar',
      group: 'View',
      keys: '[',
      icon: 'sidebar',
      keywords: ['collapse', 'expand', 'navigation'],
      run: () => window.dispatchEvent(new CustomEvent('quant:sidebar:toggle')),
    },
    {
      id: 'view.refresh',
      label: 'Refresh mail',
      group: 'View',
      // Palette-only: the obvious keys (⌘R, ⌘⇧R) are reserved browser reloads
      // that Chrome will not let a page cancel.
      icon: 'refresh',
      keywords: ['sync', 'reload', 'fetch'],
      run: () => {
        setPaletteOpen(false);
        window.dispatchEvent(new CustomEvent('quant:refresh'));
      },
    },
    {
      id: 'view.themeDark',
      label: 'Use dark theme',
      group: 'View',
      icon: 'moon',
      description: 'Charcoal canvas with the Quant orange accent',
      keywords: ['appearance', 'night'],
      run: () => {
        setPaletteOpen(false);
        setTheme('dark');
      },
    },
    {
      id: 'view.themeLight',
      label: 'Use light theme',
      group: 'View',
      icon: 'sun',
      keywords: ['appearance', 'day', 'bright'],
      run: () => {
        setPaletteOpen(false);
        setTheme('light');
      },
    },
    {
      id: 'view.themeToggle',
      label: 'Toggle theme',
      group: 'View',
      keys: 't',
      icon: 'sun',
      keywords: ['dark', 'light', 'appearance'],
      run: () => {
        const current = document.documentElement.getAttribute('data-theme') ?? 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
      },
    },

    // ── Account ───────────────────────────────────────────────────────────────
    {
      id: 'account.settings',
      label: 'Open settings',
      group: 'Account',
      keys: 'g ,',
      icon: 'settings',
      keywords: ['preferences', 'signature', 'theme', 'sync'],
      run: go('/settings'),
    },
    {
      id: 'account.security',
      label: 'Open security & 2FA',
      group: 'Account',
      keys: 'g 2',
      icon: 'lock',
      keywords: ['password', 'sessions', 'two factor', 'keys'],
      run: go('/security'),
    },
  ];

  useRegisterCommands(commands);

  return (
    <KeyboardSurfacesContext.Provider value={surfaces}>
      {children}
      <SequenceHint />
    </KeyboardSurfacesContext.Provider>
  );
}

/**
 * Shows the chords typed so far while a sequence is in flight, so pressing `g`
 * is visibly a state rather than a key that did nothing.
 */
function SequenceHint() {
  const pending = usePendingChords();
  if (pending.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-5 left-5 z-[130] flex items-center gap-2 rounded-xl border border-[#5C3016] bg-[#2B1A11] px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.6)]"
      role="status"
      aria-live="polite"
    >
      {pending.map((chord, index) => (
        <kbd
          key={`${chord}-${index}`}
          className="rounded-md border border-[#5C3016] bg-[#16181D] px-1.5 py-0.5 font-mono text-[11px] text-[#FF8C42]"
        >
          {chordToLabelParts(chord).join(' ')}
        </kbd>
      ))}
      <span className="text-[11px] text-[#A1A4AC]">waiting for next key…</span>
    </div>
  );
}
