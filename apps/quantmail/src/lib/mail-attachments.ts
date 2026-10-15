/**
 * Mail attachments — where an attachment's bytes can be read from, if anywhere.
 *
 * Four shapes reach a thread today:
 * - Inline `data:` URLs. The composer reads each file with `readAsDataURL` and the message JSON
 *   carries it, so sent mail — and mail delivered between QuantMail mailboxes — has its bytes.
 * - AttachmentService rows (`att_<uuid>`): bytes in object storage, read through
 *   `GET /api/attachments/:id/download`, which checks ownership and malware-scans first.
 *   Received mail's files are kept this way at delivery.
 * - QuantDrive picks: the composer's "Insert files from QuantDrive" stores a reference,
 *   `/api/drive/files/<fileId>/download`, not the bytes. Drive serves it to the file's owner.
 * - Metadata only: a part that was described but whose bytes were never kept. There is nothing
 *   to read, so nothing is offered for it.
 */

import { browserAuthSession } from '../services/browser-auth-session';

/** `att_` + `crypto.randomUUID()` — the id AttachmentService mints (backend attachment.service). */
const SERVICE_ID = /^att_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UNREADABLE = 'This attachment could not be read.';

/** The reference the composer stores for a file inserted from QuantDrive. */
const DRIVE_DOWNLOAD = /^\/api\/drive\/files\/([A-Za-z0-9_-]+)\/download\/?(?:[?#].*)?$/;

/**
 * Drive answers 404 both when the file is gone and when the reader has no access to it — a
 * recipient opening a file the sender picked from their own Drive. Its bare "not found" would
 * read as if the file were deleted, so the attachment says what it can actually know.
 */
const DRIVE_FILE_UNAVAILABLE =
  'This QuantDrive file is not available to you \u2014 it was deleted, or it is in the ' +
  'sender\u2019s Drive and was not shared with you.';

/**
 * The AttachmentService id, when `id` is one. Composer ids (`att_<time>_<random>`) and the
 * thread formatter's old positional fallbacks started with `att_` too but name no stored
 * object: a prefix check offered "Save to Drive" on them, and the save could only answer 404.
 * (The formatter now synthesizes `meta_` ids — backend/lib/format-email.ts — but the
 * composer still mints `att_` ids, so the strict shape stands.)
 */
export function attachmentServiceId(id: unknown): string | null {
  return typeof id === 'string' && SERVICE_ID.test(id) ? id : null;
}

export type AttachmentByteSource =
  | { kind: 'inline'; dataUrl: string }
  | { kind: 'stored'; attachmentId: string }
  | { kind: 'drive'; fileId: string };

/** Where this attachment's bytes live, or null when the message carries only its description. */
export function attachmentByteSource(attachment: {
  url?: string | null;
  attachmentId?: string | null;
}): AttachmentByteSource | null {
  const stored = attachmentServiceId(attachment.attachmentId);
  if (stored) return { kind: 'stored', attachmentId: stored };
  const url = attachment.url;
  if (typeof url === 'string' && /^data:/i.test(url)) return { kind: 'inline', dataUrl: url };
  const driveFileId = typeof url === 'string' ? DRIVE_DOWNLOAD.exec(url)?.[1] : undefined;
  if (driveFileId) return { kind: 'drive', fileId: driveFileId };
  return null;
}

/**
 * Decode a `data:` URL in memory. `fetch(dataUrl)` is not an option: the page's CSP
 * `connect-src` does not list `data:`, so the browser would refuse it.
 */
export function decodeDataUrl(dataUrl: string): ArrayBuffer {
  const comma = dataUrl.indexOf(',');
  if (!/^data:/i.test(dataUrl) || comma === -1) throw new Error(UNREADABLE);
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64$/i.test(meta)) {
    let binary: string;
    try {
      binary = atob(payload.replace(/\s+/g, ''));
    } catch {
      throw new Error(UNREADABLE);
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  let text: string;
  try {
    text = decodeURIComponent(payload);
  } catch {
    throw new Error(UNREADABLE);
  }
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

/** The attachment's bytes. Stored and QuantDrive attachments are fetched with the session. */
export async function loadAttachmentBytes(
  source: AttachmentByteSource,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (source.kind === 'inline') return decodeDataUrl(source.dataUrl);
  const path =
    source.kind === 'drive'
      ? `/api/drive/files/${encodeURIComponent(source.fileId)}/download`
      : `/api/attachments/${encodeURIComponent(source.attachmentId)}/download`;
  const response = await browserAuthSession.authenticatedFetch(path, signal ? { signal } : {});
  if (source.kind === 'drive' && response.status === 404) throw new Error(DRIVE_FILE_UNAVAILABLE);
  if (!response.ok) {
    // The backend's own words (e.g. a malware-scan block), never an invented reason.
    const data = (await response.json().catch(() => null)) as
      | { error?: { message?: string }; message?: string }
      | null;
    const message = data?.error?.message || data?.message;
    throw new Error(message || `Could not load this attachment (status ${response.status}).`);
  }
  return response.arrayBuffer();
}

/** Hand bytes to the browser as a download under the attachment's own name. */
export function saveBytesAs(bytes: ArrayBuffer, filename: string, mimeType: string): void {
  const objectUrl = URL.createObjectURL(
    new Blob([bytes], { type: mimeType || 'application/octet-stream' }),
  );
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename || 'attachment';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}
