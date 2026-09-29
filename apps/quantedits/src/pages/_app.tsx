import './globals.css';
import { useEffect } from 'react';
import {
  CommandPaletteProvider,
  useCommandPalette,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { QueryProvider } from '../providers/query-provider';
import { BrandProvider } from '../providers/brand-provider';
import { AuthProvider } from '../providers/auth-provider';
import { AuthGuard } from '../components/AuthGuard';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface AppProps {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}

const QUANTEDITS_COMMANDS: CommandPaletteItem[] = [
  { id: 'new-project', label: 'New project', group: 'QuantEdits', action: () => {} },
  { id: 'add-layer', label: 'Add layer', group: 'QuantEdits', action: () => {} },
  { id: 'apply-effect', label: 'Apply effect', group: 'QuantEdits', action: () => {} },
  { id: 'export', label: 'Export', group: 'QuantEdits', action: () => {} },
  { id: 'ai-edit', label: 'AI edit', group: 'QuantEdits', action: () => {} },
  { id: 'browse-templates', label: 'Browse templates', group: 'QuantEdits', action: () => {} },
  { id: 'ask-quant', label: 'Ask Quant', group: 'AI', action: () => {} },
];

function QuantEditsCommandRegistrar() {
  const { registerCommand } = useCommandPalette();

  useEffect(() => {
    const unregisters = QUANTEDITS_COMMANDS.map((cmd) => registerCommand(cmd));
    return () => unregisters.forEach((unregister) => unregister());
  }, [registerCommand]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ErrorBoundary>
      <BrandProvider>
        <QueryProvider>
          <AuthProvider>
            <CommandPaletteProvider appName="QuantEdits">
              <QuantSidekickProvider>
                <QuantEditsCommandRegistrar />
                <AuthGuard>
                  <Component {...pageProps} />
                </AuthGuard>
                <QuantSidekick />
              </QuantSidekickProvider>
            </CommandPaletteProvider>
          </AuthProvider>
        </QueryProvider>
      </BrandProvider>
    </ErrorBoundary>
  );
}
