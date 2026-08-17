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
      group: 'Create',
      action: () => navigate('/compose'),
    },
    // Find
    {
      id: 'search',
      label: 'Search mail and people',
      group: 'Find',
      action: () => navigate('/search'),
    },
    // Mail
    { id: 'inbox', label: 'Open priority inbox', group: 'Mail', action: () => navigate('/') },
    { id: 'sent', label: 'Open sent mail', group: 'Mail', action: () => navigate('/sent') },
    { id: 'drafts', label: 'Open drafts', group: 'Mail', action: () => navigate('/drafts') },
    { id: 'trash', label: 'Open trash', group: 'Mail', action: () => navigate('/trash') },
    // Context
    {
      id: 'calendar',
      label: 'Open calendar',
      group: 'Context',
      action: () => navigate('/calendar'),
    },
    {
      id: 'contacts',
      label: 'Open contacts',
      group: 'Context',
      action: () => navigate('/contacts'),
    },
    { id: 'drive', label: 'Open drive', group: 'Context', action: () => navigate('/drive') },
    // Code
    { id: 'repos', label: 'Open repositories', group: 'Code', action: () => navigate('/repos') },
    {
      id: 'pipelines',
      label: 'Open pipelines',
      group: 'Code',
      action: () => navigate('/pipelines'),
    },
    // Control
    {
      id: 'security',
      label: 'Review account security',
      group: 'Control',
      action: () => navigate('/security'),
    },
    {
      id: 'settings',
      label: 'Open settings',
      group: 'Control',
      action: () => navigate('/settings'),
    },
    // Actions (Gmail doesn't have these in command palette)
    {
      id: 'theme-dark',
      label: 'Switch to dark theme',
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
      label: 'Show keyboard shortcuts',
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
            <CommandPaletteUI
              isOpen={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
              commands={commands}
              placeholder="Search commands, views, and workflows…"
            />
            <MailCopilot />
            <ContextFab />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
