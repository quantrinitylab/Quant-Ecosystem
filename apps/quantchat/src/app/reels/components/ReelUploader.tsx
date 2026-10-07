// ============================================================================
// QuantChat - ReelUploader Component (Tasks 4.2 & 4.4)
// Background, navigation-safe reel upload with a progress bar (0-100%).
//
// Navigation-safe: active uploads live in a MODULE-LEVEL store (not component
// state), so the upload keeps running even if the user navigates away and this
// component unmounts. Any mounted instance subscribes to the store via
// useSyncExternalStore and re-renders as progress changes.
//
// Client-side validation (Task 4.4): before an upload starts, the file is
// checked against the size (100MB) / duration (60s) limits and rejected with a
// clear error if it is too large or too long.
//
// Requirements: 4.3 (publish/upload), 4.4 (progress + navigate away),
//               4.5 (retry), 4.6 (size/duration validation), 4.7 (discoverable)
// ============================================================================
'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { uploadWithRetry, type UploadWithRetryOptions } from '../../../lib/upload-retry';
import { validateReelFile } from '../../../lib/reel-validation';
import type { ReelEditData, TextOverlay } from './ReelEditor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReelUploadStatus =
  | 'validating'
  | 'uploading'
  | 'retrying'
  | 'creating'
  | 'success'
  | 'failed';

export interface BackgroundReelUpload {
  id: string;
  caption: string;
  status: ReelUploadStatus;
  /** 0-100 upload progress. */
  progress: number;
  /** Current retry attempt (0 = first try). */
  retryCount: number;
  error: string | null;
  /** Populated once the reel is created on the backend. */
  reelId?: string;
}

export interface StartReelUploadInput {
  /** Video data to upload. */
  file: Blob;
  /** Duration in seconds (already trimmed) - used for validation. */
  durationSeconds: number;
  caption: string;
  coverFrameTimestamp: number;
  textOverlays: TextOverlay[];
}

// ---------------------------------------------------------------------------
// Module-level background upload store (navigation-safe)
// ---------------------------------------------------------------------------

const uploads = new Map<string, BackgroundReelUpload>();
const listeners = new Set<() => void>();
let snapshot: BackgroundReelUpload[] = [];

