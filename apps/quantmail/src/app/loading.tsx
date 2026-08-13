'use client';

import { useEffect, useState } from 'react';
import { BrandLoader } from '../components/BrandLoader';

export default function Loading() {
  const [showSlowMessage, setShowSlowMessage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSlowMessage(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <BrandLoader
      variant="splash"
      message="Loading QuantMail…"
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
