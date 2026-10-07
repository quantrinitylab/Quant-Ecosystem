// ============================================================================
// QuantChat - useAvatar Hook
//
// TanStack Query hook backing the reusable AlienAvatar component (Task 5.5).
//   - useAvatar(userId)        → fetch a user's selected avatar from /api/avatar/:userId
//   - useGenerateAvatar()      → POST /api/avatar/generate (3 variants)
//   - useSelectAvatar()        → POST /api/avatar/select + cross-surface invalidation
//   - avatarQueryKey / invalidateAvatar → propagation primitive (Task 5.8)
//
// Avatar propagation (Task 5.8): selecting/updating an avatar invalidates the
// ['avatar', userId] query so every mounted AlienAvatar that reads the same key
// refetches and re-renders. With staleTime kept short the new avatar appears on
// all surfaces well within the 5s requirement.
// ============================================================================
'use client';

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  AlienStyle,
  AvatarGenerationResponse,
  AvatarVariant,
  UserAvatar,
} from '../types/avatar';

/** Stable query key for a user's avatar — shared by every surface. */
export function avatarQueryKey(userId: string): [string, string] {
  return ['avatar', userId];
}

/** Imperatively force every AlienAvatar for a user to refetch (Task 5.8). */
export function invalidateAvatar(queryClient: QueryClient, userId: string): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: avatarQueryKey(userId) });
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; statusCode: number };
  faceDetectionConfidence?: number;
}

async function fetchAvatar(userId: string): Promise<UserAvatar | null> {
  const res = await fetch(`/api/avatar/${encodeURIComponent(userId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load avatar: ${res.statusText}`);
  const json: ApiEnvelope<UserAvatar> = await res.json();
  return json.data ?? null;
}

export interface UseAvatarResult {
  avatar: UserAvatar | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Reads a user's selected avatar. Used by AlienAvatar across all surfaces so a
 * single invalidation propagates everywhere (Task 5.6 / 5.8).
 */
export function useAvatar(userId: string | null | undefined): UseAvatarResult {
  const query = useQuery({
    queryKey: avatarQueryKey(userId ?? '__none__'),
    queryFn: () => fetchAvatar(userId as string),
    enabled: Boolean(userId),
    // Short stale window so updates propagate to all surfaces within 5s (Task 5.8).
    staleTime: 2000,
  });

  return {
    avatar: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  };
}

/** Custom error carrying the face-detection confidence on a no-face response. */
export class AvatarGenerationError extends Error {
  readonly code: string;
  readonly faceDetectionConfidence?: number;
  constructor(message: string, code: string, faceDetectionConfidence?: number) {
    super(message);
    this.name = 'AvatarGenerationError';
    this.code = code;
    this.faceDetectionConfidence = faceDetectionConfidence;
  }
}

async function postGenerate(image: string): Promise<AvatarGenerationResponse> {
  const res = await fetch('/api/avatar/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });
  const json: ApiEnvelope<AvatarGenerationResponse> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new AvatarGenerationError(
      json.error?.message ?? 'Avatar generation failed',
      json.error?.code ?? 'GENERATION_FAILED',
      json.faceDetectionConfidence,
    );
  }
  return json.data;
}

/** Mutation: generate 3 avatar variants from a base64/data-URI face photo. */
export function useGenerateAvatar() {
  return useMutation<AvatarGenerationResponse, AvatarGenerationError, string>({
    mutationFn: (image: string) => postGenerate(image),
  });
}

async function postSelect(variant: AvatarVariant): Promise<UserAvatar> {
  const res = await fetch('/api/avatar/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(variant),
  });
  const json: ApiEnvelope<UserAvatar> = await res.json();
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error?.message ?? 'Failed to save avatar');
  }
  return json.data;
}

/**
 * Mutation: persist the chosen variant, then invalidate the shared avatar query
 * so it propagates to every surface (chat, profile, story rings, friend list,
 * map pins, reactions) within 5 seconds (Task 5.8).
 */
export function useSelectAvatar(userId: string) {
  const queryClient = useQueryClient();
  return useMutation<UserAvatar, Error, AvatarVariant>({
    mutationFn: (variant: AvatarVariant) => postSelect(variant),
    onSuccess: (saved) => {
      // Seed the cache immediately, then invalidate to refetch authoritative copy.
      queryClient.setQueryData(avatarQueryKey(userId), saved);
      void invalidateAvatar(queryClient, userId);
    },
  });
}

export type { AlienStyle, AvatarVariant, UserAvatar };
