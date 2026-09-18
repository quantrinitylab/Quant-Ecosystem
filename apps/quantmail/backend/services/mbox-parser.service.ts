import { createHash } from 'node:crypto';
import { createAppError } from '@quant/server-core';
import { parseRawEmail, type ParsedEmail } from '../lib/mime-parser';

export interface MboxImportResult {
  totalFound: number;
  importedCount: number;
  skippedCount: number;
  messageIds: string[];
}

export interface MboxParseOptions {
  maxMessages?: number;
}

/**
 * Splits an RFC 4155 mbox stream into raw email strings.
 * Messages in mbox format start with a delimiter line beginning with "From "
 * (note the space after From).
 */
export function splitMbox(rawMbox: string, maxMessages = 500): string[] {
  if (!rawMbox || typeof rawMbox !== 'string') return [];

  const lines = rawMbox.split(/\r?\n/);
  const messages: string[] = [];
  let currentLines: string[] = [];
  let inMessage = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // RFC 4155 From_ line separator
    if (/^From \S+ .*/.test(line)) {
      if (inMessage && currentLines.length > 0) {
        messages.push(currentLines.join('\n'));
        currentLines = [];
        if (messages.length >= maxMessages) {
          break;
        }
      }
      inMessage = true;
      continue; // Skip the From_ envelope separator line itself
    }

    if (inMessage) {
      // RFC 4155 unescaping: lines starting with ">From " are reverted to "From "
      if (line.startsWith('>From ')) {
        currentLines.push(line.slice(1));
      } else {
        currentLines.push(line);
      }
    }
  }

  if (currentLines.length > 0 && messages.length < maxMessages) {
    messages.push(currentLines.join('\n'));
  }

  return messages;
}

/**
 * Parses all messages in an mbox stream into structured ParsedEmail records.
 */
export function parseMbox(rawMbox: string, options: MboxParseOptions = {}): ParsedEmail[] {
  const max = options.maxMessages ?? 500;
  const rawEmails = splitMbox(rawMbox, max);
  return rawEmails.map((raw) => parseRawEmail(raw));
}

/**
 * Deterministic fallback messageId generator when an imported email lacks a Message-ID header.
 */
function computeFallbackMessageId(msg: ParsedEmail): string {
  const seed = `${msg.fromAddress}|${msg.subject}|${msg.date?.toISOString() ?? 'nodate'}|${msg.bodyPlain.slice(0, 100)}`;
  const hash = createHash('sha256').update(seed).digest('hex').slice(0, 24);
  return `mbox-import-${hash}@quantmail.internal`;
}

/**
 * High-performance, idempotent MBOX importer service.
 */
export class MboxParserService {
  constructor(private readonly prisma: any) {}

  public async importMbox(
    userId: string,
    rawMbox: string,
    options: { targetFolder?: string; maxMessages?: number } = {},
  ): Promise<MboxImportResult> {
    if (!rawMbox || typeof rawMbox !== 'string') {
      throw createAppError('MBOX data is required', 400, 'INVALID_MBOX_PAYLOAD');
    }

    // Enforce 10 MB payload ceiling
    const byteLength = Buffer.byteLength(rawMbox, 'utf8');
    if (byteLength > 10 * 1024 * 1024) {
      throw createAppError('MBOX payload exceeds 10MB limit', 413, 'PAYLOAD_TOO_LARGE');
    }

    const maxMessages = Math.min(options.maxMessages ?? 500, 500);
    const parsedMessages = parseMbox(rawMbox, { maxMessages });

    if (parsedMessages.length === 0) {
      return { totalFound: 0, importedCount: 0, skippedCount: 0, messageIds: [] };
    }

    // Extract all candidate messageIds (or fallback hashes)
    const candidateEntries = parsedMessages.map((msg) => ({
      msg,
      messageId: msg.messageId?.trim() || computeFallbackMessageId(msg),
    }));

    const candidateIds = candidateEntries.map((c) => c.messageId);

    // Query existing message IDs for deduplication
    let existingIdsSet = new Set<string>();
    if (this.prisma?.email?.findMany) {
      const existing = await this.prisma.email.findMany({
        where: {
          userId,
          messageId: { in: candidateIds },
        },
        select: { messageId: true },
      });
      existingIdsSet = new Set(
        existing.map((e: { messageId: string | null }) => e.messageId).filter(Boolean),
      );
    }

    let importedCount = 0;
    let skippedCount = 0;
    const importedMessageIds: string[] = [];

    for (const { msg, messageId } of candidateEntries) {
      if (existingIdsSet.has(messageId)) {
        skippedCount++;
        continue;
      }

      // Determine folder and flags based on X-Gmail-Labels or targetFolder
      const labelsHeader = (msg.headers['x-gmail-labels'] || '').toLowerCase();
      const isTrash = labelsHeader.includes('trash') || options.targetFolder === 'trash';
      const isSpam = labelsHeader.includes('spam') || options.targetFolder === 'spam';
      const isSent = labelsHeader.includes('sent') || options.targetFolder === 'sent';
      const isDraft = labelsHeader.includes('draft') || options.targetFolder === 'draft';
      const isStarred = labelsHeader.includes('starred');
      const isImportant = labelsHeader.includes('important');
      const isRead = !labelsHeader.includes('unread');

      const snippet = (msg.bodyPlain || '').replace(/\s+/g, ' ').trim().slice(0, 200);

      const emailData = {
        userId,
        messageId,
        fromAddress: msg.fromAddress,
        fromName: msg.fromName ?? null,
        toAddresses: msg.toAddresses,
        ccAddresses: msg.ccAddresses,
        bccAddresses: [],
        subject: msg.subject || '(no subject)',
        bodyPlain: msg.bodyPlain,
        bodyHtml: msg.bodyHtml || (msg.bodyPlain ? `<pre>${msg.bodyPlain}</pre>` : ''),
        snippet,
        isRead,
        isStarred,
        isImportant,
        isDraft,
        isSent,
        isSpam,
        isTrash,
        deliveryStatus: 'delivered',
        receivedAt: msg.date ?? new Date(),
        sentAt: msg.date ?? (isSent ? new Date() : null),
      };

      if (this.prisma?.email?.create) {
        await this.prisma.email.create({
          data: emailData,
        });
      }

      existingIdsSet.add(messageId);
      importedCount++;
      importedMessageIds.push(messageId);
    }

    return {
      totalFound: parsedMessages.length,
      importedCount,
      skippedCount,
      messageIds: importedMessageIds,
    };
  }
}
