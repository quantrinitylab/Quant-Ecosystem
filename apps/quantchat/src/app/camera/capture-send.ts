// ============================================================================
// QC-F-138 — captured-media send/save helpers for the camera tab.
//
// The backend has no bodyLimit override (Fastify default = 1 MB JSON body).
// Media travels as a base64 data-URL inside the message/memory JSON, and
// base64 inflates a blob by ~1.37x, so ~700 KB is the largest blob whose
// data-URL fits the body limit with room for the rest of the payload.
// Anything bigger must be rejected honestly — never silently truncated,
// never reported as sent. The real fix for large media is the object-storage
// upload tracked as QC-F-063; the presigned endpoint that exists today is
// simulated and must NOT be used to claim an upload happened.
// ============================================================================

export const MAX_SENDABLE_BYTES = 700_000;

/** Human-readable size for the preview's honesty line (e.g. "812 KB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Read a Blob as a data-URL (the transport the chat snap flow already uses). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read captured media'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Photo step-down: re-encode a JPEG photo at a smaller size until it fits
 * the sendable limit (or we run out of attempts, in which case the honest
 * original — still oversize — is returned and the caller rejects it).
 * Video is never re-encoded here; an oversize video stays oversize and the
 * UI must say so instead of pretending.
 */
export async function downscalePhotoToFit(blob: Blob, maxBytes: number): Promise<Blob> {
  if (blob.size <= maxBytes) return blob;
  if (typeof createImageBitmap !== 'function') return blob;

  let current = blob;
  let scale = 0.75;
  for (let attempt = 0; attempt < 3 && current.size > maxBytes; attempt += 1) {
    const bitmap = await createImageBitmap(current);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return current;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const encoded = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.85),
      );
      if (!encoded) return current;
      current = encoded;
    } finally {
      bitmap.close();
    }
    scale *= 0.75;
  }
  return current;
}
