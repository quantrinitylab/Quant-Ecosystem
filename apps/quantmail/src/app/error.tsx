'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Button } from '@quant/shared-ui';
import { spring } from '@quant/brand';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div
      id="main-content"
      tabIndex={-1}
      className="flex h-screen flex-col items-center justify-center p-6 text-center"
      role="alert"
      aria-labelledby="global-error-title"
      aria-describedby="global-error-description"
    >
      <motion.div
        initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.gentle }}
        className="flex flex-col items-center"
      >
        {/* Was a 5xl `&#x26A0;` text glyph, which rendered in whatever emoji font
            the OS happened to supply — colour, weight and baseline all outside our
            control, and off-palette on Windows. */}
        <svg
          viewBox="0 0 24 24"
          className="mb-4 size-12 text-[var(--quant-destructive)]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9.4v4.2M12 17.1h.01" />
        </svg>
        <h1
          id="global-error-title"
          className="mb-2 text-xl font-semibold text-[var(--quant-foreground)]"
        >
          QuantMail couldn&apos;t open this view
        </h1>
        <p
          id="global-error-description"
          className="mb-6 max-w-md text-[var(--quant-muted-foreground)]"
        >
          We couldn&apos;t finish loading this view. Try again. If the problem continues, report it
          with the reference below when available.
        </p>
        {error.digest ? (
          <p className="mb-4 font-mono text-xs text-[var(--quant-muted-foreground)]">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          <motion.div
            whileHover={prefersReducedMotion ? undefined : { scale: 1.02 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
            transition={
              prefersReducedMotion ? { duration: 0 } : { type: 'spring', ...spring.snappy }
            }
          >
            <Button onClick={reset} variant="primary">
              Try again
            </Button>
          </motion.div>
          <a
            href="/"
            className="inline-flex min-h-touch items-center gap-1 rounded-lg border border-[var(--quant-border)] px-4 py-2 text-sm font-medium text-[var(--quant-muted-foreground)] transition-colors hover:bg-[var(--quant-muted)] hover:text-[var(--quant-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] motion-reduce:transition-none"
          >
            Go to Inbox
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--quant-muted-foreground)]">
          If this keeps happening,{' '}
          <a
            href="mailto:support@quantrinity.in"
            className="text-[var(--brand-primary)] hover:underline"
          >
            contact support
          </a>
        </p>
      </motion.div>
    </div>
  );
}
