// ============================================================================
// quantchat — federation feature barrel (Layer 5)
// ============================================================================
//
// The single import point for UI surfaces consuming the federation engine.
// Every export here is an `@quant/api-client` hook backed by a same-origin
// `/api/federation/*` proxy — the sanctioned, inline-fetch-free call path
// (Requirement 1.4). UI components import from `@/features/federation`.

export * from './types';
export * from './useFederation';
