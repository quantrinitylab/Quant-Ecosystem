/**
 * AgentLab desk label honesty.
 *
 * The deploy_agent tool result carries no guaranteed deskNumber field, so a
 * deployed swarm worker must never be shown at a desk number nobody assigned.
 * Previously page.tsx rendered `Stationed at Desk #${res.deskNumber || 1}`,
 * which claimed "Desk #1" for every desk-less agent. This helper renders the
 * desk reference ONLY when the result actually carries a desk number, and
 * otherwise omits the desk reference entirely (desk-free swarm status).
 */

function hasDeskNumber(value: unknown): value is number | string {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  return false;
}

/**
 * Describe where a freshly deployed swarm worker is stationed.
 * Returns `Stationed at Desk #<n>` only for a real desk number; for an
 * unknown/absent desk (undefined, null, 0, '', non-finite) returns a
 * desk-free status — never an invented desk number.
 */
export function describeDeployedAgentDesk(deskNumber: unknown): string {
  if (hasDeskNumber(deskNumber)) {
    return `Stationed at Desk #${deskNumber}`;
  }
  return 'Stationed in the swarm';
}
