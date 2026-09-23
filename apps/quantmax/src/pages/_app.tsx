import './globals.css';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import {
  CommandPaletteProvider,
  useCommandPalette,
  QuantSidekickProvider,
  QuantSidekick,
} from '@quant/shared-ui';
import type { CommandPaletteItem } from '@quant/shared-ui';
import { QueryProvider } from '../providers/query-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { AuthProvider } from '../providers/auth-provider';
import { AuthGuard } from '../components/AuthGuard';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface AppProps {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}

const QUANTMAX_COMMANDS: CommandPaletteItem[] = [
  { id: 'discover-matches', label: 'Discover matches', group: 'QuantMax', action: () => {} },
  { id: 'start-video-chat', label: 'Start video chat', group: 'QuantMax', action: () => {} },
  { id: 'go-to-profile', label: 'Go to profile', group: 'QuantMax', action: () => {} },
  { id: 'safety-settings', label: 'Safety settings', group: 'QuantMax', action: () => {} },
  { id: 'ask-quant', label: 'Ask Quant', group: 'AI', action: () => {} },
];

function QuantMaxCommandRegistrar() {
  const { registerCommand } = useCommandPalette();

  useEffect(() => {
    const unregisters = QUANTMAX_COMMANDS.map((cmd) => registerCommand(cmd));
    return () => unregisters.forEach((unregister) => unregister());
  }, [registerCommand]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <CommandPaletteProvider appName="QuantMax">
              <QuantSidekickProvider>
                <QuantMaxCommandRegistrar />
                <AuthGuard>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={router.pathname}
                      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { type: 'spring', ...spring.gentle }
                      }
                      className="min-h-screen"
                    >
                      <Component {...pageProps} />
                    </motion.div>
                  </AnimatePresence>
                </AuthGuard>
                <QuantSidekick />
              </QuantSidekickProvider>
            </CommandPaletteProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
