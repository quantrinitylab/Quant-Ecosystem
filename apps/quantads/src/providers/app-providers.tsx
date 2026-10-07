'use client';

import { useEffect, useState } from 'react';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { AuthGuard } from '../components/AuthGuard';

const commands: CommandPaletteItem[] = [
  {
    id: 'new-campaign',
    label: 'New Campaign',
    shortcut: 'N',
    action: () => {
      window.location.href = '/create-campaign';
    },
  },
  {
    id: 'analytics',
    label: 'Analytics',
    shortcut: 'A',
    action: () => {
      window.location.href = '/analytics';
    },
  },
  {
    id: 'audiences',
    label: 'Audiences',
    action: () => {
      window.location.href = '/audiences';
    },
  },
  {
    id: 'creatives',
    label: 'Creatives',
    action: () => {
      window.location.href = '/creatives';
    },
  },
  {
    id: 'billing',
    label: 'Billing',
    action: () => {
      window.location.href = '/billing';
    },
  },
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

  // Dark-first like QuantMail: the shell declares theme="dark" and shared
  // primitives are hardcoded dark, so the dark theme is the default.
  return (
    <ThemeProvider defaultTheme="dark">
      <QuantSidekickProvider>
        <AuthGuard>{children}</AuthGuard>
        <CommandPaletteUI
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          commands={commands}
        />
        <QuantSidekick />
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
