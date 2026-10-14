// ============================================================================
// QuantMail — resolve outbound attachments for external sends.
//
// The composer's `Email.attachments` JSON holds whatever the frontend posted:
//   - local-file picks: { id, name, filename, size, type, mimeType,
//       url: "data:<mime>;base64,<bytes>" }  (bytes ride inline as a data URL)
//   - QuantDrive picks: { id: "drive_<fileId>_<ts>", ..., url:
//       "/api/drive/files/<fileId>/download" }  (bytes live in Drive storage)
//
// Internal recipients get these references verbatim via `deliverInternally`
// (the client renders the data URLs directly). External recipients go over
// SES/SMTP, which needs real bytes — this module resolves every entry into
// `{ filename, contentType, content }` and FAILS CLOSED with a typed,
// user-readable error when an entry cannot be resolved, so a file is never
// silently dropped the way it was before QM-SCREEN-006 R2.
// ============================================================================

import { createAppError } from '@quant/server-core';
import { checkedPlaintext } from '../services/drive-storage.service';
import { sanitizeMimeFilename, type SesAttachment } from './ses-sender';

/** Minimal structural shape of the prisma client the resolver needs. */
export interface OutboundAttachmentDb {
  /**
   * Optional because the drive-file lookup only runs for drive attachments;
   * absence (or a missing delegate) fails closed at resolve time with
   * ATTACHMENT_UNRESOLVABLE rather than at compile time.
   */
  file?: {
    // `any`-typed args/row on purpose: the generated Prisma client's
    // `findFirst` generics are not structurally assignable to a narrower
    // hand-written signature (same pattern as AttachmentPrismaClient).
    findFirst(args: any): Promise<any>;
  };
}

/** One entry of the composer-posted `Email.attachments` JSON array. */
interface ComposerAttachmentEntry {
  id?: unknown;
  name?: unknown;
  filename?: unknown;
  size?: unknown;
  type?: unknown;
  mimeType?: unknown;
  contentType?: unknown;
  url?: unknown;
}

const DRIVE_URL_RE = /^\/api\/drive\/files\/([A-Za-z0-9_-]+)\/download/i;
const DRIVE_ID_RE = /^drive_([A-Za-z0-9_-]+)_/;
const DATA_URL_RE = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s;

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function attachmentError(filename: string, reason: string): Error {
  return createAppError(
    `Attachment "${sanitizeMimeFilename(filename)}" cannot be sent to external recipients: ${reason}. ` +
      `The send is held as deferred — fix the attachment and retry; nothing was silently dropped.`,
    422,
    'ATTACHMENT_UNRESOLVABLE',
  );
}

/** Extract the Drive file id from a drive attachment entry, if it has one. */
function driveFileIdOf(entry: ComposerAttachmentEntry): string | undefined {
  const url = asString(entry.url);
  if (url) {
    const m = url.match(DRIVE_URL_RE);
    if (m) return m[1];
  }
  const id = asString(entry.id);
  if (id) {
    const m = id.match(DRIVE_ID_RE);
    if (m) return m[1];
  }
  return undefined;
}

async function resolveDriveAttachment(
  entry: ComposerAttachmentEntry,
  fileId: string,
  filename: string,
  contentType: string,
  senderUserId: string | undefined,
  db: OutboundAttachmentDb | undefined,
): Promise<SesAttachment> {
  if (!senderUserId) {
    throw attachmentError(filename, 'the sender could not be identified, so the Drive file cannot be read');
  }
  if (!db?.file || typeof db.file.findFirst !== 'function') {
    throw attachmentError(filename, 'database access is unavailable to read the Drive file');
  }
  const row = await db.file.findFirst({ where: { id: fileId, userId: senderUserId } });
  if (!row) {
    throw attachmentError(
      filename,
      `the Drive file (id ${fileId}) no longer exists or is not owned by the sender`,
    );
  }
  let content: Buffer;
  try {
    content = await checkedPlaintext({
      encryptedContent: String(row.encryptedContent),
      encryptionIV: String(row.encryptionIV),
      encryptionAuthTag: String(row.encryptionAuthTag),
      encryptionKey: String(row.encryptionKey),
      contentHash: row.contentHash ?? undefined,
    });
  } catch (err) {
    throw attachmentError(
      filename,
      `the Drive file could not be decrypted (${(err as Error).message})`,
    );
  }
  if (content.byteLength === 0) {
    throw attachmentError(filename, 'the Drive file is empty');
  }
  return {
    filename: sanitizeMimeFilename(filename),
    contentType,
    content,
  };
}

