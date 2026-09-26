import '../styles/globals.css';
import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
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
import { AudioPlayerProvider } from '../components/audio/AudioPlayerContext';
import { GlobalAudioPlayerDock } from '../components/audio/GlobalAudioPlayerDock';

interface AppProps {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}

const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { type: 'spring', ...spring.gentle } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

const reducedMotionTransition = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

const QUANTUBE_COMMANDS: CommandPaletteItem[] = [
  { id: 'search-videos', label: 'Search videos', group: 'QuantTube', action: () => {} },
  { id: 'upload-video', label: 'Upload video', group: 'QuantTube', action: () => {} },
  { id: 'go-to-music', label: 'Go to Music', group: 'QuantTube', action: () => {} },
  { id: 'go-to-library', label: 'Go to Library', group: 'QuantTube', action: () => {} },
  {
    id: 'toggle-audio-player',
    label: 'Toggle Audio Player Dock',
    group: 'Audio',
    action: () => {},
  },
  { id: 'toggle-dark-mode', label: 'Toggle Dark Mode', group: 'Settings', action: () => {} },
  { id: 'ask-quant', label: 'Ask Quant', group: 'AI', action: () => {} },
];

function QuantTubeCommandRegistrar() {
  const { registerCommand } = useCommandPalette();

  useEffect(() => {
    const unregisters = QUANTUBE_COMMANDS.map((cmd) => registerCommand(cmd));
    return () => unregisters.forEach((unregister) => unregister());
  }, [registerCommand]);

  return null;
}

export default function App({ Component, pageProps }: AppProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionTransition : pageTransition;

  return (
    <ErrorBoundary>
      <QueryProvider>
        <AuthProvider>
          <ThemeProvider>
            <AudioPlayerProvider>
              <CommandPaletteProvider appName="QuantTube">
                <QuantSidekickProvider>
                  <QuantTubeCommandRegistrar />
                  <AuthGuard>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={Component.displayName || Component.name || 'page'}
                        variants={variants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                      >
                        <Component {...pageProps} />
                      </motion.div>
                    </AnimatePresence>
                  </AuthGuard>
                  <GlobalAudioPlayerDock />
                  <QuantSidekick />
                </QuantSidekickProvider>
              </CommandPaletteProvider>
            </AudioPlayerProvider>
          </ThemeProvider>
        </AuthProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
