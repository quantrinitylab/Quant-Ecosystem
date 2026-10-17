// ============================================================================
// QuantChat - useMemories Hook (Tasks 13.1, 13.2, 13.3, 13.4)
//
// Drives the Memories vault:
//   - memories            newest-first list (server-ordered, Task 13.1)
//   - filters / setFilters date-range / location / caption search (Task 13.3)
//   - saveMemory          persist a snap/story/reel into the vault (Task 13.2)
//   - deleteMemory        soft-delete; returns the id so the UI can offer undo
//   - restoreMemory       undo a delete within the 5-second window (Task 13.4)
//
// QC-F-450 ('My Eyes Only') — passcode-locked private section:
//   - section             'public' (default) | 'private'; the public list
//                         NEVER contains private items (server-enforced).
//   - The unlock token lives ONLY in a ref (memory) — never in
//     localStorage/sessionStorage/cookies/URL — and is sent only in the
//     X-Memories-Unlock header on private-section and move/delete/restore
//     calls for private items.
//   - Locking (manual, or a 401 MEMORIES_LOCKED from the backend) clears
//     the token AND purges the private React Query cache via
//     removeQueries, so no private mediaUrl survives in the cache.
//   - Vault operations throw VaultError carrying the backend error code —
//     the UI shows the honest state (wrong passcode, lockout, reset
//     unavailable) instead of a fake success.
//
// All requests go through the Next.js `/api/memories` proxy with auth headers.
// ============================================================================
'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getAuthHeaders, getAuthHeadersWithContent } from '../lib/auth';
import { apiFetchRaw } from '@quant/api-client';

export type MemoryMediaType = 'PHOTO' | 'VIDEO';

export type MemorySection = 'public' | 'private';

export interface Memory {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption: string | null;
  location: string | null;
  createdAt: string;
  deletedAt: string | null;
  /** QC-F-450 — true when the item lives in 'My Eyes Only'. */
  isPrivate: boolean;
}

export interface MemoryFilters {
  from?: string;
  to?: string;
  location?: string;
  q?: string;
}

export interface SaveMemoryInput {
  mediaUrl: string;
  mediaType: MemoryMediaType;
  caption?: string;
  location?: string;
  /** QC-F-450 — save directly into 'My Eyes Only' (requires an unlock). */
  isPrivate?: boolean;
}

export interface VaultStatus {
  hasPasscode: boolean;
  resetAvailable: boolean;
}

export interface VaultUnlockGrant {
  unlockToken: string;
  expiresAt: string;
  expiresInSec: number;
}

/** Error carrying the backend's honest vault error code (QC-F-450). */
export class VaultError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryAfterSec?: number;

  constructor(code: string, status: number, message: string, retryAfterSec?: number) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Undo window (ms) the UI should display after a delete (matches backend). */
export const MEMORY_UNDO_WINDOW_MS = 5000;

interface MemoriesResponse {
  success: boolean;
  data: { memories: Memory[]; total: number };
}

interface ApiErrorBody {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
    statusCode?: number;
    details?: { retryAfterSec?: number };
  };
}

function buildQueryString(filters: MemoryFilters, section: MemorySection): string {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.location) params.set('location', filters.location);
  if (filters.q) params.set('q', filters.q);
  if (section === 'private') params.set('section', 'private');
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function unlockHeaders(token: string | null): Record<string, string> {
  return token ? { 'X-Memories-Unlock': token } : {};
}

async function toVaultError(res: Response, fallback: string): Promise<VaultError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  const code = body?.error?.code ?? 'REQUEST_FAILED';
  const message = body?.error?.message ?? `${fallback}: ${res.status}`;
  return new VaultError(code, res.status, message, body?.error?.details?.retryAfterSec);
}

