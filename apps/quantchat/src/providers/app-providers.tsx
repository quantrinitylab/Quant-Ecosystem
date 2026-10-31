'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ThemeProvider,
  CommandPaletteUI,
  QuantSidekickProvider,
  QuantSidekick,
  UniversalSSOTokenBridge,
} from '@quant/shared-ui';
import type { CommandPaletteItem, CoreQuantAppId } from '@quant/shared-ui';
import { buildCommands } from '../lib/ecosystem-commands';
import { MicroInteractionProvider } from './MicroInteractionProvider';
import { AuthGate } from './auth-gate';
import { InAppToastContainer } from '../components/ui/InAppToast';
import { ForegroundToastBridge } from '../components/ui/ForegroundToastBridge';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // QC-F-050: the palette commands are REAL now. The old module-scope entries
  // were dead `() => {}` stubs — `search` and `settings` had no UI to go to
  // (no global search, no /settings route) and are honestly removed instead
  // of faked. The bridge lookup happens at click time (client-side only).
  const commands: CommandPaletteItem[] = buildCommands(
    (path: string) => router.push(path),
    (appId: CoreQuantAppId) => {
      const url = UniversalSSOTokenBridge.getInstance().buildCrossAppJumpUrl(appId);
      window.location.href = url;
    },
  );

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
