'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPaletteUI, QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { MailCopilot } from '../components/MailCopilot';
import { useAuth } from './auth-provider';

const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password'];

/**
 * Contextual floating action button (bottom-right).
 * - Mail surfaces (inbox, folders, threads, search, labels) → compose a mail
 * - Calendar → add an event (opens the calendar's New event modal)
 * - Everywhere else (CodeHub, Drive, Repos, Pipelines, Settings…) → hidden,
 *   so the + never leaks into non-mail contexts.
 */
const MAIL_FAB_ROUTES = [
  '/',
  '/starred',
  '/snoozed',
  '/sent',
  '/drafts',
  '/archive',
  '/spam',
  '/trash',
  '/thread',
  '/labels',
  '/search',
];

function ContextFab() {
  return null;
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.includes(pathname ?? '');
  // Only show AI copilot and command palette when user is actually logged in
  const showTools = isAuthenticated && !isPublicAuthRoute && !isLoading;

  const navigate = (path: string) => {
    router.push(path);
    setCommandPaletteOpen(false);
  };

  const commands: CommandPaletteItem[] = [
    // Create
    {
      id: 'compose',
      label: 'Compose a new message',
      shortcut: 'C',
      group: 'Create',
      action: () => navigate('/compose'),
    },
    // Find
    {
      id: 'search',
      label: 'Search mail, contacts, and keywords',
      shortcut: '/',
      group: 'Find',
      action: () => navigate('/search'),
    },
    // Mail
    {
      id: 'inbox',
      label: 'Open priority inbox',
      shortcut: 'G I',
      group: 'Mail',
      action: () => navigate('/'),
    },
    {
      id: 'sent',
      label: 'Open sent mail',
      shortcut: 'G S',
      group: 'Mail',
      action: () => navigate('/sent'),
    },
    {
      id: 'drafts',
      label: 'Open drafts',
      shortcut: 'G D',
      group: 'Mail',
      action: () => navigate('/drafts'),
    },
    {
      id: 'starred',
      label: 'Open starred messages',
      shortcut: 'G *',
      group: 'Mail',
      action: () => navigate('/starred'),
    },
    {
      id: 'snoozed',
      label: 'Open snoozed messages',
      shortcut: 'G B',
      group: 'Mail',
      action: () => navigate('/snoozed'),
    },
    {
      id: 'archive',
      label: 'Open archive',
      shortcut: 'G E',
      group: 'Mail',
      action: () => navigate('/archive'),
    },
    {
      id: 'trash',
      label: 'Open trash',
      shortcut: 'G T',
      group: 'Mail',
      action: () => navigate('/trash'),
    },
    {
      id: 'spam',
      label: 'Open spam folder',
      shortcut: 'G !',
      group: 'Mail',
      action: () => navigate('/spam'),
    },
    // Workspace
    {
      id: 'calendar',
      label: 'Open QuantCalendar',
      shortcut: 'G C',
      group: 'Workspace',
      action: () => navigate('/calendar'),
    },
    {
      id: 'contacts',
      label: 'Open QuantContacts (Directory)',
      shortcut: 'G A',
      group: 'Workspace',
      action: () => navigate('/contacts'),
    },
    {
      id: 'drive',
      label: 'Open QuantDrive (Encrypted Files)',
      shortcut: 'G V',
      group: 'Workspace',
      action: () => navigate('/drive'),
    },
    {
      id: 'codehub',
      label: 'Open QuantCode (CodeHub)',
      shortcut: 'G K',
      group: 'Workspace',
      action: () => navigate('/codehub'),
    },
    // Control
    {
      id: 'security',
      label: 'Review account security & 2FA',
      shortcut: 'G 2',
      group: 'Control',
      action: () => navigate('/security'),
    },
    {
      id: 'settings',
      label: 'Open Settings & Preferences',
      shortcut: 'G ,',
      group: 'Control',
      action: () => navigate('/settings'),
    },
    // Actions
    {
      id: 'theme-dark',
      label: 'Switch to dark theme',
      shortcut: 'T',
      group: 'Actions',
      action: () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.classList.add('dark');
        try {
          localStorage.setItem('quant-theme', 'dark');
        } catch {}
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'theme-light',
      label: 'Switch to light theme',
      group: 'Actions',
      action: () => {
        document.documentElement.setAttribute('data-theme', 'light');
        document.documentElement.classList.remove('dark');
        try {
          localStorage.setItem('quant-theme', 'light');
        } catch {}
        setCommandPaletteOpen(false);
      },
    },
    {
      id: 'shortcuts',
      label: 'Show keyboard shortcuts cheat sheet',
      shortcut: '?',
      group: 'Actions',
      action: () => {
        setCommandPaletteOpen(false);
        document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      },
    },
  ];

  useEffect(() => {
    if (!showTools) {
      setCommandPaletteOpen(false);
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [showTools]);

  return (
    <ThemeProvider defaultTheme="dark">
      <QuantSidekickProvider>
        {children}
        {showTools ? (
          <>
            <MailCopilot />
            <ContextFab />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
