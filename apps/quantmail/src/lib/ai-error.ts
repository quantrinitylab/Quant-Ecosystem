/**
 * Turn a caught AI exception into an honest, user-safe message.
 * Surfaces the real failure class (network vs timeout vs quota vs auth) so the
 * user can act on it, while stripping stack traces, file paths, URLs, internal
 * hosts, and credentials — anything that leaks internals or secrets. Never
 * returns an empty string.
 *
 * Also closes the two residual gaps the zero-defect run-37 audit filed
 * against this pipeline (P2-736-1/-2), matching the hardening landed in
 * QuantChat's sanitize-error.ts (PR #751): bare internal hostnames with no
 * scheme/IP (quantmail-backend.internal:4000, ai-service:9000) and the
 * credential shapes outside the original enumerated list (github_pat_,
 * gho_/ghu_/…, Slack xox…, HTTP Basic credentials, PEM block markers).
 *
 * QM-UIUX-094 (zero-defect run-39, P2-D39-1): the bare host:port rule also
 * covers single-word and underscore service names (backend:9000,
 * redis:6379, db:5432, ai_service:9000) — the run-37 rule required a hyphen
 * or a dotted internal TLD, so plain Docker-service shapes leaked verbatim.
 * The 2–5-digit port plus trailing word boundary keep times (9:30), ratios
 * (16:9), and version fragments (v2:3) untouched.
 */
export function sanitizeAiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'The AI service hit a snag. Please try again.';
  }
  // First line only (drops stack traces); strip URLs, bare internal hosts/IPs,
  // and credentials before anything else — a verbose upstream message must not
  // leak where the backend lives or the keys it used; strip anything
  // resembling a file path; cap length so a verbose backend message can't
  // flood the chat.
  const cleaned = error.message
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
    .replace(/[A-Za-z]:\\[\w\-.\\]+/g, '[file]')
    .trim()
    .slice(0, 200);
  if (/timed?\s?out|abort/i.test(cleaned)) {
    return 'The AI request timed out. Check your connection and try again.';
  }
  if (/network|fetch failed|econnrefused|enotfound|failed to fetch/i.test(cleaned)) {
    return 'The AI service is unreachable. Check your connection and try again.';
  }
  if (/quota|rate.?limit|429|too many requests/i.test(cleaned)) {
    return 'The AI service is busy right now (rate limit). Wait a moment and try again.';
  }
  if (/401|unauthorized|session/i.test(cleaned)) {
    return 'Your session expired. Sign in again and retry.';
  }
  // Pass the cleaned message through only if something meaningful remains —
  // a message that was nothing but a stripped URL/credential falls back to
  // the generic line instead of showing a bare placeholder.
  const meaningful = cleaned.replace(/\[(?:file|link|host|redacted)\]/g, '').trim();
  if (cleaned && meaningful) {
    return `The AI service hit a snag: ${cleaned}`;
  }
  return 'The AI service hit a snag. Please try again.';
}
