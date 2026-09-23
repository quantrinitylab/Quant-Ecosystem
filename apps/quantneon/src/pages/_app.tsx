import './globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence } from 'framer-motion';
import {
  MotionProvider,
  CommandPaletteProvider,
  useCommandPalette,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { QueryProvider } from '../providers/query-provider';
import { AuthProvider } from '../providers/auth-provider';
import { AuthGuard } from '../components/AuthGuard';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { VoiceCommandHost } from '../components/VoiceCommandHost';
import { registerQuantneonVoice } from '../voice-registration';

registerQuantneonVoice();

interface AppProps {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}

const QUANTNEON_COMMANDS: CommandPaletteItem[] = [
  { id: 'post-photo', label: 'Post photo', group: 'QuantNeon', action: () => {} },
  { id: 'create-reel', label: 'Create reel', group: 'QuantNeon', action: () => {} },
  { id: 'explore', label: 'Explore', group: 'QuantNeon', action: () => {} },
  { id: 'shop', label: 'Shop', group: 'QuantNeon', action: () => {} },
  { id: 'ar-filters', label: 'AR Filters', group: 'QuantNeon', action: () => {} },
  { id: 'ask-quant', label: 'Ask Quant', group: 'AI', action: () => {} },
];

function QuantNeonCommandRegistrar() {
  const { registerCommand } = useCommandPalette();

  useEffect(() => {
    const unregisters = QUANTNEON_COMMANDS.map((cmd) => registerCommand(cmd));
    return () => unregisters.forEach((unregister) => unregister());
  }, [registerCommand]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <MotionProvider>
            <CommandPaletteProvider appName="QuantNeon">
              <QuantSidekickProvider>
                <QuantNeonCommandRegistrar />
                <VoiceCommandHost appId="quantneon" userId="guest" />
                <AuthGuard>
                  <AnimatePresence mode="wait">
                    <Component key={router.asPath} {...pageProps} />
                  </AnimatePresence>
                </AuthGuard>
                <QuantSidekick />
              </QuantSidekickProvider>
            </CommandPaletteProvider>
          </MotionProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
