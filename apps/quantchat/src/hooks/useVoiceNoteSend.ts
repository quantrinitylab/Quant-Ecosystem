// ============================================================================
// useVoiceNoteSend — QC-F-573 voice-note send pipeline.
//
// recorded -> uploading -> finalizing -> sending -> sent | failed-*
// The recorder blob is RETAINED in state on every failure; retry reuses the
// SAME clientMsgId (idempotent: no duplicate message, no send before the
// finalize step returns). Upload progress comes ONLY from XHR progress
// events — no synthetic ticks. A message is never rendered as sent/uploaded
// unless the corresponding step actually completed.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export type VoiceNoteSendStage =
  | 'recorded'
  | 'uploading'
  | 'finalizing'
  | 'sending'
  | 'sent'
  | 'failed-upload'
  | 'failed-finalize'
  | 'failed-send';

export interface VoiceNoteJob {
  stage: VoiceNoteSendStage;
  /** The real recorder blob — retained until the send reconciles. */
  blob: Blob;
  /** Recorder elapsed ms (real). */
  durationMs: number;
  /** Client-generated idempotency key, stable across retries of this job. */
  clientMsgId: string;
  filename: string;
  contentType: string;
  mediaId: string | null;
  mediaUrl: string | null;
  /** 0..1 — XHR progress events only; never synthesized. */
  uploadProgress: number;
  error: string | null;
}

