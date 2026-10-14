/**
 * Give each recipient of internal mail their own copy of the sender's QuantDrive picks.
 *
 * "Insert files from QuantDrive" puts a reference on the attachment —
 * `/api/drive/files/<fileId>/download` — not the bytes. Internal delivery used to copy that
 * reference verbatim onto every recipient's copy, and Drive serves a file only to its owner
 * (or an accepted share), so for everyone but the sender the attachment could never open.
 *
 * At delivery the sender's file is read once (the same owner check, decryption and integrity
 * check external delivery uses) and stored per recipient as their own READY attachment, and
 * the recipient's entry carries that `att_<uuid>` id instead of the reference. The sender's
 * own copy keeps the reference: they own the file.
 *
 * Best effort: delivery never fails because of this. An entry that cannot be copied keeps the
 * reference, and the reader is told it is not available to them.
 */

import {
  driveAttachmentFileId,
  readDriveAttachment,
  type OutboundAttachmentDb,
} from '../lib/outbound-attachments';
import type { SesAttachment } from '../lib/ses-sender';
import { AttachmentService, attachmentStorageReady } from './attachment.service';

export type RecipientAttachmentStore = Pick<AttachmentService, 'storeBytes'>;

export interface CopierLog {
  warn(obj: object, msg: string): void;
}

export interface RecipientAttachmentCopierOptions {
  /** The sent message's attachment entries, as the composer posted them. */
  attachments: unknown;
  senderUserId: string;
  db?: OutboundAttachmentDb;
  store?: RecipientAttachmentStore;
  storageReady?: () => boolean;
  log?: CopierLog;
}

/** What a recipient's entry becomes: the composer's own field names, pointing at their copy. */
function storedEntry(stored: { id: string; filename: string; contentType: string; size: number }) {
  return {
    id: stored.id,
    name: stored.filename,
    filename: stored.filename,
    size: stored.size,
    type: stored.contentType,
    mimeType: stored.contentType,
  };
}

export class RecipientAttachmentCopier {
  private readonly entries: unknown[];
  private readonly driveIndexes: number[];
  /** Sender-side reads, once per message however many recipients there are. */
  private readonly reads = new Map<number, Promise<SesAttachment | null>>();
  private store: RecipientAttachmentStore | undefined;

  constructor(private readonly options: RecipientAttachmentCopierOptions) {
    this.entries = Array.isArray(options.attachments) ? options.attachments : [];
    this.driveIndexes = this.entries
      .map((entry, index) => (driveAttachmentFileId(entry) ? index : -1))
      .filter((index) => index >= 0);
    this.store = options.store;
  }

  /** The entries `recipientUserId`'s copy should carry. Never throws. */
  async forRecipient(recipientUserId: string): Promise<unknown[]> {
    if (this.driveIndexes.length === 0 || recipientUserId === this.options.senderUserId) {
      return this.entries;
    }
    if (!(this.options.storageReady ?? attachmentStorageReady)()) {
      this.options.log?.warn(
        { recipientUserId, driveFiles: this.driveIndexes.length },
        '[internal-delivery] object storage not configured — Drive picks stay references',
      );
      return this.entries;
    }

    const result = [...this.entries];
    for (const index of this.driveIndexes) {
      const file = await this.read(index);
      if (!file) continue;
      try {
        const stored = await this.attachments().storeBytes({
          userId: recipientUserId,
          filename: file.filename,
          contentType: file.contentType,
          body: file.content,
        });
        result[index] = storedEntry(stored);
      } catch (error) {
        this.options.log?.warn(
          { err: error, recipientUserId, index },
          '[internal-delivery] Drive pick not copied for recipient — reference kept',
        );
      }
    }
    return result;
  }

  private read(index: number): Promise<SesAttachment | null> {
    let pending = this.reads.get(index);
    if (!pending) {
      pending = readDriveAttachment(
        this.entries[index],
        this.options.senderUserId,
        this.options.db,
      ).catch((error: unknown) => {
        this.options.log?.warn(
          { err: error, index },
          '[internal-delivery] Drive pick could not be read as the sender — reference kept',
        );
        return null;
      });
      this.reads.set(index, pending);
    }
    return pending;
  }

  private attachments(): RecipientAttachmentStore {
    if (!this.store) this.store = new AttachmentService();
    return this.store;
  }
}
