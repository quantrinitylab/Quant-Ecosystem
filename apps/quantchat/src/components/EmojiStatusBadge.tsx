'use client';

// ===========================================================================
// QuantChat — EmojiStatusBadge (QC-F-466)
// ===========================================================================
//
// Renders a user's live expiring emoji status next to their name. The
// status is USER content the user chose for themselves (from the first-
// party QC-F-336 catalog) — it is not app chrome, so the "no emoji in UI"
// rule for system decoration does not apply to it; the picker and this
// badge's own controls use text/SVG only.
//
// Honesty rules (brief §3.4):
//  - The key resolves ONLY through the catalog manifest
//    (`resolveCustomEmoji`) — an unknown key renders NOTHING, never a
//    derived URL, broken image, or placeholder.
//  - Expiry is re-checked at render time (and on a minute tick): a status
//    whose expiresAt has passed renders NOTHING, even if a stale client
//    cache still holds it. The server never serves expired statuses; this
//    is the second layer for already-loaded data.

import React, { useEffect, useState } from 'react';
import { resolveCustomEmoji } from '../lib/custom-emoji';
import type { EmojiStatusView } from '../types';

export function EmojiStatusBadge({
  status,
  size = 16,
}: {
  status?: EmojiStatusView | null;
  size?: number;
}) {
  const [, setTick] = useState(0);

  const expiresAtMs = status ? new Date(status.expiresAt).getTime() : NaN;
  const live = Boolean(
    status && !Number.isNaN(expiresAtMs) && expiresAtMs > Date.now(),
  );

  // Re-render once a minute while a live status is shown, so a status that
  // expires while the surface stays open disappears instead of lingering.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [live]);

  if (!status || !live) return null;

  const sep = status.key.indexOf(':');
  if (sep <= 0) return null;
  const entry = resolveCustomEmoji(
    status.key.slice(0, sep),
    status.key.slice(sep + 1),
  );
  if (!entry) return null;

  return (
    <img
      src={entry.assetUrl}
      alt={entry.alt}
      title={entry.alt}
      width={size}
      height={size}
      data-testid="emoji-status-badge"
      className="inline-block shrink-0 align-[-0.2em]"
      loading="lazy"
    />
  );
}