function emit(): void {
  // Rebuild an immutable snapshot so useSyncExternalStore detects the change.
  snapshot = Array.from(uploads.values());
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BackgroundReelUpload[] {
  return snapshot;
}

function getServerSnapshot(): BackgroundReelUpload[] {
  return [];
}

function patchUpload(id: string, patch: Partial<BackgroundReelUpload>): void {
  const current = uploads.get(id);
  if (!current) return;
  uploads.set(id, { ...current, ...patch });
  emit();
}

/** Hook exposing the live list of background reel uploads. */
export function useBackgroundReelUploads(): BackgroundReelUpload[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Removes a finished (success/failed) upload from the store. */
export function dismissReelUpload(id: string): void {
  if (uploads.delete(id)) emit();
}

interface CreateReelPayload {
  videoUrl: string;
  thumbnailUrl?: string;
  caption: string;
  duration: number;
  coverFrameTimestamp: number;
  textOverlays: TextOverlay[];
}

async function defaultCreateReel(payload: CreateReelPayload): Promise<{ id: string }> {
  const res = await fetch('/api/reels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Failed to create reel (status ${res.status})`);
  }
  const json = await res.json();
  return json?.data ?? json;
}

export interface StartReelUploadDeps {
  /** Injectable upload implementation (defaults to uploadWithRetry). */
  upload?: typeof uploadWithRetry;
  uploadOptions?: UploadWithRetryOptions;
  /** Injectable create-reel call (defaults to POST /api/reels). */
  createReel?: (payload: CreateReelPayload) => Promise<{ id: string }>;
  /** Max retries forwarded to uploadWithRetry. */
  maxRetries?: number;
}

/**
 * Starts a background, navigation-safe reel upload. Returns the upload id
 * immediately; progress is tracked in the module store. Validation failures
 * surface as a `failed` upload entry rather than throwing.
 */
export function startReelUpload(
  input: StartReelUploadInput,
  deps: StartReelUploadDeps = {},
): string {
  const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const initial: BackgroundReelUpload = {
    id,
    caption: input.caption,
    status: 'validating',
    progress: 0,
    retryCount: 0,
    error: null,
  };
  uploads.set(id, initial);
  emit();

  // --- Task 4.4: client-side validation BEFORE upload begins ---
  const validation = validateReelFile({
    sizeBytes: input.file.size,
    durationSeconds: input.durationSeconds,
  });
  if (!validation.valid) {
    patchUpload(id, { status: 'failed', error: validation.error ?? 'Invalid file' });
    return id;
  }

  const {
    upload = uploadWithRetry,
    uploadOptions,
    createReel = defaultCreateReel,
    maxRetries = 3,
  } = deps;

  // Fire-and-forget: the promise is intentionally not awaited by the caller so
  // navigation does not cancel the upload.
  void (async () => {
    try {
      patchUpload(id, { status: 'uploading', progress: 0 });

      const result = await upload(
        input.file,
        (progress) => patchUpload(id, { progress, status: 'uploading' }),
        maxRetries,
        {
          ...uploadOptions,
          onRetry: (info) => {
            patchUpload(id, { status: 'retrying', retryCount: info.attempt });
            uploadOptions?.onRetry?.(info);
          },
        },
      );

      patchUpload(id, { status: 'creating', progress: 100 });

      const created = await createReel({
        videoUrl: result.videoUrl,
        thumbnailUrl: result.thumbnailUrl,
        caption: input.caption,
        duration: input.durationSeconds,
        coverFrameTimestamp: input.coverFrameTimestamp,
        textOverlays: input.textOverlays,
      });

      patchUpload(id, { status: 'success', reelId: created.id });
    } catch (error) {
      patchUpload(id, {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Upload failed',
      });
    }
  })();

  return id;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ReelUploaderProps {
  /**
   * Optional edit data + file to kick off an upload when this component is
   * given fresh inputs. When omitted, the component simply renders the status
   * of any in-flight background uploads.
   */
  pending?: { file: Blob; edit: ReelEditData; caption: string } | null;
  /** Called after an upload kicks off (e.g. to navigate to the feed). */
  onStarted?: (uploadId: string) => void;
}

const STATUS_LABEL: Record<ReelUploadStatus, string> = {
  validating: 'Checking video…',
  uploading: 'Uploading…',
  retrying: 'Connection issue — retrying…',
  creating: 'Publishing…',
  success: 'Posted!',
  failed: 'Upload failed',
};

export function ReelUploader({ pending, onStarted }: ReelUploaderProps) {
  const activeUploads = useBackgroundReelUploads();

  const handlePublish = useCallback(() => {
    if (!pending) return;
    const uploadId = startReelUpload({
      file: pending.file,
      durationSeconds: pending.edit.duration,
      caption: pending.caption,
      coverFrameTimestamp: pending.edit.coverFrameTimestamp,
      textOverlays: pending.edit.textOverlays,
    });
    onStarted?.(uploadId);
  }, [pending, onStarted]);

  return (
    <div className="w-full">
      {pending && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handlePublish}
          className="w-full rounded-full bg-purple-600 py-3 text-sm font-semibold text-white"
        >
          Publish reel
        </motion.button>
      )}

      {/* Floating background-upload progress cards */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {activeUploads.map((upload) => (
            <motion.div
              key={upload.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="pointer-events-auto w-full max-w-sm rounded-xl bg-gray-900/95 p-3 shadow-lg backdrop-blur"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="truncate text-xs font-medium text-white">
                  {upload.caption || 'New reel'}
                </span>
                <span
                  className={`ml-2 shrink-0 text-xs font-semibold ${
                    upload.status === 'failed'
                      ? 'text-rose-400'
                      : upload.status === 'success'
                        ? 'text-green-400'
                        : 'text-gray-300'
                  }`}
                >
                  {STATUS_LABEL[upload.status]}
                </span>
              </div>

              {/* Progress bar (0-100%) */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
                <motion.div
                  className={`h-full rounded-full ${
                    upload.status === 'failed' ? 'bg-rose-500' : 'bg-purple-500'
                  }`}
                  initial={false}
                  animate={{ width: `${upload.progress}%` }}
                  transition={{ ease: 'easeOut', duration: 0.2 }}
                />
              </div>

              {(upload.status === 'success' || upload.status === 'failed') && (
                <div className="mt-2 flex items-center justify-between">
                  {upload.status === 'failed' && upload.error && (
                    <span className="mr-2 truncate text-[11px] text-rose-300">{upload.error}</span>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissReelUpload(upload.id)}
                    className="ml-auto text-[11px] font-medium text-gray-400"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default ReelUploader;
