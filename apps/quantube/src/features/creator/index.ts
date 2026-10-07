// ============================================================================
// quantube — creator-economy feature barrel (Layer 5)
// ============================================================================
//
// Single import point for UI surfaces consuming `@quant/creator-economy`
// (non-payment surfaces). Every export is an `@quant/api-client` hook backed by
// a same-origin `/api/creator/*` proxy — the sanctioned, inline-fetch-free call
// path (Requirement 1.4). Payout (payment) hooks come in Task 13.2.

export * from './types';
export * from './useCreator';
