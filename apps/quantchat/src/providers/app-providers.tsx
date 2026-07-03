'use client';

import { useEffect, useState } from 'react';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { RealtimeProvider } from './realtime-provider';
import { MicroInteractionProvider } from './MicroInteractionProvider';
import { AuthGate } from './auth-gate';

const commands: CommandPaletteItem[] = [
  { id: 'new-chat', label: 'New Chat', shortcut: 'N', action: () => {} },
  { id: 'search', label: 'Search Conversations', shortcut: '/', action: () => {} },
  { id: 'settings', label: 'Settings', action: () => {} },
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
      <QuantSidekickProvider>
        <RealtimeProvider>
          <MicroInteractionProvider>
            <AuthGate>{children}</AuthGate>
            <CommandPaletteUI
              isOpen={commandPaletteOpen}
              onClose={() => setCommandPaletteOpen(false)}
              commands={commands}
            />
          </MicroInteractionProvider>
        </RealtimeProvider>
        <QuantSidekick />
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
