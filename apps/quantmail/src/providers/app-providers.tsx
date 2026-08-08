'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { CommandPaletteUI, QuantSidekickProvider, ThemeProvider } from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { MailCopilot } from '../components/MailCopilot';

const PUBLIC_AUTH_PATHS = ['/login', '/register', '/forgot-password'];

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isPublicAuthRoute = PUBLIC_AUTH_PATHS.includes(pathname ?? '');

  const navigate = (path: string) => {
    router.push(path);
    setCommandPaletteOpen(false);
  };

  const commands: CommandPaletteItem[] = [
    // Create
    { id: 'compose', label: 'Compose a new message', group: 'Create', action: () => navigate('/compose') },
    // Find
    { id: 'search', label: 'Search mail and people', group: 'Find', action: () => navigate('/search') },
    // Mail
    { id: 'inbox', label: 'Open priority inbox', group: 'Mail', action: () => navigate('/') },
    { id: 'sent', label: 'Open sent mail', group: 'Mail', action: () => navigate('/sent') },
    { id: 'drafts', label: 'Open drafts', group: 'Mail', action: () => navigate('/drafts') },
    { id: 'trash', label: 'Open trash', group: 'Mail', action: () => navigate('/trash') },
    // Context
    { id: 'calendar', label: 'Open calendar', group: 'Context', action: () => navigate('/calendar') },
    { id: 'contacts', label: 'Open contacts', group: 'Context', action: () => navigate('/contacts') },
    { id: 'drive', label: 'Open drive', group: 'Context', action: () => navigate('/drive') },
    // Code
    { id: 'repos', label: 'Open repositories', group: 'Code', action: () => navigate('/repos') },
    { id: 'pipelines', label: 'Open pipelines', group: 'Code', action: () => navigate('/pipelines') },
    // Control
    { id: 'security', label: 'Review account security', group: 'Control', action: () => navigate('/security') },
    { id: 'settings', label: 'Open settings', group: 'Control', action: () => navigate('/settings') },
    // Actions (Gmail doesn't have these in command palette)
    { id: 'theme-dark', label: 'Switch to dark theme', group: 'Actions', action: () => { document.documentElement.setAttribute('data-theme', 'dark'); document.documentElement.classList.add('dark'); try { localStorage.setItem('quant-theme', 'dark'); } catch {} setCommandPaletteOpen(false); } },
    { id: 'theme-light', label: 'Switch to light theme', group: 'Actions', action: () => { document.documentElement.setAttribute('data-theme', 'light'); document.documentElement.classList.remove('dark'); try { localStorage.setItem('quant-theme', 'light'); } catch {} setCommandPaletteOpen(false); } },
    { id: 'shortcuts', label: 'Show keyboard shortcuts', group: 'Actions', action: () => { setCommandPaletteOpen(false); document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' })); } },
    { id: 'focus-mode', label: 'Toggle focus mode', group: 'Actions', action: () => { setCommandPaletteOpen(false); } },
    { id: 'mark-all-read', label: 'Mark all as read', group: 'Actions', action: () => { setCommandPaletteOpen(false); } },
  ];

  useEffect(() => {
    if (isPublicAuthRoute) {
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
  }, [isPublicAuthRoute]);

  return (
    <ThemeProvider defaultTheme="dark">
      <QuantSidekickProvider>
        {children}
        {!isPublicAuthRoute ? (
          <>
            <CommandPaletteUI
              isOpen={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
              commands={commands}
              placeholder="Search commands, views, and workflows…"
            />
            <MailCopilot />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
