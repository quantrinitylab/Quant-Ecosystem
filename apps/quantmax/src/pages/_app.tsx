import './globals.css';
import { useRouter } from 'next/router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { QueryProvider } from '../providers/query-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { ErrorBoundary } from '../components/ErrorBoundary';

interface AppProps {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
          <AnimatePresence mode="wait">
            <motion.div
              key={router.pathname}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={
                prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.gentle }
              }
              className="min-h-screen"
            >
              <Component {...pageProps} />
            </motion.div>
          </AnimatePresence>
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
