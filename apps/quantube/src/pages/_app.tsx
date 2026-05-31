import '../styles/globals.css';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { spring } from '@quant/brand';
import { QueryProvider } from '../providers/query-provider';
import { ThemeProvider } from '../providers/theme-provider';
import { ErrorBoundary } from '../components/ErrorBoundary';

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

export default function App({ Component, pageProps }: AppProps) {
  const prefersReducedMotion = useReducedMotion();
  const variants = prefersReducedMotion ? reducedMotionTransition : pageTransition;

  return (
    <ErrorBoundary>
      <QueryProvider>
        <ThemeProvider>
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
        </ThemeProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
