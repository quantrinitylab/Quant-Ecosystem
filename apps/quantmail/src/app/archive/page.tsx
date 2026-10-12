'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ArchivePage() {
  const router = useRouter();

  useEffect(() => {
    // The classic inbox lives at /?view=inbox — the archive tab's consumer
    // (activeTab / setShowArchivedView) exists only in the classic inbox
    // (InboxPageContent). A bare /?tab=archive renders the unified People
    // home instead, which never reads `tab`, so keep ?view=inbox: dropping
    // it silently lands on the People home rather than the archived shelf.
    router.replace('/?view=inbox&tab=archive');
  }, [router]);

  return null;
}
