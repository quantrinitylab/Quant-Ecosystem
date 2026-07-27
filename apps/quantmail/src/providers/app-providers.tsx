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
    {
      id: 'compose',
      label: 'Compose a new message',
      shortcut: 'C',
      group: 'Create',
      action: () => navigate('/compose'),
    },
    {
      id: 'search',
      label: 'Search mail and people',
      shortcut: '/',
      group: 'Find',
      action: () => navigate('/search'),
    },
    { id: 'inbox', label: 'Open priority inbox', group: 'Mail', action: () => navigate('/') },
    { id: 'sent', label: 'Open sent mail', group: 'Mail', action: () => navigate('/sent') },
    { id: 'drafts', label: 'Open drafts', group: 'Mail', action: () => navigate('/drafts') },
    {
      id: 'calendar',
      label: 'Open calendar',
      group: 'Workspace',
      action: () => navigate('/calendar'),
    },
    {
      id: 'contacts',
      label: 'Open contacts',
      group: 'Workspace',
      action: () => navigate('/contacts'),
    },
    { id: 'drive', label: 'Open drive', group: 'Workspace', action: () => navigate('/drive') },
    {
      id: 'repos',
      label: 'Open repositories',
      group: 'Developer',
      action: () => navigate('/repos'),
    },
    {
      id: 'security',
      label: 'Review account security',
      group: 'Account',
      action: () => navigate('/security'),
    },
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
              placeholder="Search QuantMail commands…"
            />
            <MailCopilot />
          </>
        ) : null}
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
