'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ArchivePage() {
  const router = useRouter();

  useEffect(() => {
    // The archived view lives on the main inbox page (?tab=archive in
    // InboxPageContent). A bare /?tab=archive renders the People home, which
    // ignores the tab param — so keep ?view=inbox: dropping it silently lands
    // on the plain People home instead of the archived view.
    router.replace('/?view=inbox&tab=archive');
  }, [router]);

  return null;
}
