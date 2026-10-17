/**
 * drive-memory.ts — session-authenticated access to the Drive AI Memory tab.
 *
 * The access token lives only in browser memory (browserAuthSession; there is
 * NO access-token cookie), so every /api/drive/memory request must attach it
 * explicitly via apiFetchRaw({ token }). A plain tokenless fetch 401s at the
 * backend proxy for every signed-in user and the tab shows
 * "Memory data is unavailable right now." — the P1 this module fixes.
 */
import { apiFetchRaw } from '@quant/api-client';
import { browserAuthSession } from './browser-auth-session';

/** Raw record shape returned by GET /api/drive/memory (backend envelope). */
export interface DriveMemoryRecord {
  id: string;
  content: string;
  summary?: string;
  sourceApp?: string;
  sourceLabel?: string;
  confidenceScore?: number | null;
  sensitivity?: string | null;
  explicitness?: string | null;
  policyVersion?: string | null;
  provenance?: string | null;
  sourceObjectId?: string | null;
  extractedFacts?: string[];
  entityGraphLinks?: string[];
  updatedAt?: string;
}

/**
 * Load the governed memory list. Attaches the browser session token so the
 * Next.js proxy can forward it to the backend — without it the backend 401s.
 * Throws the honest error the UI already displays on failure.
 */
export async function fetchDriveMemoryItems(signal?: AbortSignal): Promise<DriveMemoryRecord[]> {
  const response = await apiFetchRaw('/api/drive/memory', {
    cache: 'no-store',
    token: browserAuthSession.getAccessToken() ?? undefined,
    signal,
  });
  if (!response.ok) throw new Error('Memory data is unavailable right now.');
  const payload = (await response.json()) as { memories?: DriveMemoryRecord[] };
  return payload.memories ?? [];
}

/**
 * Archive ("forget") one memory projection. Attaches the browser session
 * token for the same reason as fetchDriveMemoryItems.
 */
export async function forgetDriveMemory(logicalId: string): Promise<void> {
  const response = await apiFetchRaw(`/api/drive/memory/${encodeURIComponent(logicalId)}`, {
    method: 'DELETE',
    token: browserAuthSession.getAccessToken() ?? undefined,
  });
  if (!response.ok) throw new Error('Could not forget this memory.');
}
