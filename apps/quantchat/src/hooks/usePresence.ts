'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { useChatSocket } from './useChatSocket';

/**
 * Presence states rendered by the conversation list. `'online' | 'away' |
 * 'offline'` align with the existing `PresenceStatus` in `src/app/page.tsx`;
 * `'unknown'` is the explicit failure state required by Requirement 11.4 (a
 * failed presence request must NOT be rendered as online).
 */
export type PresenceStatus = 'online' | 'away' | 'offline' | 'unknown';

function normalizeStatus(raw: unknown): PresenceStatus {
  if (raw === 'online' || raw === 'away' || raw === 'offline' || raw === 'unknown') {
    return raw;
  }
  // Backend presence transitions only ever carry online/offline today; any
  // unexpected value is treated as offline rather than optimistically online.
  return 'offline';
}

/**
 * Live presence for a set of users (design Component 4 / Sequence 3).
 *
 * The map is seeded from the backend presence snapshot (Requirement 11.2) and
 * then kept live via WebSocket `presence:update` events (Requirement 11.3). If
 * the presence request fails, every requested user is rendered in the `unknown`
 * state rather than online (Requirement 11.4).
 */
export function usePresence(userIds: string[]): Record<string, PresenceStatus> {
  const idsKey = userIds.join(',');
  // Stable, de-duplicated, ordered id list so the query key / effects only
  // re-run when the actual set of users changes (not on array identity churn).
  const sortedIds = useMemo(() => Array.from(new Set(userIds)).filter(Boolean).sort(), [idsKey]);
  const sortedKey = sortedIds.join(',');

  const [statuses, setStatuses] = useState<Record<string, PresenceStatus>>({});

  // QM-UIUX-060: live presence now rides the working `chatSocket` singleton
  // (`/ws/chat`) instead of the dead RealtimeProvider (`/ws`). The backend
  // broadcasts every presence transition to all connected sockets as a
  // `chat.presence.v1` envelope whose payload is
  // `{ type: 'presence:update', userId, status, lastSeen }`; the singleton
  // normalizes it to `{ type: 'presence:update', data: <payload>, envelope }`.
  // The tracked-id set lives in a ref so the socket handler identity is stable
  // (useChatSocket re-registers when the handler identity changes).
  const trackedRef = useRef<Set<string>>(new Set());
  trackedRef.current = new Set(sortedIds);

  const handleSocketEvent = useCallback((event: any) => {
    // Normalized shape: event.data is the envelope payload. Legacy
    // passthrough frames may carry the fields under `payload` or flat.
    const type = event?.type ?? event?.payload?.type ?? event?.data?.type;
    if (type !== 'presence:update') return;
    const source = event?.data ?? event?.payload ?? event;
    const userId: string | undefined = source?.userId ?? event?.userId;
    if (!userId || !trackedRef.current.has(userId)) return;
    setStatuses((prev) => ({ ...prev, [userId]: normalizeStatus(source?.status) }));
  }, []);

  useChatSocket(handleSocketEvent);

  // Seed presence from the REST snapshot (Requirement 11.2). Kept fresh on an
  // interval inside the 30s presence freshness window so a missed WS event
  // cannot leave a stale dot indefinitely.
  const { data, isError } = useQuery<string[], Error>({
    queryKey: ['presence', sortedKey],
    queryFn: async () => {
      const response = await apiClient.getPresence(sortedIds);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load presence');
      }
      return response.data?.online ?? [];
    },
    enabled: sortedIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (sortedIds.length === 0) {
      setStatuses({});
      return;
    }
    if (isError) {
      // Requirement 11.4 — render unknown, never optimistically online.
      setStatuses(Object.fromEntries(sortedIds.map((id) => [id, 'unknown' as PresenceStatus])));
      return;
    }
    if (data) {
      const online = new Set(data);
      setStatuses(
        Object.fromEntries(
          sortedIds.map((id) => [id, online.has(id) ? 'online' : 'offline'] as const),
        ),
      );
    }
    // sortedKey captures the identity of sortedIds.
  }, [data, isError, sortedKey]);

  // Live updates are handled by the useChatSocket registration above
  // (Requirement 11.3); the REST snapshot effect below seeds the map and the
  // 30s refetch heals any missed transition.

  return statuses;
}

export default usePresence;
