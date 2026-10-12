// ============================================================================
// QC-F-056: Real location sharing for the Snap Map page.
//
// Before this module, the map page "published" the user's location only as
// WebSocket frames (`location-update` / `ghost-mode-enabled`) on a socket
// whose backend handler has no map channel — the frames were silently
// dropped, no `FriendLocation` row was ever written for a web user, and
// Ghost Mode hid the pin only in local UI state while the server row (if
// any) stayed visible to close friends forever.
//
// The backend's real REST surface is the source of truth:
//   POST   /api/map/location  → publish/refresh my location
//   DELETE /api/map/location  → stop sharing (removes my row; Ghost Mode)
// Both go through the Next proxy routes to Fastify `/map/location`.
//
// This module is the page's testable seam over that surface: it takes the
// raw fetch function as a parameter (the page passes `apiFetchRaw` from
// @quant/api-client) and reports success purely from the HTTP status —
// a failed publish/clear returns false, never a pretended success.
// ============================================================================

/** Minimal shape of the raw fetch the page injects (apiFetchRaw-compatible). */
export type LocationShareFetch = (
  path: string,
  init?: { method?: string; body?: string },
) => Promise<{ ok: boolean; status: number }>;

/**
 * Publish (or refresh) the caller's current location via the real REST
 * endpoint. Returns true only when the server accepted the publish.
 */
export async function publishLocation(
  fetchRaw: LocationShareFetch,
  latitude: number,
  longitude: number,
): Promise<boolean> {
  try {
    const res = await fetchRaw('/api/map/location', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Stop sharing: delete the caller's location row server-side. This is the
 * action Ghost Mode must take so the pin actually disappears for close
 * friends. Returns true only when the server accepted the delete.
 */
export async function clearSharedLocation(fetchRaw: LocationShareFetch): Promise<boolean> {
  try {
    const res = await fetchRaw('/api/map/location', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
