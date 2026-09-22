'use client';

import { useEffect, useState } from 'react';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { AuthProvider } from './auth-provider';

const commands: CommandPaletteItem[] = [
  { id: 'new-post', label: 'New Post', shortcut: 'N', action: () => {} },
  { id: 'search', label: 'Search', shortcut: '/', action: () => {} },
  { id: 'trending', label: 'View Trending', action: () => {} },
  { id: 'spaces', label: 'Live Spaces', action: () => {} },
  { id: 'bookmarks', label: 'Bookmarks', action: () => {} },
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <ThemeProvider defaultTheme="system">
      <AuthProvider>
        <QuantSidekickProvider>
          {children}
          <CommandPaletteUI
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
          <QuantSidekick />
        </QuantSidekickProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
