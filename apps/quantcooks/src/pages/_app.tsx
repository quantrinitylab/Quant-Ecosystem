import './globals.css';
import Head from 'next/head';
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
    <>
      <Head>
        <title>QuantCooks</title>
        {/* Design upgrade Phase A (D-0): the product's own icon set —
            the Spring Q (public/logo.svg is the bare mark). */}
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" type="image/x-icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#0A0A0B" />
      </Head>
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
    </>
  );
}
