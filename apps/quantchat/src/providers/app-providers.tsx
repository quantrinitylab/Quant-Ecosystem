'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { MicroInteractionProvider } from './MicroInteractionProvider';
import { AuthGate } from './auth-gate';
import { InAppToastContainer } from '../components/ui/InAppToast';
import { ForegroundToastBridge } from '../components/ui/ForegroundToastBridge';

const commands: CommandPaletteItem[] = [
  { id: 'new-chat', label: 'New Chat', shortcut: 'N', action: () => {} },
  { id: 'search', label: 'Search Conversations', shortcut: '/', action: () => {} },
  { id: 'settings', label: 'Settings', action: () => {} },
];

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
        {/* QC-F-341: the in-app toast surface, live at last — the
            container renders whatever the manager holds, tapped toasts
            navigate through the real App Router, and the bridge turns
            real foreground socket events into toasts (gated, ephemeral-
            safe). Mounted outside AuthGate on purpose: the bridge's own
            gates fail closed while logged out. */}
        <InAppToastContainer onNavigate={(deepLink) => router.push(deepLink)} />
        <ForegroundToastBridge />
        <QuantSidekick />
      </QuantSidekickProvider>
    </ThemeProvider>
  );
}
