'use client';

// ============================================================================
// voice-transcribe — honest speech-to-text for AskQuantPanel
// ============================================================================
// Uploads captured audio to the app's /api/voice/stt proxy (Next.js ->
// backend /voice/stt -> Meta STT, OpenAI Whisper fallback) and returns the
// transcript as a string. It NEVER fabricates a transcript: every failure
// mode (empty capture, oversized audio, STT outage, empty result) throws an
// honest Error whose message is safe to surface verbatim in the UI.
//
// Audio travels as multipart FormData — no base64 conversion, so long
// recordings cannot hit the btoa/String.fromCharCode spread stack overflow.
// ============================================================================

import { apiFetchRaw } from '@quant/api-client';

/**
 * Client-side upload cap, aligned with the backend Meta STT limit
 * (META_STT_MAX_BYTES in backend/services/meta-voice.service.ts).
 */
export const MAX_VOICE_UPLOAD_BYTES = 32 * 1024 * 1024;

interface SttResponse {
  text?: string;
  error?: string;
}

/**
 * Transcribe a captured audio blob via the real STT pipeline.
 * @throws Error with an honest, user-facing message on every failure path.
 */
export async function transcribeVoiceAudio(audio: Blob | null): Promise<string> {
  if (!audio || audio.size === 0) {
    throw new Error('No audio captured — tap the mic and try speaking again.');
  }

  if (audio.size > MAX_VOICE_UPLOAD_BYTES) {
    throw new Error(
      `Recording is too long (${(audio.size / 1048576).toFixed(1)} MB). ` +
        'Keep voice input shorter and try again.',
    );
  }

  const form = new FormData();
  form.append('file', audio, 'voice.wav');

  let res: Response;
  try {
    res = await apiFetchRaw('/api/voice/stt', { method: 'POST', body: form });
  } catch (err) {
    throw new Error(
      `Could not reach the transcription service: ${
        err instanceof Error ? err.message : 'network error'
      }`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as SttResponse;
  if (!res.ok || !data.text) {
    const detail = data.error?.trim();
    throw new Error(
      detail
        ? `Transcription failed: ${detail}`
        : `Transcription failed (server returned ${res.status}).`,
    );
  }

  const transcript = data.text.trim();
  if (!transcript) {
    throw new Error("Couldn't hear any speech in that recording — try again.");
  }

  return transcript;
}
