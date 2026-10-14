/**
 * Keep a received message's attachment bytes.
 *
 * Inbound mail used to be described and then dropped: the parser lists every attachment
 * part, ingest stores that list on the email, and the bytes stayed behind in the raw
 * message in the SES bucket, which nothing reads again. A received PDF therefore showed a
 * paperclip and a filename, and opening, previewing or saving it to Drive could only fail.
 *
 * This copies each downloadable part into attachment storage as the recipient's own READY
 * attachment and writes the new `att_<uuid>` id onto the matching entry of the email's
 * `attachments` list. That id is what the download route, the document preview and Save
 * to Drive already address, so nothing downstream changes.
 *
 * Best effort by design: by the time this runs the mail is delivered, and a storage
 * outage must not become a failed webhook and an SNS redelivery loop. A part that cannot
 * be kept is logged and its entry stays metadata-only, exactly as before. It is also
 * idempotent: an entry that already carries a stored id is left alone, so a redelivered
 * notification — or an admin replay of the bucket — only fills in what is missing.
 */

import { prisma as defaultPrisma } from '@quant/database';
import { extractAttachmentBytes, type ParsedAttachment } from '../lib/mime-parser';
import {
  AttachmentService,
  MAX_ATTACHMENT_SIZE,
  attachmentStorageReady,
} from './attachment.service';

