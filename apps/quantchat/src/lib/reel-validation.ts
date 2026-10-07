// ============================================================================
// QuantChat - Reel Client-Side Validation (Task 4.4)
// Rejects files that exceed the maximum size (100MB) or maximum duration (60s)
// BEFORE any upload begins, returning a clear, user-facing error message.
//
// Validates: Requirements 4.6 (Property 10 - size/duration validation)
// ============================================================================

/** Maximum allowed reel file size: 100MB. */
export const MAX_REEL_SIZE_BYTES = 100 * 1024 * 1024;

/** Maximum allowed reel duration: 60 seconds. */
export const MAX_REEL_DURATION_SECONDS = 60;

/** Minimum allowed reel duration: 5 seconds (enforced by the trim editor). */
export const MIN_REEL_DURATION_SECONDS = 5;

export interface ReelValidationInput {
  /** File size in bytes. */
  sizeBytes: number;
  /** Video duration in seconds. */
  durationSeconds: number;
}

export interface ReelValidationResult {
  valid: boolean;
  /** Human-readable reason the file was rejected. Present only when invalid. */
  error?: string;
}

function formatMegabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Validates a reel's size and duration against the platform limits.
 *
 * A file is rejected (valid: false) when EITHER:
 *   - its size exceeds {@link MAX_REEL_SIZE_BYTES} (100MB), OR
 *   - its duration exceeds {@link MAX_REEL_DURATION_SECONDS} (60s).
 *
 * This check runs before the upload begins so oversized content never leaves
 * the device.
 */
export function validateReelFile({
  sizeBytes,
  durationSeconds,
}: ReelValidationInput): ReelValidationResult {
  if (sizeBytes > MAX_REEL_SIZE_BYTES) {
    return {
      valid: false,
      error: `Video is too large (${formatMegabytes(sizeBytes)}MB). The maximum reel size is 100MB.`,
    };
  }

  if (durationSeconds > MAX_REEL_DURATION_SECONDS) {
    return {
      valid: false,
      error: `Video is too long (${Math.round(durationSeconds)}s). Reels can be at most 60 seconds.`,
    };
  }

  return { valid: true };
}

export default validateReelFile;
