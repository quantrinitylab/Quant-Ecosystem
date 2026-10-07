'use client';

import { useEffect, useState } from 'react';
import { BrandLoader } from './BrandLoader';

/**
 * The full-screen brand splash.
 *
 * This used to be the body of `app/loading.tsx`, which meant it was the fallback
 * for *every* route — so an in-app move from Inbox to Sent tore the workspace
 * down to a centred logo. It now serves only the routes where "the app is
 * starting" is the truth: the unauthenticated shells, which are the one place a
 * user can legitimately be waiting on a cold origin.
 *
 * The 5-second hint is not decoration. Production cold-starts have been measured
 * between 45s and 109s, and without it the splash is indistinguishable from a
 * hang.
 */
export function RouteSplash({ message = 'Loading QuantMail…' }: { message?: string }) {
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowMessage(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <BrandLoader
      variant="splash"
      message={message}
      hint={
        showSlowMessage ? (
          <>
            <p className="text-sm text-[var(--quant-muted-foreground)]">
              Taking longer than expected…
            </p>
            <p className="mt-1 text-xs text-[var(--quant-muted-foreground)]">
              Check your connection or{' '}
              <a href="/" className="text-[var(--brand-primary)] hover:underline">
                reload the page
              </a>
            </p>
          </>
        ) : null
      }
    />
  );
}

export default RouteSplash;
