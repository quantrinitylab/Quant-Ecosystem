'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function StarredPage() {
  const router = useRouter();

  useEffect(() => {
    // The Pinned (starred) filter lives in the classic inbox (InboxPageContent
    // honors ?filter=starred). A bare /?filter=starred renders the People home,
    // which ignores the filter param — so keep ?view=inbox: dropping it
    // silently lands on the plain People home instead of the pinned view.
    router.replace('/?view=inbox&filter=starred');
  }, [router]);

  return null;
}
