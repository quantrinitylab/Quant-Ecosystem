// ============================================================================
// QuantChat - Error sanitization helpers
// ============================================================================
//
// Turn a caught exception / API error envelope into an honest, user-safe
// message. The real failure must reach the user (silently swallowing it — or
// replacing it with a bare "Something went wrong" — leaves them guessing),
// but internals must not leak: stack traces, file paths, URLs, internal
// hosts/IPs, and credentials are stripped before anything is rendered.
//
// The redaction pipeline matches the fleet standard hardened in
// apps/quantmail/src/lib/ai-error.ts (QM-UIUX-036): URLs, Bearer tokens,
// key=value credentials, JWTs, known key shapes (sk-/ghp_/AKIA), localhost
// and bare IPs, and file paths are all removed before classification.
// It additionally closes the two residual gaps the zero-defect audit filed
// against that standard (run-37, P2-736-1/-2): bare internal hostnames with
// no scheme/IP (quantmail-backend.internal:4000, ai-service:9000) and the
// credential shapes outside the original enumerated list (github_pat_,
// gho_/ghu_/…, Slack xox…, HTTP Basic credentials, PEM block markers).
//
// QM-UIUX-094 (zero-defect run-39, P2-D39-1): the bare host:port rule also
// covers single-word and underscore service names (backend:9000,
// redis:6379, db:5432, ai_service:9000) — the run-37 rule required a hyphen
// or a dotted internal TLD, so plain Docker-service shapes leaked verbatim.
// The 2–5-digit port plus trailing word boundary keep times (9:30), ratios
// (16:9), and version fragments (v2:3) untouched. Mirrors ai-error.ts.

/**
 * Extract a cleaned, single-line message from an unknown error value.
 * Returns '' when nothing usable can be recovered — including when the raw
 * message was nothing but a redacted URL/host/credential, so callers fall
 * back to an honest generic instead of rendering a bare placeholder.
 */
export function sanitizeErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';
  if (!raw) return '';
  // First line only (drops stack traces); strip URLs, internal hosts/IPs,
  // and credentials before anything else — a verbose upstream message must
  // not leak where the backend lives or the keys it used; strip anything
  // resembling a file path; cap length so a verbose backend message can't
  // flood the UI.
  const cleaned = raw
    .split('\n')[0]
    .replace(/\b(?:https?|wss?):\/\/[^\s'"<>\]]+/gi, '[link]')
    .replace(/-----BEGIN [A-Z ]*-----/g, '[redacted]')
    .replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=]{8,}/gi, 'Basic [redacted]')
    .replace(
      /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|secret|password)\s*[:=]\s*\S+/gi,
      '[redacted]',
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[redacted]')
    .replace(
      /\b(?:sk-[A-Za-z0-9_-]{8,}|gh[opusr]_[A-Za-z0-9_]{8,}|github_pat_[A-Za-z0-9_]{8,}|xox[baprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{12,})\b/g,
      '[redacted]',
    )
    .replace(/\b(?:localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:\/[^\s'"<>\]]*)?/gi, '[host]')
    .replace(
      /\b(?:[a-zA-Z0-9-]+\.)+(?:internal|local|lan|corp|intranet|home|svc|cluster)(?::\d+)?(?:\/[^\s'"<>\]]*)?/gi,
      '[host]',
    )
    .replace(/\b[a-zA-Z][a-zA-Z0-9_-]*:\d{2,5}\b(?:\/[^\s'"<>\]]*)?/g, '[host]')
    .replace(/\/[\w\-./]+\.(ts|tsx|js|jsx|py|go)/g, '[file]')
    .replace(/[A-Za-z]:\\[\w\-\\]+/g, '[file]')
    .trim()
    .slice(0, 200);
  const meaningful = cleaned.replace(/\[(?:file|link|host|redacted)\]/g, '').trim();
  return meaningful ? cleaned : '';
}

/**
 * Describe an AI request failure for the user: classify the real failure
 * (timeout vs unreachable vs quota vs auth) so they can act on it, and
 * otherwise surface the sanitized server message instead of discarding it.
 * Never returns an empty string.
 */
export function describeAiError(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const statusCode =
    error && typeof error === 'object' && 'statusCode' in error
      ? Number((error as { statusCode?: unknown }).statusCode ?? 0)
      : 0;
  const cleaned = sanitizeErrorMessage(error);
  if (code === 'ABORTED') {
    return 'The AI request was cancelled. Please try again.';
  }
  if (code === 'TIMEOUT' || /timed?\s?out|abort/i.test(cleaned)) {
    return 'The AI request timed out. Check your connection and try again.';
  }
  if (/network|fetch failed|econnrefused|enotfound|failed to fetch/i.test(cleaned)) {
    return 'The AI service is unreachable. Check your connection and try again.';
  }
  if (statusCode === 429 || /quota|rate.?limit|429|too many requests/i.test(cleaned)) {
    return 'The AI service is busy right now (rate limit). Wait a moment and try again.';
  }
  if (code === 'AUTH_ERROR' || statusCode === 401 || /401|unauthorized|session/i.test(cleaned)) {
    return 'Your session expired. Sign in again and retry.';
  }
  // Pass the cleaned message through only if something meaningful remains —
  // sanitizeErrorMessage already returns '' for placeholder-only input, so a
  // non-empty cleaned string is always meaningful here.
  if (cleaned) {
    return `The AI service hit a snag: ${cleaned}`;
  }
  return 'The AI service hit a snag. Please try again.';
}
