// ============================================================================
// quantube — media feature barrel (Layer 5)
// ============================================================================
//
// Single import point for UI surfaces consuming `@quant/media`. Every export is
// an `@quant/api-client` hook backed by a same-origin `/api/media/*` proxy — the
// sanctioned, inline-fetch-free call path (Requirement 1.4).

export * from './types';
export * from './useMedia';
