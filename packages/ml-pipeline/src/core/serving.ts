// ============================================================================
// ML Pipeline - Shared serving-backend helpers
// ============================================================================
//
// Small internal utilities shared by the dual-mode core components. Each
// component pairs its existing in-process NAIVE implementation with an optional
// real serving backend. When a backend is configured (injected for tests, or
// auto-created from an environment variable pointing at a deployed inference /
// feature-store / monitoring endpoint), the served path is used. On any error
// the component logs a warning and falls back to the naive path.

/** Read a non-empty, trimmed environment variable, or undefined when unset. */
export function readEnvUrl(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}

/**
 * Minimal JSON POST helper for HTTP serving backends. Uses the global fetch
 * (available in Node 18+). Throws on non-2xx responses so callers can fall back.
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`serving request to ${url} failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/**
 * Log a structured warning when a serving backend fails and the caller is about
 * to fall back to the naive in-process implementation. Centralizes the single
 * permitted console usage so individual components stay lint-clean.
 */
export function warnServingFallback(scope: string, op: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.warn(`[${scope}] serving backend ${op} failed, using naive fallback: ${message}`);
}