/** The id shape `AttachmentService` assigns; anything else on an entry is not stored bytes. */
const STORED_ATTACHMENT_ID =
  /^att_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InboundAttachmentDb {
  email: {
    findUnique(args: unknown): Promise<{
      userId: string;
      attachments: unknown;
      version: number;
    } | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

export type InboundAttachmentStore = Pick<AttachmentService, 'storeBytes' | 'deleteAttachment'>;

export interface KeeperLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

export interface KeepAttachmentsArgs {
  userId: string;
  emailId: string;
  /** The raw message the email was ingested from, as the webhook read it. */
  rawEmail: string;
  /** `parseRawEmail(rawEmail).attachments` — the same walk the stored entries came from. */
  parts: readonly ParsedAttachment[];
}

export interface KeepAttachmentsResult {
  stored: number;
  failed: number;
}

export interface InboundAttachmentKeeperOptions {
  db?: InboundAttachmentDb;
  store?: InboundAttachmentStore;
  storageReady?: () => boolean;
}

type Entry = Record<string, unknown>;

function isEntry(value: unknown): value is Entry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasStoredBytes(entry: Entry): boolean {
  return typeof entry['id'] === 'string' && STORED_ATTACHMENT_ID.test(entry['id']);
}

/** A part worth keeping: something the user downloads, within the attachment cap. */
function keepable(part: ParsedAttachment): boolean {
  return !part.isInline && part.size > 0 && part.size <= MAX_ATTACHMENT_SIZE;
}

/**
 * Put each stored id on its entry. An entry that gained an id meanwhile (a concurrent
 * delivery of the same notification) keeps it; ours then goes unused and is reported.
 */
function withStoredIds(
  attachments: unknown,
  ids: ReadonlyMap<number, string>,
): { next: unknown[]; applied: Set<number> } {
  const applied = new Set<number>();
  const list = Array.isArray(attachments) ? attachments : [];
  const next = list.map((entry) => {
    if (!isEntry(entry) || hasStoredBytes(entry)) return entry;
    const index = entry['partIndex'];
    if (typeof index !== 'number' || !ids.has(index) || applied.has(index)) return entry;
    applied.add(index);
    return { ...entry, id: ids.get(index) };
  });
  return { next, applied };
}

export class InboundAttachmentKeeper {
  private readonly db: InboundAttachmentDb;
  private readonly storageReady: () => boolean;
  private store: InboundAttachmentStore | undefined;

  constructor(options: InboundAttachmentKeeperOptions = {}) {
    this.db = options.db ?? (defaultPrisma as unknown as InboundAttachmentDb);
    this.store = options.store;
    this.storageReady = options.storageReady ?? attachmentStorageReady;
  }

  /** Built on first use so a process without object storage never constructs a client. */
  private attachments(): InboundAttachmentStore {
    if (!this.store) {
      this.store = new AttachmentService();
    }
    return this.store;
  }

  async keep(args: KeepAttachmentsArgs, log: KeeperLog): Promise<KeepAttachmentsResult> {
    const result: KeepAttachmentsResult = { stored: 0, failed: 0 };
    const parts = new Map(
      args.parts.filter(keepable).map((part) => [part.partIndex, part] as const),
    );
    if (parts.size === 0) return result;
    if (!this.storageReady()) {
      log.warn(
        { emailId: args.emailId, parts: parts.size },
        '[inbound] object storage not configured — attachments stay metadata-only',
      );
      return result;
    }

    const email = await this.db.email.findUnique({
      where: { id: args.emailId },
      select: { userId: true, attachments: true, version: true },
    });
    if (!email || email.userId !== args.userId) return result;

    // Entries still without bytes, matched to this message's parts by index and name:
    // the name check is what stops a different message that reused a Message-ID from
    // filling one email's entries with another message's files.
    const wanted = new Map<number, ParsedAttachment>();
    for (const entry of Array.isArray(email.attachments) ? email.attachments : []) {
      if (!isEntry(entry) || hasStoredBytes(entry)) continue;
      const index = entry['partIndex'];
      const part = typeof index === 'number' ? parts.get(index) : undefined;
      if (part && part.filename === entry['filename']) wanted.set(part.partIndex, part);
    }
    if (wanted.size === 0) return result;

    const bytes = extractAttachmentBytes(args.rawEmail, wanted.keys());
    const storedIds = new Map<number, string>();
    for (const [index, part] of wanted) {
      const body = bytes.get(index);
      if (!body || body.byteLength === 0) {
        result.failed += 1;
        log.warn(
          { emailId: args.emailId, partIndex: index },
          '[inbound] attachment bytes are not recoverable from the raw message',
        );
        continue;
      }
      try {
        const stored = await this.attachments().storeBytes({
          userId: args.userId,
          emailId: args.emailId,
          filename: part.filename,
          contentType: part.mimeType,
          body,
        });
        storedIds.set(index, stored.id);
      } catch (error) {
        result.failed += 1;
        log.warn(
          { err: error, emailId: args.emailId, partIndex: index },
          '[inbound] attachment could not be stored',
        );
      }
    }
    if (storedIds.size === 0) return result;

    const applied = await this.writeIds(args, email, storedIds);
    const unused = [...storedIds].filter(([index]) => !applied.has(index));
    for (const [, id] of unused) {
      await this.attachments()
        .deleteAttachment(id, args.userId)
        .catch((error: unknown) =>
          log.warn({ err: error, attachmentId: id }, '[inbound] unused attachment not removed'),
        );
    }
    result.stored = applied.size;
    if (applied.size < storedIds.size) {
      log.warn(
        { emailId: args.emailId, unused: unused.length },
        '[inbound] stored attachments were not linked to the email',
      );
    }
    log.info(
      { emailId: args.emailId, stored: result.stored, failed: result.failed },
      '[inbound] attachments kept',
    );
    return result;
  }

  /**
   * Link the stored ids, guarded by the row version so a write racing this one (a filter,
   * a read receipt) is never overwritten with a stale copy. One re-read on conflict.
   */
  private async writeIds(
    args: KeepAttachmentsArgs,
    loaded: { attachments: unknown; version: number },
    ids: ReadonlyMap<number, string>,
  ): Promise<Set<number>> {
    let current: { userId?: string; attachments: unknown; version: number } | null = loaded;
    for (let attempt = 0; attempt < 2 && current; attempt += 1) {
      const { next, applied } = withStoredIds(current.attachments, ids);
      if (applied.size === 0) return applied;
      const res = await this.db.email.updateMany({
        where: { id: args.emailId, userId: args.userId, version: current.version },
        data: { attachments: next, version: { increment: 1 } },
      });
      if (res.count > 0) return applied;
      current = await this.db.email.findUnique({
        where: { id: args.emailId },
        select: { userId: true, attachments: true, version: true },
      });
    }
    return new Set();
  }
}
