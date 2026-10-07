// ============================================================================
// IMAP4rev1 Daemon - Mailbox & Storage Layer (RFC 3501)
// ============================================================================

import { prisma, type PrismaClient } from '@quant/database';
import type { AuthenticatedUser, MailboxItem, SelectedFolder } from './types';

export interface FolderSummary {
  id: string;
  name: string;
  type: string;
  attributes: string[];
}

export class MailboxManager {
  private readonly db: PrismaClient;

  constructor(customPrisma?: PrismaClient) {
    this.db = customPrisma || (prisma as PrismaClient);
  }

  /**
   * Deterministically calculates UIDVALIDITY from folder creation date.
   * RFC 3501: A 32-bit nonzero unsigned integer.
   */
  static calculateUidValidity(createdAt: Date): number {
    const epochSec = Math.floor(createdAt.getTime() / 1000);
    // Ensure 32-bit unsigned positive integer within RFC bounds (1 .. 4294967295)
    return epochSec >>> 0 || 1;
  }

  /**
   * Ensure standard folders (INBOX, Sent, Drafts, Trash, Archive, Spam) exist for a user.
   */
  async ensureStandardFolders(userId: string): Promise<void> {
    const standardFolders = [
      { name: 'INBOX', type: 'INBOX' },
      { name: 'Sent', type: 'SENT' },
      { name: 'Drafts', type: 'DRAFTS' },
      { name: 'Trash', type: 'TRASH' },
      { name: 'Archive', type: 'ARCHIVE' },
      { name: 'Spam', type: 'SPAM' },
    ];

    for (const folder of standardFolders) {
      try {
        const existing = await this.db.emailFolder.findFirst({
          where: { userId, name: folder.name },
        });
        if (!existing) {
          await this.db.emailFolder.create({
            data: {
              userId,
              name: folder.name,
              type: folder.type as any,
            },
          });
        }
      } catch {
        // Folder may have been created concurrently
      }
    }
  }

  /**
   * List folders for user with RFC 3501 folder attributes.
   */
  async listFolders(userId: string): Promise<FolderSummary[]> {
    await this.ensureStandardFolders(userId);

    const folders = await this.db.emailFolder.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return folders.map((f) => {
      const attributes = ['\\HasNoChildren'];
      const upper = f.name.toUpperCase();

      if (upper === 'INBOX') attributes.push('\\Inbox');
      else if (upper === 'SENT' || f.type === 'SENT') attributes.push('\\Sent');
      else if (upper === 'DRAFTS' || f.type === 'DRAFTS') attributes.push('\\Drafts');
      else if (upper === 'TRASH' || f.type === 'TRASH') attributes.push('\\Trash');
      else if (upper === 'ARCHIVE' || f.type === 'ARCHIVE') attributes.push('\\Archive');
      else if (upper === 'SPAM' || f.type === 'SPAM') attributes.push('\\Junk');

      return {
        id: f.id,
        name: f.name,
        type: f.type,
        attributes,
      };
    });
  }