function newJob(blob: Blob, durationMs: number): VoiceNoteJob {
  const clientMsgId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `vn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const contentType = blob.type || 'audio/webm';
  return {
    stage: 'recorded',
    blob,
    durationMs,
    clientMsgId,
    filename: `voice-${clientMsgId}.webm`,
    contentType,
    mediaId: null,
    mediaUrl: null,
    uploadProgress: 0,
    error: null,
  };
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function useVoiceNoteSend(conversationId: string) {
  const [job, setJob] = useState<VoiceNoteJob | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const jobRef = useRef<VoiceNoteJob | null>(null);
  const queryClient = useQueryClient();

  jobRef.current = job;

  const fail = useCallback((stage: VoiceNoteSendStage, error: string) => {
    // The blob is retained in state — retry is always possible, and the
    // composer never claims success that did not happen.
    setJob((prev) => (prev ? { ...prev, stage, error } : prev));
  }, []);

  /** PUT the blob to the presigned URL with real XHR progress. */
  const putBlob = useCallback(
    (uploadUrl: string, contentType: string, blob: Blob): Promise<void> =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            const progress = Math.min(1, event.loaded / event.total);
            setJob((prev) => (prev ? { ...prev, uploadProgress: progress } : prev));
          }
        };
        xhr.onload = () => {
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            setJob((prev) => (prev ? { ...prev, uploadProgress: 1 } : prev));
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error('Upload network error'));
        };
        xhr.onabort = () => {
          xhrRef.current = null;
          reject(new Error('Upload interrupted'));
        };
        xhr.send(blob);
      }),
    [],
  );

  const runPipeline = useCallback(
    async (starting: VoiceNoteJob) => {
      let current = starting;
      try {
        // 1. Presign (fresh mediaId each attempt; the send idempotency key is
        //    the stable clientMsgId, not the mediaId).
        current = { ...current, stage: 'uploading', error: null, uploadProgress: 0 };
        setJob(current);
        const presign = await apiClient.createMediaUploadUrl({
          filename: current.filename,
          contentType: current.contentType,
        });
        if (!presign.success || !presign.data) {
          throw new Error(
            presign.error?.message || 'Could not get an upload URL (storage unavailable?)',
          );
        }
        current = { ...current, mediaId: presign.data.mediaId };
        setJob(current);

        // 2. Upload the real bytes.
        await putBlob(presign.data.uploadUrl, current.contentType, current.blob);
        // Re-sync the local copy: putBlob updated progress through
        // functional setJob calls that the `current` snapshot below would
        // otherwise clobber with the stale pre-upload value.
        current = { ...current, uploadProgress: 1 };

        // 3. Finalize — server HEAD-verifies before persisting.
        current = { ...current, stage: 'finalizing' };
        setJob(current);
        const finalized = await apiClient.finalizeMediaUpload(current.mediaId!, {
          filename: current.filename,
          contentType: current.contentType,
          durationMs: current.durationMs,
        });
        if (!finalized.success || !finalized.data) {
          throw new Error(finalized.error?.message || 'Upload could not be verified');
        }
        current = { ...current, mediaUrl: finalized.data.url };
        setJob(current);

        // 4. Send — no send ever happens before finalize returns.
        current = { ...current, stage: 'sending' };
        setJob(current);
        const sent = await apiClient.sendMessage({
          conversationId,
          type: 'audio',
          content: '',
          mediaUrl: current.mediaUrl!,
          metadata: {
            voiceDurationMs: current.durationMs,
            mimeType: current.contentType,
            mediaId: current.mediaId,
          },
          clientMsgId: current.clientMsgId,
        });
        if (!sent.success) {
          throw new Error(sent.error?.message || 'Failed to send voice note');
        }
        setJob({ ...current, stage: 'sent', error: null });
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      } catch (err) {
        // The failure stage is whatever stage the pipeline was in — the
        // blob stays in state for an honest retry.
        const stage: VoiceNoteSendStage =
          current.stage === 'finalizing'
            ? 'failed-finalize'
            : current.stage === 'sending'
              ? 'failed-send'
              : 'failed-upload';
        fail(stage, errMessage(err, 'Voice note failed'));
      }
    },
    [conversationId, fail, putBlob, queryClient],
  );

  /** Start a new voice-note job from a freshly recorded blob. */
  const start = useCallback(
    (blob: Blob, durationMs: number) => {
      // Abort any previous in-flight job before starting a new one.
      if (xhrRef.current) xhrRef.current.abort();
      const job0 = newJob(blob, durationMs);
      setJob(job0);
      void runPipeline(job0);
    },
    [runPipeline],
  );

  /** Retry the current job with the SAME clientMsgId (idempotent). */
  const retry = useCallback(() => {
    const current = jobRef.current;
    if (!current || current.stage === 'sent') return;
    // If finalize already succeeded (mediaUrl present), skip straight to
    // re-sending; otherwise restart from presign with the same clientMsgId.
    if (current.mediaUrl && current.stage === 'failed-send') {
      const resumed = { ...current, stage: 'sending' as const, error: null };
      setJob(resumed);
      void (async () => {
        try {
          const sent = await apiClient.sendMessage({
            conversationId,
            type: 'audio',
            content: '',
            mediaUrl: resumed.mediaUrl!,
            metadata: {
              voiceDurationMs: resumed.durationMs,
              mimeType: resumed.contentType,
              mediaId: resumed.mediaId,
            },
            clientMsgId: resumed.clientMsgId,
          });
          if (!sent.success) throw new Error(`send: ${sent.error?.message || 'Failed to send'}`);
          setJob({ ...resumed, stage: 'sent', error: null });
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        } catch (err) {
          fail('failed-send', errMessage(err, 'Voice note failed'));
        }
      })();
      return;
    }
    void runPipeline({ ...current, error: null });
  }, [conversationId, fail, queryClient, runPipeline]);

  /** Discard the job (blob released). */
  const dismiss = useCallback(() => {
    if (xhrRef.current) xhrRef.current.abort();
    setJob(null);
  }, []);

  // Unmount/navigation with a pending upload: never silently claim success.
  // Abort the in-flight PUT and surface "interrupted — retry" honestly.
  useEffect(() => {
    return () => {
      const xhr = xhrRef.current;
      const current = jobRef.current;
      if (xhr && current && current.stage !== 'sent') {
        xhr.abort();
      }
    };
  }, []);

  return { job, start, retry, dismiss };
}

export default useVoiceNoteSend;