async function resolveOne(
  entry: ComposerAttachmentEntry,
  senderUserId: string | undefined,
  db: OutboundAttachmentDb | undefined,
): Promise<SesAttachment> {
  const filename = asString(entry.filename) ?? asString(entry.name) ?? 'attachment';
  const contentType =
    asString(entry.mimeType) ?? asString(entry.type) ?? asString(entry.contentType) ?? 'application/octet-stream';

  const url = asString(entry.url);
  if (url) {
    if (url.startsWith('data:')) {
      // Local-file flow: the composer posts bytes inline as a data URL.
      const m = url.match(DATA_URL_RE);
      if (!m || !m[2]) {
        throw attachmentError(
          filename,
          'the embedded data URL is not base64-encoded and cannot be decoded safely',
        );
      }
      const declaredType = asString(m[1]);
      let content: Buffer;
      try {
        content = Buffer.from(m[3], 'base64');
      } catch {
        throw attachmentError(filename, 'the embedded base64 payload is corrupt');
      }
      if (content.byteLength === 0) {
        throw attachmentError(filename, 'the embedded file payload is empty');
      }
      return {
        filename: sanitizeMimeFilename(filename),
        contentType: declaredType ?? contentType,
        content,
      };
    }
    const fileId = driveFileIdOf(entry);
    if (fileId) {
      return resolveDriveAttachment(entry, fileId, filename, contentType, senderUserId, db);
    }
    throw attachmentError(
      filename,
      `its source URL "${url.slice(0, 80)}" is not a supported attachment reference`,
    );
  }

  // No URL at all — maybe a bare drive id.
  const fileId = driveFileIdOf(entry);
  if (fileId) {
    return resolveDriveAttachment(entry, fileId, filename, contentType, senderUserId, db);
  }
  throw attachmentError(filename, 'it has no file content or reference attached to it');
}

/**
 * The Drive file a composer attachment entry references, when it is a QuantDrive pick.
 * Internal delivery uses this to find the entries a recipient cannot read as-is: Drive
 * serves a file to its owner, and the recipient of the mail is not the owner.
 */
export function driveAttachmentFileId(entry: unknown): string | undefined {
  if (!entry || typeof entry !== 'object') return undefined;
  return driveFileIdOf(entry as ComposerAttachmentEntry);
}

/**
 * Read a QuantDrive pick's bytes as its sender — the same owner check, decryption and
 * integrity check external delivery uses. Throws ATTACHMENT_UNRESOLVABLE when the entry
 * is not a Drive pick, or the file is gone, not the sender's, empty or undecryptable.
 */
export async function readDriveAttachment(
  entry: unknown,
  senderUserId: string,
  db?: OutboundAttachmentDb,
): Promise<SesAttachment> {
  const composerEntry = (entry ?? {}) as ComposerAttachmentEntry;
  const filename =
    asString(composerEntry.filename) ?? asString(composerEntry.name) ?? 'attachment';
  const contentType =
    asString(composerEntry.mimeType) ??
    asString(composerEntry.type) ??
    asString(composerEntry.contentType) ??
    'application/octet-stream';
  const fileId = driveFileIdOf(composerEntry);
  if (!fileId) throw attachmentError(filename, 'it is not a QuantDrive file');
  return resolveDriveAttachment(composerEntry, fileId, filename, contentType, senderUserId, db);
}

/**
 * Resolve the composer-posted `Email.attachments` JSON into real bytes for
 * external delivery. Returns `[]` for no attachments. Throws a typed
 * `ATTACHMENT_UNRESOLVABLE` error on the first entry that cannot be
 * resolved — callers treat that as a deferred (honest, retriable) send,
 * never a silent drop.
 */
export async function resolveOutboundAttachments(
  attachments: unknown,
  senderUserId: string | undefined,
  db?: OutboundAttachmentDb,
): Promise<SesAttachment[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const resolved: SesAttachment[] = [];
  for (const raw of attachments) {
    resolved.push(
      await resolveOne((raw ?? {}) as ComposerAttachmentEntry, senderUserId, db),
    );
  }
  return resolved;
}
