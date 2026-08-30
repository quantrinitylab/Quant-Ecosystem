'use client';

import { useEffect, useState } from 'react';

/**
 * Latches true the first time `isOpen` goes true, and stays true.
 *
 * This exists to make `next/dynamic` actually pay off on modals and drawers.
 * Every heavy overlay in the app was rendered unconditionally with an `isOpen`
 * prop and hid itself internally, so wrapping the import in `dynamic()` bought
 * nothing: React was still rendering the component on mount, so the chunk was
 * still requested on mount.
 *
 * Gating on `isOpen` directly would fix the bundle and break the product — these
 * overlays hold real state (a Quanty conversation, a half-configured send
 * schedule, a partially filled form), and unmounting on close would throw it
 * away. Latching gives both: the chunk is not fetched until the user first opens
 * the thing, and from then on the component stays mounted exactly as it does
 * today, so state survives every subsequent close.
 *
 * @example
 * const showQuanty = useDeferredMount(isQuantyOpen);
 * // …
 * {showQuanty && <QuantyCopilotDrawer isOpen={isQuantyOpen} onClose={close} />}
 */
export function useDeferredMount(isOpen: boolean): boolean {
  // Seeded from `isOpen` so an overlay that starts open (a deep link, a restored
  // draft) mounts on the first render instead of after an extra commit.
  const [hasOpened, setHasOpened] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  return hasOpened;
}

export default useDeferredMount;
