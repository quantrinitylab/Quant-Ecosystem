/**
 * QuantGit blob (file content) load outcome interpretation.
 *
 * Keeps the code viewer honest: the editor opens ONLY with bytes the backend
 * actually returned. A 404 (or any load failure) must NEVER be papered over
 * with invented template content ("Sovereign workspace documentation",
 * `export function sovereignModule()`, fabricated package.json, ...) or with
 * an invented empty string presented as the file's content — the user would
 * mistake the invention for the real file, and could even commit over it.
 *
 * On 'not-found' / 'error' the caller must show an honest error (toast) and
 * keep the blob editor closed.
 */

export type BlobLoadOutcome =
  | { kind: "loaded"; content: string; sha: string }
  | { kind: "not-found" }
  | { kind: "error"; message: string };

type BlobPayload = {
  success?: unknown;
  message?: unknown;
  error?: { message?: unknown };
  data?: { content?: unknown; sha?: unknown; blobSha?: unknown };
};

/**
 * Interpret a GET /api/repos/:id/file response.
 *
 * - 'loaded': response ok and payload.success — content is the real bytes.
 * - 'not-found': HTTP 404 — the file does not exist at this ref.
 * - 'error': any other failure — the backend's real error message when present.
 */
export function resolveBlobLoadOutcome(args: {
  ok: boolean;
  status: number;
  payload: unknown;
}): BlobLoadOutcome {
  const { ok, status, payload } = args;
  const body = (payload ?? {}) as BlobPayload;

  if (!ok || body.success !== true) {
    if (status === 404) return { kind: "not-found" };
    const backendMessage =
      (typeof body.error?.message === "string" && body.error.message.trim()) ||
      (typeof body.message === "string" && body.message.trim()) ||
      "";
    return {
      kind: "error",
      message: backendMessage || "Failed to load file content.",
    };
  }

  const data = body.data ?? {};
  return {
    kind: "loaded",
    content: typeof data.content === "string" ? data.content : "",
    sha:
      (typeof data.sha === "string" && data.sha) ||
      (typeof data.blobSha === "string" && data.blobSha) ||
      "",
  };
}
