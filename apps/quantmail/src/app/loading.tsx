'use client';

import { useEffect, useState } from 'react';
import { Skeleton } from '@quant/shared-ui';

export default function Loading() {
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowMessage(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className="flex h-screen animate-fade-in motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading QuantMail</span>
      <div
        className="hidden w-64 space-y-3 border-r border-[var(--quant-border)] bg-[var(--quant-surface)] p-4 md:block"
        aria-hidden="true"
      >
        <div className="mb-6 flex items-center gap-2">
          <div className="h-8 w-8 animate-pulse-brand rounded-full bg-[var(--brand-app-color)] motion-reduce:animate-none" />
          <Skeleton variant="text" width="120px" height="24px" />
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} variant="text" width="100%" height="44px" />
        ))}
      </div>
      <div className="flex-1 space-y-4 p-4" aria-hidden="true">
        <Skeleton variant="rect" width="100%" height="40px" />
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rect" width="80px" height="32px" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} variant="rect" width="100%" height="72px" />
        ))}
        {showSlowMessage && (
          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--quant-muted-foreground)]">
              Taking longer than expected…
            </p>
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
              Check your connection or{' '}
              <a href="/" className="text-[var(--brand-primary)] hover:underline">
                reload the page
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
