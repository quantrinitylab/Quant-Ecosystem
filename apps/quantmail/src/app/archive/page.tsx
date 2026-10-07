'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ArchivePage() {
  const router = useRouter();

  useEffect(() => {
    // The archived view lives on the main inbox page (?tab=archive).
    // A bare /archive used to drop the tab param and land on the plain inbox.
    router.replace('/?tab=archive');
  }, [router]);

  return null;
}
