'use client';

import { Button } from '@quant/shared-ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
      <div className="text-4xl mb-4">&#x26A0;</div>
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-[var(--quant-muted-foreground)] mb-6 max-w-md">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </p>
      <Button onClick={reset} variant="primary">
        Try Again
      </Button>
    </div>
  );
}
