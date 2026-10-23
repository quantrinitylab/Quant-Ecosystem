'use client';

import { useEffect, useState } from 'react';
import { registerDriveOfflineWorker, isOfflineNow } from '../../../lib/drive-offline';

interface DriveOfflineBannerProps {
  /**
   * True when the listing on screen was served from the offline cache (the
   * worker stamps cache-served responses; useDrive surfaces it). Lets the
   * banner be honest about *what* the user is looking at.
   */
  cached: boolean;
}

/**
 * Drive-surface offline indicator (QuantDrive offline minimal slice).
 *
 * Renders only while the browser reports no network. Two honest states:
 *  - cached listings on screen: "You're offline — showing cached Drive files."
 *  - nothing cached yet: files opened while online will be available here.
 *
 * Registration of the offline-cache worker happens here too; a failed
 * registration is silent by design — this banner describes the *network*
 * state only and never claims offline support the worker couldn't provide.
 *
 * Styling: pure-black surface, Drive-green app accent, no divider lines.
 */
export function DriveOfflineBanner({ cached }: DriveOfflineBannerProps) {
  // Initialized from the real network state (SSR-safe via isOfflineNow) so
  // the first paint — and static markup — is honest, not "online until an
  // effect corrects it".
  const [offline, setOffline] = useState<boolean>(() => isOfflineNow());

  useEffect(() => {
    void registerDriveOfflineWorker();
    setOffline(isOfflineNow());
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 bg-black px-4 py-2 sm:px-8"
    >
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--app-accent)]"
      />
      <p className="text-xs text-[var(--app-accent)]">
        {cached
          ? 'You\u2019re offline \u2014 showing cached Drive files. Uploads and edits need a connection.'
          : 'You\u2019re offline \u2014 files you open while online will be available here.'}
      </p>
    </div>
  );
}
