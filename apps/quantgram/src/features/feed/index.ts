// ============================================================================
// quantneon — feed feature barrel (Layer 5)
// ============================================================================
//
// The single import point for UI surfaces consuming the feed stack. Every
// export here is an `@quant/api-client` hook backed by a same-origin
// `/api/feed/*` proxy — the sanctioned, inline-fetch-free call path
// (Requirement 1.4). UI components import from `@/features/feed`.

export * from './types';
export * from './useFeed';
