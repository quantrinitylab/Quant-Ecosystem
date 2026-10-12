'use client';

import dynamic from 'next/dynamic';

/**
 * fix/qm-auth-no-framer: client hosts that code-split the framer-motion
 * consumers (InboxToastContainer, OfflineBar) out of the root chunk.
 * Both are non-critical for first paint — toasts only appear on user actions,
 * the offline bar only shows when connectivity drops — so they load in a
 * separate client chunk. This keeps the 114KB framer-motion chunk out of the
 * public auth shell (/login, /register, …). Their animations are unchanged.
 * (Same pattern as KeyboardSurfaces.)
 */
const InboxToastContainer = dynamic(
  () => import('./InboxToast').then((m) => m.InboxToastContainer),
  { ssr: false },
);
const OfflineBar = dynamic(
  () => import('./OfflineBar').then((m) => m.OfflineBar),
  { ssr: false },
);

export function LazyOfflineBar() {
  return <OfflineBar />;
}

export function LazyInboxToasts() {
  return <InboxToastContainer />;
}
