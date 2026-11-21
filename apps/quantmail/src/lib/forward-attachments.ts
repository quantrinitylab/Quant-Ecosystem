/**
 * Forward attachment carryover (`?forward=<id>`) — and persisted-draft
 * attachment restoration (`?draftId=`), which reuses this same resolver so a
 * reopened draft gets its files back through one code path.
 *
 * Forwarding used to send with zero attachments and no warning: the compose
 * page parsed `?forward=` but never read the original's attachments, and the
 * composer had no way to seed them. This module is the carryover core: given
 * the original message's wire attachments, it reads each file's bytes through
 * the same byte-source resolution the thread view uses
 * (`attachmentByteSource` in `./mail-attachments` — inline `data:` URLs,
 * AttachmentService rows, QuantDrive picks) and rebuilds them as composer
 * attachments (bytes inline as `data:` URLs, exactly like a fresh local file
 * pick), so the existing compose/draft/send path persists and delivers them
 * through the existing outbound resolver.
 *
 * Nothing is ever silently dropped: a file whose bytes cannot be read, or
 * that would breach the compose size budget, lands in `dropped` with the
 * reason, and the compose page shows that list to the sender before send.
 * Size caps mirror the composer's own caps (EmailComposer) and the backend's
 * trust-boundary caps (backend/lib/outbound-attachments.ts) — a forwarded
 * file must pass the same budget a freshly picked file does.
 *
 * Bounded resolution, in three layers (this is what "metadata preflight +
 * bounded streaming" means here, stated plainly rather than oversold):
 *  1. Metadata preflight — a file whose DECLARED size already breaches the
 *     per-file cap, or would push the running total past the total cap, is
 *     dropped WITHOUT its bytes ever being fetched. The loader is never
 *     called for it, so an oversize file costs no download at all.
 *  2. Sequential, abortable resolution — files resolve strictly one at a
 *     time (never N concurrent downloads), and an AbortSignal stops the
 *     loop: navigating from forward A to forward B aborts A's remaining
 *     resolutions instead of letting them land in B's composer. The byte
 *     loader itself goes through `loadAttachmentBytes`' ArrayBuffer
 *     interface, so this is bounded sequential resolution, not incremental
 *     stream decoding — a carried file is still held whole in memory, at
 *     most 20 MB, exactly like a freshly picked local file.
 *  3. Actual-byte caps — a file whose declared size lied (or was absent)
 *     is still judged on its real bytes: empty, over per-file, or over
 *     total all drop with a reason. The running total counts carried bytes
 *     only, so one oversize file never blocks the files after it.
 */

import {
  attachmentByteSource,
  type AttachmentByteSource,
} from './mail-attachments';

/** One wire attachment of the message being forwarded (format-email shape). */
export interface ForwardOriginalAttachment {
  id?: string | null;
  attachmentId?: string | null;
  filename?: string | null;
  name?: string | null;
  mimeType?: string | null;
  type?: string | null;
  contentType?: string | null;
  size?: number | null;
  url?: string | null;
}

/** A composer attachment, matching EmailComposer's `Attachment` contract. */
export interface ForwardCarriedAttachment {
  id: string;
  name: string;
  filename: string;
  size: number;
  type: string;
  mimeType: string;
  url: string;
}

/** An original attachment that could not be carried over, with the reason. */
export interface ForwardDroppedAttachment {
  filename: string;
  reason: string;
}

export interface ForwardCarryoverResult {
  carried: ForwardCarriedAttachment[];
  dropped: ForwardDroppedAttachment[];
}

/** Mirrors EmailComposer's MAX_ATTACHMENT_BYTES. */
export const FORWARD_MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
/** Mirrors EmailComposer's MAX_ATTACHMENTS_TOTAL_BYTES. */
export const FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024;

/**
 * Reads one attachment's bytes from its resolved source. Injected for tests.
 * The optional signal is forwarded to the real byte loader so a navigation
 * away can cancel an in-flight download instead of racing it.
 */
export type ForwardByteLoader = (
  source: AttachmentByteSource,
  signal?: AbortSignal,
) => Promise<ArrayBuffer>;

/**
 * ArrayBuffer -> `data:<mime>;base64,...` without blowing the call stack:
 * `String.fromCharCode(...bytes)` on a multi-megabyte buffer throws, so the
 * bytes are chunked through `btoa` 32 KiB at a time.
 */
