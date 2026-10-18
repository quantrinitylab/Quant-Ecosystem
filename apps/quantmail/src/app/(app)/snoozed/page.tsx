'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SnoozedPage() {
  const router = useRouter();

  useEffect(() => {
    // The classic inbox lives at /?view=inbox. A bare /?lens=snoozed renders
    // the People home, which honors only the spam lens — the snoozed lens
    // predicate exists solely in the classic inbox (InboxPageContent's
    // normalizeLensParam + matchesLens), so keep ?view=inbox: dropping it
    // silently lands on plain INBOX people instead of the snoozed lens.
    router.replace('/?view=inbox&lens=snoozed');
  }, [router]);

  return null;
}
