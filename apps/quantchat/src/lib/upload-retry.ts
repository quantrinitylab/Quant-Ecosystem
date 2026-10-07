// ============================================================================
// QuantChat - Upload Retry Utility (Task 4.3)
// uploadWithRetry(file, onProgress, maxRetries = 3) with exponential backoff.
//
// On a network failure the upload is retried up to `maxRetries` times with
// delays following an exponential-backoff schedule with base 2:
//   retry 1 -> 1s   (2^0 * 1000)
//   retry 2 -> 2s   (2^1 * 1000)
//   retry 3 -> 4s   (2^2 * 1000)
//
// Validates: Requirements 4.5 (Property 9 - exponential backoff)
// ============================================================================

/** Base delay (ms) for the exponential backoff schedule. */
export const UPLOAD_BACKOFF_BASE_MS = 1000;

/**
 * Computes the backoff delay (ms) to wait *after* the given zero-based attempt
 * index fails, before the next attempt. Uses base-2 exponential growth:
 *   attempt 0 -> 1000ms, attempt 1 -> 2000ms, attempt 2 -> 4000ms, ...
 */
export function backoffDelayMs(attempt: number): number {
  return Math.pow(2, attempt) * UPLOAD_BACKOFF_BASE_MS;
}

/** Progress callback - receives an integer-ish percentage between 0 and 100. */
export type UploadProgressCallback = (progress: number) => void;

export interface UploadResult {
  /** Public URL of the uploaded media. */
  videoUrl: string;
  /** Optional thumbnail / poster URL returned by the media service. */
  thumbnailUrl?: string;
}

/**
 * Error thrown / classified as a transient network failure. These are the only
 * errors that trigger a retry. Validation (4xx) errors are NOT retriable.
 */
export class UploadNetworkError extends Error {
  constructor(message = 'Network error during upload') {
    super(message);
    this.name = 'UploadNetworkError';
  }
}

/** Signature of the low-level transport that performs a single upload attempt. */
export type UploadTransport = (
  file: Blob,
  onProgress: UploadProgressCallback,
  signal?: AbortSignal,
) => Promise<UploadResult>;

export interface UploadWithRetryOptions {
  /** Endpoint the default transport POSTs to. Defaults to `/api/media/upload`. */
  endpoint?: string;
  /** Abort signal to cancel the in-flight upload (and stop retrying). */
  signal?: AbortSignal;
  /** Injectable transport - defaults to an XHR-based uploader with progress. */
  transport?: UploadTransport;
  /** Injectable sleep - defaults to setTimeout. Useful for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Classifies whether an error is a retriable network error. */
  isRetriableError?: (error: unknown) => boolean;
  /** Invoked before each backoff wait with the upcoming retry metadata. */
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function defaultIsRetriableError(error: unknown): boolean {
  return error instanceof UploadNetworkError;
}

/**
 * XHR-based upload transport that reports real upload progress (0-100). fetch()
 * does not expose upload progress, so XMLHttpRequest is used here. Any transport
 * / connection error is normalized into an {@link UploadNetworkError} so it is
 * treated as retriable; HTTP error status codes are treated as terminal.
 */
function createXhrTransport(endpoint: string): UploadTransport {
  return (file, onProgress, signal) =>
    new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const pct = Math.round((event.loaded / event.total) * 100);
          onProgress(Math.min(100, Math.max(0, pct)));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          try {
            const body = xhr.responseText ? JSON.parse(xhr.responseText) : {};
            const data = body?.data ?? body ?? {};
            resolve({
              videoUrl: data.videoUrl ?? data.url ?? '',
              thumbnailUrl: data.thumbnailUrl,
            });
          } catch {
            resolve({ videoUrl: '' });
          }
        } else {
          // HTTP error (4xx/5xx) - terminal, non-retriable validation/server error.
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new UploadNetworkError());
      xhr.ontimeout = () => reject(new UploadNetworkError('Upload timed out'));
      xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));

      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
}

/**
 * Uploads `file`, reporting progress through `onProgress`, retrying up to
 * `maxRetries` times on network failure with exponential backoff (1s, 2s, 4s).
 *
 * Resolves with the {@link UploadResult} on success. Rejects with the last
 * error once all retries are exhausted, or immediately for non-retriable
 * errors (e.g. HTTP 4xx) or when aborted.
 */
export async function uploadWithRetry(
  file: Blob,
  onProgress: UploadProgressCallback,
  maxRetries = 3,
  options: UploadWithRetryOptions = {},
): Promise<UploadResult> {
  const {
    endpoint = '/api/media/upload',
    signal,
    transport = createXhrTransport(endpoint),
    sleep = defaultSleep,
    isRetriableError = defaultIsRetriableError,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError');
    }

    try {
      // Reset progress at the start of each attempt so the bar restarts on retry.
      onProgress(0);
      return await transport(file, onProgress, signal);
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === maxRetries;
      if (isLastAttempt || !isRetriableError(error) || signal?.aborted) {
        throw error;
      }

      const delayMs = backoffDelayMs(attempt);
      onRetry?.({ attempt: attempt + 1, delayMs, error });
      await sleep(delayMs);
    }
  }

  // Unreachable - loop either returns or throws.
  throw lastError ?? new Error('Upload failed');
}

export default uploadWithRetry;
