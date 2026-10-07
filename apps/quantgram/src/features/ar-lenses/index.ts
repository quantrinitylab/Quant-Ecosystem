// ============================================================================
// quantneon — ar-lenses feature barrel (Layer 5)
// ============================================================================
//
// The single import point for UI surfaces consuming the ar-lenses engine. Every
// export here is an `@quant/api-client` hook backed by a same-origin
// `/api/ar-lenses/*` proxy — the sanctioned, inline-fetch-free call path
// (Requirement 1.4). UI components import from `@/features/ar-lenses`.

export * from './types';
export * from './useArLenses';
