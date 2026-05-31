'use client';

import { motion } from 'framer-motion';
import { Button } from '@quant/shared-ui';
import { spring } from '@quant/brand';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', ...spring.gentle }}
        className="flex flex-col items-center"
      >
        <div className="text-5xl mb-4 text-[var(--quant-destructive)]">&#x26A0;</div>
        <h2 className="text-xl font-semibold mb-2 text-[var(--quant-foreground)]">
          Something went wrong
        </h2>
        <p className="text-[var(--quant-muted-foreground)] mb-6 max-w-md">
          {error.message || 'An unexpected error occurred. Please try again.'}
        </p>
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', ...spring.snappy }}
        >
          <Button onClick={reset} variant="primary">
            Try Again
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}
