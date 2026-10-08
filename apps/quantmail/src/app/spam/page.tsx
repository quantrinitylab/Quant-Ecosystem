'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpamPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?lens=spam');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--quant-background)] text-white">
      <div className="flex items-center gap-2 text-sm text-[var(--quant-muted-foreground)]">
        <span className="size-2 rounded-full bg-[var(--quant-primary)] animate-pulse" />
        <span>Opening Spam…</span>
      </div>
    </div>
  );
}
