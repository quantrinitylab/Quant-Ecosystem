// ============================================================================
// quantai — agent surfaces feature barrel (Layer 5)
// ============================================================================
//
// The single import point for UI surfaces consuming the quantai agent engines
// (agent-runtime, agent-swarm, quant-tools, browser-agent, code-agent,
// user-owned-ai). Every export here is an `@quant/api-client` hook backed by a
// same-origin `/api/...` proxy — the sanctioned, inline-fetch-free call path
// (Requirement 1.4). UI components import from `@/features/agents`.

export * from './types';
export * from './useAgentRuntime';
export * from './useAgentSwarm';
export * from './useQuantTools';
export * from './useBrowserAgent';
export * from './useCodeAgent';
export * from './useUserOwnedAi';
