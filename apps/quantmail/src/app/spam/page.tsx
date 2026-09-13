'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SpamPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?lens=spam');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#090A0C] text-white">
      <div className="flex items-center gap-2 text-sm text-[#A1A4AC]">
        <span className="size-2 rounded-full bg-[#FF8C42] animate-pulse" />
        <span>Opening Spam…</span>
      </div>
    </div>
  );
}