export function arrayBufferToDataUrl(
  bytes: ArrayBuffer,
  mimeType: string,
): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK));
  }
  return `data:${mimeType || 'application/octet-stream'};base64,${btoa(binary)}`;
}

function displayName(att: ForwardOriginalAttachment): string {
  return att.filename || att.name || 'attachment';
}

function mimeOf(att: ForwardOriginalAttachment): string {
  return (
    att.mimeType || att.type || att.contentType || 'application/octet-stream'
  );
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === 'AbortError' || err.name === 'AbortError')
  );
}

function abortError(): Error {
  const err = new Error('Attachment resolution was aborted.');
  err.name = 'AbortError';
  return err;
}

/**
 * Carry an original message's attachments into the composer.
 *
 * Order is preserved; the running total counts carried bytes only, so one
 * oversize file never blocks the files after it — each file is judged on its
 * own, and a file that would push the total past the budget is dropped with
 * its reason instead of silently vanishing. A loader failure keeps the
 * backend's own words when it has them (e.g. a malware-scan block), never an
 * invented reason.
 *
 * The ONLY way this rejects is an abort: per-file failures are drops, never
 * throws, so a caller must not turn one unreadable file into a failed
 * forward. An abort rejects so the caller can tell "superseded run" apart
 * from "resolved with drops" and discard the partial result.
 */
export async function carryForwardAttachments(
  attachments: ForwardOriginalAttachment[] | null | undefined,
  loadBytes: ForwardByteLoader,
  options?: { signal?: AbortSignal },
): Promise<ForwardCarryoverResult> {
  const signal = options?.signal;
  const carried: ForwardCarriedAttachment[] = [];
  const dropped: ForwardDroppedAttachment[] = [];
  let totalBytes = 0;

  for (const att of attachments ?? []) {
    if (signal?.aborted) throw abortError();
    const filename = displayName(att);

    // Metadata preflight: a declared size that already breaches a cap drops
    // the file WITHOUT a download. Declared sizes are advisory (a sender's
    // wire size may not be bytes), so this only fires on a positive number;
    // the actual-byte checks below are still the enforcement point.
    const declaredSize =
      typeof att.size === 'number' && Number.isFinite(att.size) && att.size > 0
        ? att.size
        : null;
    if (declaredSize !== null && declaredSize > FORWARD_MAX_ATTACHMENT_BYTES) {
      dropped.push({
        filename,
        reason: `it is larger than the ${FORWARD_MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per-file limit`,
      });
      continue;
    }
    if (
      declaredSize !== null &&
      totalBytes + declaredSize > FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES
    ) {
      dropped.push({
        filename,
        reason: `carrying it would exceed the ${FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB total attachment limit`,
      });
      continue;
    }

    // The thread views map the wire `id` onto `attachmentId` the same way
    // (PersonThread / ConversationalThreadView): a stored row's `id` IS its
    // AttachmentService id; a composer-minted or `meta_` id fails the strict
    // shape check inside `attachmentByteSource` and falls through to the URL.
    const source = attachmentByteSource({
      url: att.url ?? undefined,
      attachmentId: att.attachmentId ?? att.id ?? undefined,
    });
    if (!source) {
      dropped.push({
        filename,
        reason:
          'its file was not kept with the original message, so there is nothing to forward',
      });
      continue;
    }
    let bytes: ArrayBuffer;
    try {
      bytes = await loadBytes(source, signal);
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) throw abortError();
      dropped.push({
        filename,
        reason:
          err instanceof Error && err.message
            ? err.message
            : 'its file could not be read',
      });
      continue;
    }
    if (signal?.aborted) throw abortError();
    if (bytes.byteLength === 0) {
      dropped.push({ filename, reason: 'its file is empty' });
      continue;
    }
    if (bytes.byteLength > FORWARD_MAX_ATTACHMENT_BYTES) {
      dropped.push({
        filename,
        reason: `it is larger than the ${FORWARD_MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB per-file limit`,
      });
      continue;
    }
    if (totalBytes + bytes.byteLength > FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES) {
      dropped.push({
        filename,
        reason: `carrying it would exceed the ${FORWARD_MAX_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB total attachment limit`,
      });
      continue;
    }
    const mimeType = mimeOf(att);
    carried.push({
      id: `att_fwd_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name: filename,
      filename,
      size: bytes.byteLength,
      type: mimeType,
      mimeType,
      url: arrayBufferToDataUrl(bytes, mimeType),
    });
    totalBytes += bytes.byteLength;
  }

  return { carried, dropped };
}
