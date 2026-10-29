// ============================================================================
// QuantCooks CP-1 — ToolContext (§7.1): every invoke carries it, no exceptions.
// ============================================================================
//
// The shape is field-for-field the one C-2 landed in craft-render.tool.ts
// (which re-declares it locally for its standalone definition); this module
// is the canonical home from CP-1 on. Structural identity means the C-2 /
// C-3B tool definitions consume it unchanged.
//
// Construction rules (§7.1/§7.3):
//  - REST/UI contexts are built from the backend auth (`request.auth.userId`)
//    with full scopes — a signed-in user calling their own account needs no
//    delegation.
//  - Agent contexts (quantai/mcp/cli) are built by the transport bridge.
//    CP-3 ships grant issuance/verification; until then, any invoke that
//    CLAIMS an agent identity (agentId) or a delegation (delegationId) is
//    refused by the registry with 401 DELEGATION_NOT_CONFIGURED, because no
//    verification exists that could honour the claim (§8 matrix). An
//    in-process QuantAI call from the user's own session carries neither
//    field and is a direct user-context invoke.
// ============================================================================

export interface ToolContext {
  actorUserId: string;
  surface: 'ui' | 'rest' | 'quantai' | 'mcp' | 'cli';
  agentId?: string;
  delegationId?: string;
  scopes: string[];
  confirmedToolIds?: string[];
  idempotencyKey?: string;
  quantyTaskId?: string;
  /** Registry-populated during invoke: the accepted quote's id (§6.2), so
   *  async executors can record it on the job they create. Not caller-set. */
  quoteId?: string;
}

export const AGENT_SURFACES: ReadonlySet<ToolContext['surface']> = new Set([
  'quantai',
  'mcp',
  'cli',
]);

export function isAgentSurface(ctx: ToolContext): boolean {
  return AGENT_SURFACES.has(ctx.surface);
}

/**
 * True when the invoke claims to act as/for an agent under a delegation.
 * CP-1 has no delegation verification (CP-3), so such claims always refuse;
 * a context with neither field is the user's own session acting directly.
 */
export function claimsDelegation(ctx: ToolContext): boolean {
  return Boolean(ctx.agentId) || Boolean(ctx.delegationId);
}

/** Build a direct user context from a Fastify request's auth (routes). */
export function contextFromRequest(
  request: unknown,
  surface: ToolContext['surface'] = 'rest',
): ToolContext | null {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) return null;
  return { actorUserId: userId, surface, scopes: ['*'] };
}
