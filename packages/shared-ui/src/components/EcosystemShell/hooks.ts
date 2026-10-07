'use client';
// ============================================================================
// @quant/shared-ui - EcosystemShell backend-backed surface hooks
// ============================================================================
//
// The two cross-cutting surfaces that are backed by a backend service —
// `bharat-ai` (localization) and `wellbeing` (usage controls) — consume their
// backend through the canonical Layer-5 seam: typed `@quant/api-client` hooks
// hitting the app's own same-origin Next `/api/*` proxy. This is the ONLY
// sanctioned call path from a UI surface to an engine-backed endpoint; inline
// `fetch` to a backend is forbidden (Requirement 1.4, design Layer 5, and the
// Task 3 inline-fetch guard).

import { useApiQuery, useApiMutation } from '@quant/api-client';

// ---------------------------------------------------------------------------
// bharat-ai — localization / India-market layer (backend-backed)
// ---------------------------------------------------------------------------

/** A localization bundle served by the bharat-ai backend for a language. */
export interface BharatLocaleBundle {
  language: string;
  messages: Record<string, string>;
}

/**
 * Fetch the active localization bundle from the bharat-ai backend via the
 * `/api/bharat-ai/locale` proxy. Pass `language` to request a specific locale.
 */
export function useBharatLocale(language?: string, options?: { enabled?: boolean }) {
  return useApiQuery<BharatLocaleBundle>('/api/bharat-ai/locale', {
    params: language ? { language } : undefined,
    enabled: options?.enabled ?? true,
  });
}

// ---------------------------------------------------------------------------
// wellbeing — usage / wellbeing controls (backend-backed)
// ---------------------------------------------------------------------------

/** Aggregate wellbeing report surfaced to the user's controls. */
export interface WellbeingSummary {
  totalMinutes: number;
  bingeCount: number;
  appBreakdown: Record<string, number>;
}

/**
 * Fetch the user's wellbeing summary from the wellbeing backend via the
 * `/api/wellbeing/summary` proxy.
 */
export function useWellbeingSummary(options?: { enabled?: boolean }) {
  return useApiQuery<WellbeingSummary>('/api/wellbeing/summary', {
    enabled: options?.enabled ?? true,
  });
}

/** Input for recording a completed usage session against the wellbeing backend. */
export interface RecordUsageInput {
  appId: string;
  startedAt: number;
  endedAt: number;
}

/**
 * Record a usage session to the wellbeing backend via the `/api/wellbeing/usage`
 * proxy and receive the refreshed summary.
 */
export function useRecordWellbeingUsage() {
  return useApiMutation<RecordUsageInput, WellbeingSummary>('/api/wellbeing/usage');
}
