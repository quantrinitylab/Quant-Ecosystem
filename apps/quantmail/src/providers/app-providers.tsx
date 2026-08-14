'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPaletteUI, QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { MailCopilot } from '../components/MailCopilot';
import { useAuth } from './auth-provider';

const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password'];

/**
 * The ONE compose entry point for the whole app: a floating + button pinned
 * bottom-right (where the old Ask QuantAI pill used to sit). The QuantAI
 * trigger now lives in the inbox top bar next to search.
 */
function ComposeFab() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  // Hide on the composer itself — no point stacking compose on compose.
  if (pathname.startsWith('/compose')) return null;
  return (
    <button
      type="button"
      className="quant-compose-fab"
      onClick={() => router.push('/compose')}
      aria-label="Compose new message"
      title="Compose (C)"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
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
            <ComposeFab />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
