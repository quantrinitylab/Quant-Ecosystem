// ============================================================================
// QuantDrive public share landing — text preview fetch lifecycle
// (fix/qm-drive-share-text-preview)
//
// The previous DriveFileCard effect depended on the very state it set
// (`textPreviewState` in its own dependency list): setting it to 'loading'
// re-ran the effect, whose cleanup flipped `cancelled = true`, so the real
// fetch result was always discarded and a text share could sit on
// "Loading preview…" forever. It also fired a byte request for a
// password-protected file before any password existed, and once it errored
// there was no path back — a corrected password never retried.
//
// This module owns the two decisions the component must NOT re-derive from
// its own render state, so the component effect can depend on them without
// self-cancelling:
//
//   decideTextPreview — pure gate: 'locked' (password required, none
//     submitted yet: NO byte request), 'too-large' (known size over the cap:
//     NO byte request), 'fetch', or 'not-text'.
//   fetchTextPreview — the byte policy, published here and in the UI:
//     at most `maxBytes` are ever fetched for an inline preview. A
//     Content-Length over the cap short-circuits before any body read; a
//     streamed body is cancelled the moment the cap is crossed (the tail is
//     never downloaded just to be sliced away, unlike the old
//     `res.text()`-then-slice). The request takes an AbortSignal so
//     unmount / unlock / retry cancels the in-flight fetch instead of
//     racing it. A 401/403 surfaces as 'wrong-password' so the UI can offer
//     the corrected-password retry path instead of a dead generic error —
//     except 403 FILE_QUARANTINED, which stays a generic error (a quarantined
//     file must never be mislabelled "wrong password").
// ============================================================================

export type TextPreviewDecision = 'fetch' | 'locked' | 'too-large' | 'not-text';

export interface TextPreviewGateInput {
  previewKind: 'image' | 'pdf' | 'text' | null;
  requiresPassword: boolean;
  /** Password the viewer explicitly submitted via Unlock/Retry — never the live input. */
  submittedPassword: string | null;
  size: number | null;
  maxBytes: number;
}

/**
 * Pure gate for the text preview. Returns 'locked' — and therefore causes NO
 * network request — while a password-protected file has no submitted
 * password yet, even though the password input may be empty or half-typed.
 */
export function decideTextPreview(input: TextPreviewGateInput): TextPreviewDecision {
  if (input.previewKind !== 'text') return 'not-text';
  if (typeof input.size === 'number' && input.size > input.maxBytes) return 'too-large';
  if (input.requiresPassword && input.submittedPassword === null) return 'locked';
  return 'fetch';
}

export type TextPreviewResult =
  | { status: 'ok'; text: string; truncated: boolean }
  | { status: 'too-large' }
  | { status: 'wrong-password' }
  | { status: 'error' }
  | { status: 'aborted' };

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetch at most `maxBytes` of a text file for inline preview.
 *
 * Policy: Content-Length over the cap → 'too-large' with no body read.
 * Streamed body → reader cancelled at the cap, result truncated. No stream
 * (or a body that cannot be streamed) → whole-body read then slice, which
 * is only reached when the size was unknown and the server did not stream.
 * Aborts (unmount / retry) resolve to 'aborted', never to a fake error.
 */
export async function fetchTextPreview(
  url: string,
  options: {
    fetchImpl?: FetchImpl;
    signal?: AbortSignal;
    maxBytes: number;
  },
): Promise<TextPreviewResult> {
  const { fetchImpl = fetch, signal, maxBytes } = options;
  let res: Response;
  try {
    res = await fetchImpl(url, { credentials: 'include', signal });
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { status: 'aborted' };
    }
    return { status: 'error' };
  }
  if (signal?.aborted) return { status: 'aborted' };
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      // A 403 is NOT always a wrong password: a quarantined file is refused
      // with 403 FILE_QUARANTINED whether or not a password was supplied.
      // Labelling that "wrong password" would lie and send the viewer into a
      // futile retry loop, so it stays a generic error.
      let code: string | null = null;
      try {
        if (typeof res.json === 'function') {
          const data = (await res.json()) as { error?: { code?: string } };
          code = typeof data?.error?.code === 'string' ? data.error.code : null;
        }
      } catch {
        code = null;
      }
      if (code === 'FILE_QUARANTINED') return { status: 'error' };
      return { status: 'wrong-password' };
    }
    return { status: 'error' };
  }
  const contentLength = res.headers?.get('content-length');
  const declared = contentLength === null ? NaN : Number(contentLength);
  if (!Number.isNaN(declared) && declared > maxBytes) {
    // Never read the body of a file already known to exceed the preview cap.
    try {
      await res.body?.cancel();
    } catch {
      // Best-effort only; the cap decision stands regardless.
    }
    return { status: 'too-large' };
  }
  const reader = res.body?.getReader?.();
  if (!reader) {
    const text = await res.text();
    if (signal?.aborted) return { status: 'aborted' };
    if (text.length > maxBytes) {
      return { status: 'ok', text: text.slice(0, maxBytes), truncated: true };
    }
    return { status: 'ok', text, truncated: false };
  }
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (bytes > maxBytes) {
        // Stop downloading the tail: cancel the stream, do not buffer it.
        truncated = true;
        try {
          await reader.cancel();
        } catch {
          // Best-effort only.
        }
        break;
      }
      if (signal?.aborted) return { status: 'aborted' };
    }
    if (!truncated) text += decoder.decode();
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { status: 'aborted' };
    }
    return { status: 'error' };
  }
  if (signal?.aborted) return { status: 'aborted' };
  if (truncated) text = text.slice(0, maxBytes);
  return { status: 'ok', text, truncated };
}
