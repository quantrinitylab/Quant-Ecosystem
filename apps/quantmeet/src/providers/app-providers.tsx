'use client';

import { useEffect, useState } from 'react';
import { ThemeProvider, CommandPaletteUI } from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';

const commands: CommandPaletteItem[] = [
  { id: 'new-meeting', label: 'New Meeting', shortcut: 'N', action: () => {} },
  { id: 'join', label: 'Join Meeting', shortcut: 'J', action: () => {} },
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
      {children}
      <CommandPaletteUI
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        commands={commands}
      />
    </ThemeProvider>
  );
}