/** One vault-endpoint call: returns `data` or throws an honest VaultError. */
async function vaultRequest<T>(
  path: string,
  init: { method: string; body?: unknown; token?: string | null },
): Promise<T> {
  const res = await apiFetchRaw(path, {
    method: init.method,
    headers: {
      ...(init.body !== undefined ? getAuthHeadersWithContent() : getAuthHeaders()),
      ...unlockHeaders(init.token ?? null),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw await toVaultError(res, 'Vault request failed');
  const json: { data: T } = await res.json();
  return json.data;
}

export interface UseMemoriesReturn {
  memories: Memory[];
  isLoading: boolean;
  isError: boolean;
  filters: MemoryFilters;
  setFilters: (filters: MemoryFilters) => void;
  clearFilters: () => void;
  saveMemory: (input: SaveMemoryInput) => Promise<Memory | null>;
  deleteMemory: (id: string) => Promise<string | null>;
  restoreMemory: (id: string) => Promise<Memory | null>;
  refetch: () => void;
  // QC-F-450 — 'My Eyes Only'
  section: MemorySection;
  /** Switch sections. Entering 'private' without an unlock shows the lock UI (the query fails honestly with MEMORIES_LOCKED). */
  setSection: (section: MemorySection) => void;
  vaultStatus: VaultStatus | null;
  isUnlocked: boolean;
  /** Verify a passcode: on success the vault opens on the private section. Throws VaultError. */
  unlockVault: (passcode: string) => Promise<VaultUnlockGrant>;
  /** Set the first passcode. Throws VaultError (e.g. PASSCODE_EQUALS_PASSWORD). */
  setPasscode: (passcode: string) => Promise<void>;
  /** Change the passcode (current is proof). Throws VaultError. */
  changePasscode: (currentPasscode: string, newPasscode: string) => Promise<void>;
  /** Forgotten-passcode reset (account password is proof; private items are permanently deleted). Throws VaultError. */
  resetPasscode: (accountPassword: string) => Promise<void>;
  /** Lock now: token dropped, private cache purged, section back to public. */
  lockVault: () => Promise<void>;
  moveToPrivate: (id: string) => Promise<Memory | null>;
  moveToPublic: (id: string) => Promise<Memory | null>;
}

export function useMemories(initialFilters: MemoryFilters = {}): UseMemoriesReturn {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<MemoryFilters>(initialFilters);
  const [section, setSectionState] = useState<MemorySection>('public');
  const [isUnlocked, setIsUnlocked] = useState(false);
  // The unlock token itself: memory-only, never persisted anywhere.
  const unlockTokenRef = useRef<string | null>(null);

  const queryKey = useMemo(() => ['memories', section, filters] as const, [section, filters]);

  /** Drop the token + purge every cached private byte. Used by lock and by a backend MEMORIES_LOCKED. */
  const purgeUnlock = useCallback(() => {
    unlockTokenRef.current = null;
    setIsUnlocked(false);
    queryClient.removeQueries({ queryKey: ['memories', 'private'] });
  }, [queryClient]);

  const fetchMemories = useCallback(
    async (targetSection: MemorySection, targetFilters: MemoryFilters): Promise<Memory[]> => {
      const token = targetSection === 'private' ? unlockTokenRef.current : null;
      if (targetSection === 'private' && !token) {
        throw new VaultError('MEMORIES_LOCKED', 401, 'The vault is locked');
      }
      const res = await apiFetchRaw(
        `/api/memories${buildQueryString(targetFilters, targetSection)}`,
        { headers: { ...getAuthHeaders(), ...unlockHeaders(token) } },
      );
      if (!res.ok) {
        const err = await toVaultError(res, 'Failed to load memories');
        if (targetSection === 'private' && err.code === 'MEMORIES_LOCKED') {
          purgeUnlock();
        }
        throw err;
      }
      const json: MemoriesResponse = await res.json();
      return json.data?.memories ?? [];
    },
    [purgeUnlock],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchMemories(section, filters),
    placeholderData: keepPreviousData,
  });

  const { data: vaultStatus } = useQuery({
    queryKey: ['memories', 'vault-status'] as const,
    queryFn: () => vaultRequest<VaultStatus>('/api/memories/passcode/status', { method: 'GET' }),
  });

  const saveMutation = useMutation({
    mutationFn: async (input: SaveMemoryInput) => {
      const res = await apiFetchRaw('/api/memories', {
        method: 'POST',
        headers: {
          ...getAuthHeadersWithContent(),
          ...(input.isPrivate ? unlockHeaders(unlockTokenRef.current) : {}),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Failed to save memory');
      const json: { data: Memory } = await res.json();
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetchRaw(`/api/memories/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), ...unlockHeaders(unlockTokenRef.current) },
      });
      if (!res.ok) throw new Error('Failed to delete memory');
      return id;
    },
    onMutate: async (id: string) => {
      // Optimistically drop the deleted memory from every cached LIST.
      // Only array values are lists — the vault-status entry shares the
      // ['memories'] prefix and must not be touched here.
      await queryClient.cancelQueries({ queryKey: ['memories'] });
      const snapshots = queryClient.getQueriesData<Memory[]>({ queryKey: ['memories'] });
      snapshots.forEach(([key, value]) => {
        if (Array.isArray(value)) {
          queryClient.setQueryData(
            key,
            value.filter((m) => m.id !== id),
          );
        }
      });
      return { snapshots };
    },
    onError: (_err, _id, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value));
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetchRaw(`/api/memories/${id}/restore`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), ...unlockHeaders(unlockTokenRef.current) },
      });
      if (!res.ok) throw new Error('Failed to restore memory');
      const json: { data: Memory } = await res.json();
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, toPrivate }: { id: string; toPrivate: boolean }) => {
      const res = await apiFetchRaw(
        `/api/memories/${id}/${toPrivate ? 'move-to-private' : 'move-to-public'}`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), ...unlockHeaders(unlockTokenRef.current) },
        },
      );
      if (!res.ok) throw await toVaultError(res, 'Failed to move memory');
      const json: { data: Memory } = await res.json();
      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
  });

  const saveMemory = useCallback(
    async (input: SaveMemoryInput) => {
      try {
        return await saveMutation.mutateAsync(input);
      } catch {
        return null;
      }
    },
    [saveMutation],
  );

  const deleteMemory = useCallback(
    async (id: string) => {
      try {
        return await deleteMutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [deleteMutation],
  );

  const restoreMemory = useCallback(
    async (id: string) => {
      try {
        return await restoreMutation.mutateAsync(id);
      } catch {
        return null;
      }
    },
    [restoreMutation],
  );

  const moveToPrivate = useCallback(
    async (id: string) => {
      try {
        return await moveMutation.mutateAsync({ id, toPrivate: true });
      } catch {
        return null;
      }
    },
    [moveMutation],
  );

  const moveToPublic = useCallback(
    async (id: string) => {
      try {
        return await moveMutation.mutateAsync({ id, toPrivate: false });
      } catch {
        return null;
      }
    },
    [moveMutation],
  );

  const clearFilters = useCallback(() => setFilters({}), []);

  const setSection = useCallback((next: MemorySection) => {
    setSectionState(next);
  }, []);

  const unlockVault = useCallback(
    async (passcode: string) => {
      const grant = await vaultRequest<VaultUnlockGrant>('/api/memories/passcode/verify', {
        method: 'POST',
        body: { passcode },
      });
      unlockTokenRef.current = grant.unlockToken;
      setIsUnlocked(true);
      setSectionState('private');
      return grant;
    },
    [],
  );

  const setPasscode = useCallback(
    async (passcode: string) => {
      await vaultRequest('/api/memories/passcode/set', { method: 'POST', body: { passcode } });
      void queryClient.invalidateQueries({ queryKey: ['memories', 'vault-status'] });
    },
    [queryClient],
  );

  const changePasscode = useCallback(
    async (currentPasscode: string, newPasscode: string) => {
      await vaultRequest('/api/memories/passcode/change', {
        method: 'POST',
        body: { currentPasscode, newPasscode },
      });
      // A change revokes every unlock token server-side — mirror it locally.
      purgeUnlock();
      setSectionState('public');
      void queryClient.invalidateQueries({ queryKey: ['memories', 'vault-status'] });
    },
    [queryClient, purgeUnlock],
  );

  const resetPasscode = useCallback(
    async (accountPassword: string) => {
      await vaultRequest('/api/memories/passcode/reset', {
        method: 'POST',
        body: { accountPassword },
      });
      // The vault is gone: token, private cache, and section all reset.
      purgeUnlock();
      setSectionState('public');
      void queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
    [queryClient, purgeUnlock],
  );

  const lockVault = useCallback(async () => {
    // Local lock is applied first and stands even if the call fails —
    // locking must never depend on the network.
    purgeUnlock();
    setSectionState('public');
    try {
      await vaultRequest('/api/memories/passcode/lock', { method: 'POST' });
    } catch {
      /* the token is already dropped locally; the server copy expires in <=5 min */
    }
  }, [purgeUnlock]);

  return {
    memories: data ?? [],
    isLoading,
    isError,
    filters,
    setFilters,
    clearFilters,
    saveMemory,
    deleteMemory,
    restoreMemory,
    refetch,
    section,
    setSection,
    vaultStatus: vaultStatus ?? null,
    isUnlocked,
    unlockVault,
    setPasscode,
    changePasscode,
    resetPasscode,
    lockVault,
    moveToPrivate,
    moveToPublic,
  };
}

export default useMemories;
