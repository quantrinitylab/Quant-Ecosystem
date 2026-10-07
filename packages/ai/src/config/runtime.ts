// ============================================================================
// AI Config - Runtime Environment / Fail-Closed Policy
// ============================================================================

/**
 * Whether the process is running in a production runtime.
 */
export function isProductionRuntime(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

/**
 * Whether the AI engine must "fail closed" — i.e. refuse to fall back to a
 * mock/simulated response when a real provider call cannot be completed or no
 * provider credentials are configured.
 *
 * Policy (Requirement 3.1 / 3.3):
 *  - The explicit `QUANT_AI_FAIL_CLOSED` flag wins when set (`true`/`1` to force
 *    fail-closed, `false`/`0` to force the dev/test mock fallback).
 *  - Otherwise fail-closed is enabled automatically whenever the runtime is
 *    production.
 *
 * This keeps the existing non-production (dev/test) mock-fallback behavior
 * intact so the test suite continues to work, while guaranteeing production
 * never silently returns a simulated payload.
 */
export function isFailClosedMode(): boolean {
  const flag = (process.env['QUANT_AI_FAIL_CLOSED'] ?? '').trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return isProductionRuntime();
}
