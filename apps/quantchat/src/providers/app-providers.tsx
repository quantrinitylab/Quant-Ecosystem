'use client';

import { useEffect, useState } from 'react';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
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
        {/* QM-UIUX-060: the dead RealtimeProvider (`/ws`) is gone. Realtime
            consumers now ride the shared `chatSocket` singleton (`/ws/chat`)
            directly — each hook/component acquires/releases the singleton's
            refcounted connection itself, so no provider wrapper is needed. */}
        <MicroInteractionProvider>
          <AuthGate>{children}</AuthGate>
          <CommandPaletteUI
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
        </MicroInteractionProvider>
        <QuantSidekick />
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
