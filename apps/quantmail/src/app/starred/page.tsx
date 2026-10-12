'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StarredPage() {
  const router = useRouter();

  useEffect(() => {
    // The classic inbox lives at /?view=inbox — the ?filter=starred consumer
    // (setActiveFilters) exists only in the classic inbox (InboxPageContent).
    // A bare /?filter=starred renders the unified People home instead, which
    // never reads `filter`, so keep ?view=inbox: dropping it silently lands
    // on the People home rather than the starred filter view.
    router.replace('/?view=inbox&filter=starred');
  }, [router]);

  return null;
}
