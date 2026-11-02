'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * QuantMail Mobile Route — Redirects directly to the real responsive inbox (/).
 * The flagship inbox at `/` natively supports both Desktop Outlook 3-Pane (>=900px)
 * and Mobile Outlook touch physics (<900px) with live backend APIs and database.
 */
export default function MobileRoute() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--quant-background)] text-[var(--quant-muted-foreground)]">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 rounded-full border-2 border-[var(--quant-primary)] border-t-transparent animate-spin" />
        <span className="text-xs font-medium">Loading QuantMail…</span>
      </div>
    </div>
  );
}