  /**
   * Selects a mailbox folder, calculates UIDVALIDITY and loads current emails.
   */
  async selectMailbox(
    user: AuthenticatedUser,
    folderName: string,
    readOnly: boolean = false,
  ): Promise<SelectedFolder | null> {
    await this.ensureStandardFolders(user.id);

    // Case-insensitive lookup (especially for INBOX)
    let folder = await this.db.emailFolder.findFirst({
      where: {
        userId: user.id,
        name: { equals: folderName, mode: 'insensitive' },
      },
    });

    if (!folder && folderName.toUpperCase() === 'INBOX') {
      folder = await this.db.emailFolder.findFirst({
        where: { userId: user.id, type: 'INBOX' },
      });
    }

    if (!folder) {
      return null;
    }

    const uidvalidity = MailboxManager.calculateUidValidity(folder.createdAt);

    // Fetch active emails
    const emails = await this.db.email.findMany({
      where: {
        userId: user.id,
        folderId: folder.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });

    let seq = 1;
    let maxUid = 0;

    const items: MailboxItem[] = emails.map((e, index) => {
      // Deterministic UID: index + 1 or derived integer
      const uid = index + 1;
      if (uid > maxUid) maxUid = uid;

      const rawMime = this.buildRfc822Mime(e);
      const toAddresses = this.parseAddressList(e.toAddresses);
      const ccAddresses = this.parseAddressList(e.ccAddresses);
      const bccAddresses = this.parseAddressList(e.bccAddresses);

      return {
        id: e.id,
        uid,
        seq: seq++,
        subject: e.subject,
        from: e.fromAddress,
        to: toAddresses,
        cc: ccAddresses,
        bcc: bccAddresses,
        date: e.receivedAt || e.createdAt,
        size: Buffer.byteLength(rawMime, 'utf-8'),
        isRead: e.isRead,
        isStarred: e.isStarred,
        isDeleted: e.isTrash,
        isDraft: e.isDraft,
        isAnswered: false,
        messageId: e.messageId || `<${e.id}@quantmail.in>`,
        inReplyTo: e.inReplyTo,
        bodyPlain: e.bodyPlain,
        bodyHtml: e.bodyHtml,
        rawMime,
      };
    });

    return {
      id: folder.id,
      name: folder.name,
      type: folder.type,
      uidvalidity,
      uidnext: maxUid + 1,
      readOnly,
      items,
    };
  }

  /**
   * Update message flags (+FLAGS, -FLAGS, FLAGS).
   */
  async updateFlags(
    _selectedFolder: SelectedFolder,
    item: MailboxItem,
    action: 'SET' | 'ADD' | 'REMOVE',
    flags: string[],
  ): Promise<string[]> {
    const flagSet = new Set<string>();
    if (action === 'ADD' || action === 'REMOVE') {
      if (item.isRead) flagSet.add('\\Seen');
      if (item.isStarred) flagSet.add('\\Flagged');
      if (item.isDeleted) flagSet.add('\\Deleted');
      if (item.isDraft) flagSet.add('\\Draft');
      if (item.isAnswered) flagSet.add('\\Answered');
    }

    for (const f of flags) {
      const normalized = f.startsWith('\\') ? f : `\\${f}`;
      const canonical =
        normalized.charAt(0) +
        normalized.charAt(1).toUpperCase() +
        normalized.slice(2).toLowerCase();

      if (action === 'SET' || action === 'ADD') {
        flagSet.add(canonical);
      } else if (action === 'REMOVE') {
        flagSet.delete(canonical);
      }
    }

    item.isRead = flagSet.has('\\Seen');
    item.isStarred = flagSet.has('\\Flagged');
    item.isDeleted = flagSet.has('\\Deleted');
    item.isDraft = flagSet.has('\\Draft');
    item.isAnswered = flagSet.has('\\Answered');

    // Update database
    try {
      await this.db.email.update({
        where: { id: item.id },
        data: {
          isRead: item.isRead,
          isStarred: item.isStarred,
          isTrash: item.isDeleted,
          isDraft: item.isDraft,
        },
      });
    } catch {
      // Ignore if disconnected
    }

    return Array.from(flagSet);
  }

  /**
   * Expunge deleted messages from currently selected mailbox.
   * Returns list of expunged sequence numbers in descending order.
   */
  async expunge(selectedFolder: SelectedFolder): Promise<number[]> {
    const expungedSeqs: number[] = [];
    const remainingItems: MailboxItem[] = [];

    for (const item of selectedFolder.items) {
      if (item.isDeleted) {
        expungedSeqs.push(item.seq);
        try {
          await this.db.email.update({
            where: { id: item.id },
            data: { deletedAt: new Date() },
          });
        } catch {
          // Ignore
        }
      } else {
        remainingItems.push(item);
      }
    }

    // Re-sequence remaining items
    remainingItems.forEach((item, idx) => {
      item.seq = idx + 1;
    });

    selectedFolder.items = remainingItems;

    // Return in descending order so IMAP clients can adjust indexes safely
    return expungedSeqs.reverse();
  }

  /**
   * Creates an RFC 2822 serialized MIME message string from database email row.
   */
  buildRfc822Mime(email: {
    fromAddress: string;
    toAddresses: unknown;
    ccAddresses?: unknown;
    subject: string;
    bodyPlain?: string | null;
    bodyHtml?: string | null;
    messageId?: string | null;
    receivedAt?: Date | null;
    createdAt: Date;
  }): string {
    const to = this.parseAddressList(email.toAddresses).join(', ');
    const cc = this.parseAddressList(email.ccAddresses).join(', ');
    const dateStr = (email.receivedAt || email.createdAt).toUTCString();
    const msgId =
      email.messageId || `<${email.fromAddress}-${email.createdAt.getTime()}@quantmail.in>`;

    let headers = `From: ${email.fromAddress}\r\n`;
    headers += `To: ${to}\r\n`;
    if (cc) headers += `Cc: ${cc}\r\n`;
    headers += `Subject: ${email.subject}\r\n`;
    headers += `Date: ${dateStr}\r\n`;
    headers += `Message-ID: ${msgId}\r\n`;
    headers += `MIME-Version: 1.0\r\n`;
    headers += `Content-Type: text/plain; charset=utf-8\r\n`;
    headers += `\r\n`;

    const body = email.bodyPlain || (email.bodyHtml ? email.bodyHtml.replace(/<[^>]+>/g, '') : '');
    return `${headers}${body}\r\n`;
  }

  /**
   * Formats IMAP ENVELOPE structure for a message.
   */
  formatEnvelope(item: MailboxItem): string {
    const dateStr = `"${item.date.toUTCString()}"`;
    const subject = JSON.stringify(item.subject);

    const fromAddress = this.splitEmailAddress(item.from);
    const fromTuple = `((${JSON.stringify(fromAddress.name)} NIL ${JSON.stringify(fromAddress.mailbox)} ${JSON.stringify(fromAddress.host)}))`;

    const toTuples = item.to
      .map((addr) => {
        const parsed = this.splitEmailAddress(addr);
        return `(${JSON.stringify(parsed.name)} NIL ${JSON.stringify(parsed.mailbox)} ${JSON.stringify(parsed.host)})`;
      })
      .join(' ');
    const toList = toTuples ? `(${toTuples})` : 'NIL';

    const inReplyTo = item.inReplyTo ? JSON.stringify(item.inReplyTo) : 'NIL';
    const messageId = JSON.stringify(item.messageId);

    return `(${dateStr} ${subject} ${fromTuple} ${fromTuple} ${fromTuple} ${toList} NIL NIL ${inReplyTo} ${messageId})`;
  }

  /**
   * Formats IMAP BODYSTRUCTURE for a text/plain message.
   */
  formatBodyStructure(item: MailboxItem): string {
    const lines = (item.bodyPlain || '').split('\n').length;
    return `("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" ${item.size} ${lines})`;
  }

  private splitEmailAddress(raw: string): { name: string | null; mailbox: string; host: string } {
    let name: string | null = null;
    let email = raw.trim();

    const match = /^(.*)<([^>]+)>$/.exec(raw);
    if (match && match[1] && match[2]) {
      name = match[1].trim() || null;
      email = match[2].trim();
    }

    const [mailbox = 'user', host = 'quantmail.in'] = email.split('@');
    return { name, mailbox, host };
  }

  private parseAddressList(json: unknown): string[] {
    if (Array.isArray(json)) {
      return json.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
    if (typeof json === 'string' && json.length > 0) {
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return [json];
      }
    }
    return [];
  }
}
