// ============================================================================
// stt-retry — STT transcription with retry-safe audio retention (F-052)
// ============================================================================
// Pure, testable core behind VoiceModeModal's "retry transcription without
// re-recording" flow.
//
// - transcribeAudio(audio, post): POSTs the SAME captured audio blob to the
//   STT endpoint and returns { text, latencyMs }. It never captures audio —
//   the caller (VoiceModeModal) keeps the failed turn's WAV blob in memory
//   and passes it back in for a retry, so the user never has to re-record.
// - latencyMs is honest: measured from audio-sent to transcript-received,
//   clamped at 0 so clock skew can never render a negative "took Xs".
// - No backend change; no fake data — text and timing come from the server.
// ============================================================================

/** The STT endpoint the retry re-POSTs to (same one as the first attempt). */
export const STT_ENDPOINT = '/api/voice/stt';

export interface TranscribeResult {
  /** Transcript text returned by the server. */
  text: string;
  /** Honest per-turn latency: audio-sent -> transcript-received, in ms. */
  latencyMs: number;
}

/** Thrown when there is no usable audio to transcribe (nothing to retry). */
export class SttEmptyAudioError extends Error {
  readonly code = 'EMPTY_AUDIO';
  constructor() {
    super('No audio captured — nothing to transcribe.');
    this.name = 'SttEmptyAudioError';
  }
}

/**
 * Transcribe one audio blob via the STT endpoint.
 *
 * @param audio  the captured WAV blob (first attempt or retry — same blob)
 * @param post   sends the multipart form; e.g. (form) => apiFetchRaw('/api/voice/stt', { method: 'POST', body: form })
 * @param now    clock; defaults to performance.now()
 * @throws SttEmptyAudioError when audio is missing/empty (not retryable)
 * @throws Error with an honest, user-safe message on network/server failures
 */
export async function transcribeAudio(
  audio: Blob | null | undefined,
  post: (form: FormData) => Promise<Response>,
  now: () => number = () => performance.now(),
): Promise<TranscribeResult> {
  if (!audio || audio.size === 0) {
    throw new SttEmptyAudioError();
  }
  const form = new FormData();
  form.append('file', audio, 'audio.wav');
  const t0 = now();
  let res: Response;
  try {
    res = await post(form);
  } catch {
    throw new Error(
      'Transcription request failed: the server could not be reached. Check your connection and retry.',
    );
  }
  const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  // Measure only after the transcript payload is fully parsed — honest end-to-end.
  // Clamp at 0: clock skew must never produce a negative "took Xs".
  const latencyMs = Math.max(0, now() - t0);
  if (!res.ok || !data.text?.trim()) {
    const serverMsg = data.error?.trim();
    throw new Error(
      serverMsg
        ? `Transcription failed: ${serverMsg}`
        : `Transcription failed: the server returned an error (HTTP ${res.status}).`,
    );
  }
  return { text: data.text.trim(), latencyMs };
}

/** "took 3.2s" — one decimal, never negative, never fabricated. */
export function formatTurnLatency(latencyMs: number): string {
  const seconds = Math.max(0, latencyMs) / 1000;
  return `took ${seconds.toFixed(1)}s`;
}
