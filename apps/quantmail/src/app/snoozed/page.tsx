'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SnoozedPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?lens=snoozed');
  }, [router]);

  return null;
}
