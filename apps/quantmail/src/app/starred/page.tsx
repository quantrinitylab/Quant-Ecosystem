'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StarredPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?filter=starred');
  }, [router]);

  return null;
}
