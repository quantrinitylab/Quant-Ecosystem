// ============================================================================
// QuantMail — shared Drive storage quota.
//
// Two sidebars each shipped a hardcoded storage line: AppSidebar said
// `1.2 / 15 GB` with an 8% bar, Sidebar said `3.5 GB of 15 GB used` with a 35%
// bar, and the Drive page — which reads the real numbers — showed a third
// figure. A user who noticed had no way to tell which one to believe, and the
// answer was neither.
//
// `GET /api/drive/quota` returns just `{ used, total }`, so a component that
// only wants to draw a bar does not pull the whole file list. Cached for a
// minute: storage moves when you upload, not between route changes.
// ============================================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import { browserApiRequest as apiRequest } from '../services/browser-api-request';

export interface StorageQuota {
  used: number;
  total: number;
}

async function fetchQuota(): Promise<StorageQuota> {
  const response = await apiRequest('/api/drive/quota');
  if (!response.ok) throw new Error('Failed to load storage quota');
  const data = (await response.json()) as Partial<StorageQuota>;
  if (typeof data.used !== 'number' || typeof data.total !== 'number') {
    throw new Error('Storage quota response was malformed');
  }
  return { used: data.used, total: data.total };
}

export function useStorageQuota() {
  const query = useQuery({
    queryKey: ['drive-quota'],
    queryFn: fetchQuota,
    staleTime: 60_000,
    retry: 1,
  });

  const quota = query.data;
  // `known` is the whole point of this hook: callers must be able to render
  // "Calculating…" rather than a plausible invented number.
  const known = Boolean(quota && quota.total > 0);
  const usedPct =
    quota && quota.total > 0 ? Math.min(100, Math.round((quota.used / quota.total) * 100)) : 0;

  return { quota, known, usedPct, isLoading: query.isLoading, error: query.error };
}
