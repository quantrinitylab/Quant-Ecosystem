import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PrismaClient, Prisma } from '@quant/database';
import { createAppError } from '@quant/server-core';
import { CrossAppDispatcher } from '@quant/notifications';
import { EmailService, toMessageKind, toPriority } from '../services/email.service';
import { ThreadService } from '../services/thread.service';
import { ContactService } from '../services/contact.service';
import {
  OutboundDeliveryPipeline,
  OUTBOUND_DELIVERY_QUEUE,
} from '../services/outbound-delivery.service';
import { validateComposeEmail, sanitizeHtml } from '../middleware/validate-email';
import { formatEmailRecord } from '../lib/format-email';
import { MboxParserService } from '../services/mbox-parser.service';
import { ImapImporterService } from '../services/imap-importer.service';
import { retentionService } from './retention';
import { suppressionService } from '../services/suppression.service';

const notifier = new CrossAppDispatcher('quantmail');

function getPrisma(fastify: FastifyInstance): PrismaClient {
  return (fastify as unknown as { prisma: PrismaClient }).prisma;
}

async function getOrCreateFolder(
  prisma: PrismaClient,
  userId: string,
  name: string,
  type: 'SENT' | 'ARCHIVE' | 'TRASH' | 'SPAM' | 'INBOX' | 'DRAFTS',
): Promise<any> {
  const existing = await prisma.emailFolder.findFirst({
    where: { userId, OR: [{ name }, { type }] },
  });
  if (existing) return existing;
  return prisma.emailFolder.create({
    data: { userId, name, type },
  });
}

// Recipients typed as a bare handle ("krish") or as "Name <a@b.com>" or { email, name }
// are normalised to a real address before validation, so the composer no longer
// rejects what the user actually typed.
const DEFAULT_MAIL_DOMAIN = process.env['MAIL_SENDER_DOMAIN'] ?? 'quantmail.in';

function normalizeAddress(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const angle = value.match(/<([^>]+)>/);
  const raw = (angle ? angle[1] : value)
    .trim()
    .replace(/[,;]+$/, '')
    .toLowerCase();
  if (raw.length === 0) return raw;
  return raw.includes('@') ? raw : `${raw}@${DEFAULT_MAIL_DOMAIN}`;
}

function normalizeRecipient(value: unknown): unknown {
  if (value && typeof value === 'object' && 'email' in value) {
    return normalizeAddress((value as { email: unknown }).email);
  }
  return normalizeAddress(value);
}

const recipientArray = (min: number) =>
  z.preprocess(
    (value) => (Array.isArray(value) ? value.map(normalizeRecipient) : value),
    min > 0 ? z.array(z.string().email()).min(min) : z.array(z.string().email()),
  );

// Mail or chat, as the client spells it. Both are real messages on the same
// delivery path and in the same thread; the kind decides which composer wrote it
// and which mark the conversation shows. Absent means a letter, so every existing
// caller keeps working unchanged.
const messageKindSchema = z.enum(['mail', 'chat']).optional();

/** Priority level: case-insensitive, maps to Prisma EmailPriority enum (M06) */
const prioritySchema = z
  .enum(['low', 'normal', 'high', 'urgent', 'LOW', 'NORMAL', 'HIGH', 'URGENT'])
  .optional()
  .transform((val) =>
    val ? (val.toUpperCase() as 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT') : undefined,
  );

/**
 * Unified Compose Schema (Task M07)
 * Accepts recipients as string arrays (`toAddresses`) or objects (`to: [{ email, name }]`),
 * plain body as `bodyPlain` or `bodyText`, and normalizes to a single canonical contract.
 */
const composeSchema = z
  .object({
    toAddresses: recipientArray(0).optional(),
    to: recipientArray(0).optional(),
    ccAddresses: recipientArray(0).optional(),
    cc: recipientArray(0).optional(),
    bccAddresses: recipientArray(0).optional(),
    bcc: recipientArray(0).optional(),
    subject: z.string().min(1).max(500),
    bodyHtml: z.string().optional(),
    bodyPlain: z.string().optional(),
    bodyText: z.string().optional(),
    threadId: z.string().optional(),
    inReplyTo: z.string().optional(),
    attachments: z.array(z.any()).optional(),
    send: z.boolean().optional(),
    sentFolderId: z.string().optional(),
    messageKind: messageKindSchema,
    priority: prioritySchema,
    sendAt: z.string().optional(),
  })
  .refine(
    (data) => (data.toAddresses && data.toAddresses.length > 0) || (data.to && data.to.length > 0),
    {
      message: 'At least one recipient is required in "to" or "toAddresses"',
      path: ['toAddresses'],
    },
  )
  .transform((d) => ({
    toAddresses: (d.toAddresses && d.toAddresses.length > 0 ? d.toAddresses : d.to) as string[],
    ccAddresses: (d.ccAddresses && d.ccAddresses.length > 0
      ? d.ccAddresses
      : (d.cc ?? [])) as string[],
    bccAddresses: (d.bccAddresses && d.bccAddresses.length > 0
      ? d.bccAddresses
      : (d.bcc ?? [])) as string[],
    subject: d.subject,
    bodyHtml: d.bodyHtml,
    bodyPlain: d.bodyPlain ?? d.bodyText,
    threadId: d.threadId,
    inReplyTo: d.inReplyTo,
    attachments: d.attachments ?? [],
    send: d.send ?? false,
    sentFolderId: d.sentFolderId,
    messageKind: d.messageKind,
    priority: d.priority,
    sendAt: d.sendAt,
  }));

const moveSchema = z.object({
  folderId: z.string().min(1),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  folderId: z.string().optional(),
});

const searchSchema = z.object({
  q: z.string().min(1),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * Record that the sender wrote to these addresses.
 *
 * `ContactService.recordInteraction` has existed, tested, for months with zero
 * production callers — which is why `frequency` was always 0, "frequently
 * contacted" was ordered by nothing, and the composer's suggestions never
 * learned anybody. The three send paths call this; drafts do not, because
 * writing half a message to somebody is not contacting them.
 *
 * The collection, de-duplication and never-throwing live in
 * {@link ContactService.recordRecipients}; this only decides what to log.
 */
async function recordRecipientInteractions(params: {
  prisma: PrismaClient;
  userId: string;
  addressGroups: Array<readonly (string | undefined)[] | undefined>;
  logger?: { warn: (obj: unknown, msg: string) => void };
}): Promise<void> {
  const contacts = new ContactService(params.prisma);
  const { failed, total } = await contacts.recordRecipients(params.userId, params.addressGroups);

  if (failed > 0) {
    params.logger?.warn({ failed, total }, 'some contact interactions were not recorded');
  }
}

export default async function emailsRoutes(fastify: FastifyInstance) {
  let outboundQueue: ReturnType<typeof OutboundDeliveryPipeline.createQueue> | undefined;
  const createSendService = (prisma: PrismaClient) => {
    outboundQueue ??= OutboundDeliveryPipeline.createQueue();
    const pipeline = new OutboundDeliveryPipeline(prisma, outboundQueue);
    const suppression = (fastify as any).suppressionService ?? suppressionService;
    return new EmailService(prisma, pipeline, suppression);
  };

  fastify.addHook('onClose', async () => {
    await outboundQueue?.close();
  });

  // Unified compose and send handler (M07: collapses /emails and /emails/compose to one contract)
  const handleComposeOrSend = async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = composeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        `Invalid request: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
        400,
        'VALIDATION_ERROR',
      );
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const d = parseResult.data;
    const sanitizedHtml = d.bodyHtml ? sanitizeHtml(d.bodyHtml) : undefined;
    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);

    const email = await service.compose({
      userId,
      toAddresses: d.toAddresses,
      ccAddresses: d.ccAddresses,
      bccAddresses: d.bccAddresses,
      subject: d.subject,
      bodyHtml: sanitizedHtml,
      bodyPlain: d.bodyPlain,
      threadId: d.threadId,
      inReplyTo: d.inReplyTo,
      attachments: d.attachments,
      messageKind: toMessageKind(d.messageKind),
      priority: d.priority,
    });

    let delayMs: number | undefined;
    let scheduledSendAt: Date | undefined;
    if (d.sendAt) {
      const parsedDate = new Date(d.sendAt);
      if (isNaN(parsedDate.getTime())) {
        throw createAppError('Invalid sendAt timestamp', 400, 'VALIDATION_ERROR');
      }
      const now = Date.now();
      if (parsedDate.getTime() > now) {
        delayMs = parsedDate.getTime() - now;
        scheduledSendAt = parsedDate;
      }
    }

    const shouldSend = Boolean(d.send) || Boolean(scheduledSendAt);

    if (shouldSend) {
      // M-F01: If send: true is requested without sentFolderId, auto-resolve the user's Sent folder
      let sentFolderId = d.sentFolderId;
      if (!sentFolderId) {
        const sentFolder = await getOrCreateFolder(prisma, userId, 'Sent', 'SENT');
        sentFolderId = sentFolder.id;
      }

      const sendService = createSendService(prisma);
      const sent = await sendService.send(userId, email.id, sentFolderId!, {
        delayMs,
        sendAt: scheduledSendAt,
      });

      if (!delayMs) {
        try {
          await sendService.deliverInternally({
            fromUserId: userId,
            subject: d.subject,
            bodyHtml: sanitizedHtml,
            bodyPlain: d.bodyPlain,
            toAddresses: d.toAddresses,
            ccAddresses: d.ccAddresses,
            bccAddresses: d.bccAddresses,
            threadId: d.threadId,
            inReplyTo: d.inReplyTo,
            attachments: d.attachments,
            messageKind: toMessageKind(d.messageKind),
          });
        } catch (err) {
          request.log.warn({ err, emailId: email.id, userId }, 'internal delivery failure');
        }
      }

      await recordRecipientInteractions({
        prisma,
        userId,
        addressGroups: [d.toAddresses, d.ccAddresses, d.bccAddresses],
        logger: request.log,
      });

      return reply.status(201).send({ success: true, data: formatEmailRecord(sent) });
    }

    return reply.status(201).send({ success: true, data: formatEmailRecord(email) });
  };

  // POST /emails - Compose or send an email
  fastify.post('/', handleComposeOrSend);

  // POST /emails/compose - Unified composer contract (M07)
  fastify.post('/compose', handleComposeOrSend);

  // PUT /emails/:id - update an owned draft without creating duplicates.
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = composeSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = getPrisma(fastify);
    const existing = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!existing || existing.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (!existing.isDraft || existing.isSent) {
      throw createAppError('Only unsent drafts can be edited', 409, 'EMAIL_NOT_EDITABLE');
    }

    const d = parsed.data;

    /*
     * Absent key means "not edited, keep what is stored". Present key means
     * "this is the new value, including empty". The schema marks these optional,
     * so without the distinction every autosave rewrote them to '' / [] / null —
     * which is how saving a draft erased its body, its CC and BCC lists, and its
     * link to the thread it was written in.
     */
    const raw = (request.body ?? {}) as Record<string, unknown>;
    const provided = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);

    const email = await prisma.email.update({
      where: { id: request.params.id },
      data: {
        toAddresses: d.toAddresses,
        subject: d.subject,
        ...(provided('cc') || provided('ccAddresses') ? { ccAddresses: d.ccAddresses } : {}),
        ...(provided('bcc') || provided('bccAddresses') ? { bccAddresses: d.bccAddresses } : {}),
        ...(provided('bodyHtml') ? { bodyHtml: d.bodyHtml ? sanitizeHtml(d.bodyHtml) : '' } : {}),
        ...(provided('bodyText') || provided('bodyPlain') ? { bodyPlain: d.bodyPlain ?? '' } : {}),
        ...(provided('inReplyTo') ? { inReplyTo: d.inReplyTo ?? null } : {}),
        ...(provided('threadId') ? { threadId: d.threadId ?? null } : {}),
        ...(d.priority ? { priority: toPriority(d.priority) } : {}),
        // Only rewrite the kind when the caller states one, so saving a draft from
        // a composer that does not know about kinds cannot silently reclassify it.
        ...(d.messageKind ? { messageKind: toMessageKind(d.messageKind) } : {}),
        ...(d.attachments
          ? {
              attachments: d.attachments,
              hasAttachments: d.attachments.length > 0,
            }
          : {}),
      },
    });

    return reply.send({ success: true, data: formatEmailRecord(email) });
  });

  // POST /emails/:id/send - durably queue an owned draft for delivery.
  fastify.post<{ Params: { id: string } }>('/:id/send', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (!email.isDraft || email.isSent) {
      throw createAppError('Only an unsent draft can be sent', 409, 'EMAIL_NOT_SENDABLE');
    }

    const sentFolder = await getOrCreateFolder(prisma, userId, 'Sent', 'SENT');
    const sendService = createSendService(prisma);

    const body = (request.body ?? {}) as { sendAt?: string; delayMs?: number };
    let delayMs = body.delayMs;
    let scheduledSendAt: Date | undefined;
    if (body.sendAt) {
      const parsedDate = new Date(body.sendAt);
      if (isNaN(parsedDate.getTime())) {
        throw createAppError('Invalid sendAt timestamp', 400, 'VALIDATION_ERROR');
      }
      const now = Date.now();
      if (parsedDate.getTime() > now) {
        delayMs = parsedDate.getTime() - now;
        scheduledSendAt = parsedDate;
      }
    }

    const sent = await sendService.send(userId, email.id, sentFolder.id, {
      delayMs,
      sendAt: scheduledSendAt,
    });

    const asArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

    await recordRecipientInteractions({
      prisma,
      userId,
      addressGroups: [
        asArray(email.toAddresses),
        asArray(email.ccAddresses),
        asArray(email.bccAddresses),
      ],
      logger: request.log,
    });

    let targetThreadId = email.threadId;
    try {
      const threadService = new ThreadService(prisma);
      if (!targetThreadId) {
        targetThreadId = await threadService.stitchInbound({
          userId,
          subject: email.subject || 'Conversation',
          inReplyTo: email.inReplyTo,
          participants: [email.fromAddress, ...asArray(email.toAddresses)],
          at: new Date(),
        });
        await prisma.email.update({
          where: { id: email.id },
          data: { threadId: targetThreadId },
        });
      } else {
        await prisma.emailThread.update({
          where: { id: targetThreadId },
          data: { lastEmailAt: new Date(), messageCount: { increment: 1 } },
        });
      }
    } catch (err) {
      request.log.warn({ err, emailId: email.id }, 'thread stitching failed');
    }

    if (!delayMs) {
      try {
        await sendService.deliverInternally({
          fromUserId: userId,
          subject: email.subject,
          bodyHtml: email.bodyHtml ?? undefined,
          bodyPlain: email.bodyPlain ?? undefined,
          toAddresses: asArray(email.toAddresses),
          ccAddresses: asArray(email.ccAddresses),
          bccAddresses: asArray(email.bccAddresses),
          threadId: targetThreadId ?? undefined,
          inReplyTo: email.inReplyTo ?? undefined,
          attachments: (email.attachments as any[]) ?? [],
          messageKind: toMessageKind((email as any).messageKind),
        });
      } catch (error) {
        request.log.warn({ err: error, emailId: email.id }, 'internal mailbox delivery failed');
      }
    }

    return reply.status(202).send({
      success: true,
      data: {
        message: 'Email queued for delivery',
        emailId: email.id,
        deliveryStatus: (sent as { deliveryStatus?: string | null }).deliveryStatus ?? 'queued',
      },
    });
  });

  // POST /emails/:id/undo-send & POST /emails/:id/cancel-send (Tasks M21, M22, M23)
  const handleUndoSend = async (
    request: import('fastify').FastifyRequest<{ Params: { id: string } }>,
    reply: import('fastify').FastifyReply,
  ) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    const isQueuedOrSending =
      email.deliveryStatus === 'queued' || email.deliveryStatus === 'sending';
    const isWithinUndoWindow =
      Boolean(email.sentAt) &&
      Date.now() - new Date(email.sentAt!).getTime() <= 30_000 &&
      email.deliveryStatus !== 'delivered' &&
      email.deliveryStatus !== 'failed';

    if (!isQueuedOrSending && !isWithinUndoWindow) {
      throw createAppError(
        'Email cannot be undone (not queued or undo window expired)',
        400,
        'CANNOT_UNDO_SEND',
      );
    }

    try {
      outboundQueue ??= OutboundDeliveryPipeline.createQueue();
      await outboundQueue.remove(`${OUTBOUND_DELIVERY_QUEUE}-${email.id}`).catch(() => {});
      await outboundQueue.remove(email.id).catch(() => {});
    } catch (err) {
      request.log.warn({ err, emailId: email.id }, 'failed cancelling queue job during undo-send');
    }

    let draftsFolder: { id: string } | null = await prisma.emailFolder.findFirst({
      where: { userId, OR: [{ name: 'Drafts' }, { type: 'DRAFTS' }] },
    });
    if (!draftsFolder) {
      draftsFolder = await getOrCreateFolder(prisma, userId, 'Drafts', 'DRAFTS');
    }

    await prisma.email.update({
      where: { id: email.id },
      data: {
        isDraft: true,
        isSent: false,
        sentAt: null,
        deliveryStatus: 'draft',
        folderId: draftsFolder?.id ?? null,
      } as never,
    });

    return reply.send({
      success: true,
      data: {
        message: 'Send cancelled, email returned to Drafts',
        emailId: email.id,
      },
    });
  };

  fastify.post<{ Params: { id: string } }>('/:id/undo-send', handleUndoSend);
  fastify.post<{ Params: { id: string } }>('/:id/cancel-send', handleUndoSend);

  // POST /emails/:id/reply - reply to a message. The client may pass either an
  // email id or a thread id (the thread view historically sends the thread id),
  // so both resolve here. Composes and sends immediately, reusing the same
  // delivery path as /:id/send — this route was missing, which is why replies
  // 404ed and never left the composer.
  fastify.post<{ Params: { id: string } }>('/:id/reply', async (request, reply) => {
    const parsed = z
      .object({
        body: z.string().min(1).max(100_000),
        replyAll: z.boolean().optional(),
        // A reply typed into the conversation's own input is a chat message; the
        // full composer posts `mail`. Defaulted rather than required so older
        // clients keep working — they only ever used the quick input.
        messageKind: messageKindSchema,
      })
      .safeParse(request.body);
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = getPrisma(fastify);

    // Resolve the id as an owned email first, then as an owned thread's latest message.
    let original = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (original && original.userId !== userId) original = null;
    if (!original) {
      const thread = await prisma.emailThread
        .findUnique({ where: { id: request.params.id } })
        .catch(() => null);
      if (thread && thread.userId === userId) {
        original = await prisma.email.findFirst({
          where: { threadId: thread.id, userId, deletedAt: null },
          orderBy: { receivedAt: 'desc' },
        });
      }
    }
    if (!original) {
      throw createAppError('Message to reply to was not found', 404, 'EMAIL_NOT_FOUND');
    }

    const messageKind = toMessageKind(
      parsed.data.messageKind ?? (original as any)?.messageKind ?? 'mail',
    );

    const me = await prisma.user.findUnique({ where: { id: userId } });
    const hasValidSender = Boolean(me?.email?.includes('@') || me?.username);
    if (!hasValidSender) {
      throw createAppError(
        'User has no valid sender identity configured',
        400,
        'INVALID_SENDER_IDENTITY',
      );
    }
    const myEmail = (me?.email ?? '').toLowerCase();
    const asArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

    // Reply target: the original sender. When replying to my own sent message,
    // fall back to the original recipients so the reply still goes somewhere real.
    let to = [original.fromAddress].filter(
      (a: string) => typeof a === 'string' && a.length > 0 && a.toLowerCase() !== myEmail,
    );
    if (to.length === 0) {
      to = asArray(original.toAddresses).filter((a) => a.toLowerCase() !== myEmail);
    }
    if (to.length === 0 && original.fromAddress) to = [original.fromAddress];
    if (to.length === 0) throw createAppError('No recipient to reply to', 400, 'NO_RECIPIENT');

    let cc: string[] = [];
    if (parsed.data.replyAll) {
      cc = [...asArray(original.toAddresses), ...asArray(original.ccAddresses)].filter(
        (a) => a && a.toLowerCase() !== myEmail && !to.includes(a),
      );
    }

    const baseSubject = (original.subject ?? '') as string;
    const subject = /^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`.trim();

    // Ensure both original and reply are linked under a unified EmailThread
    let targetThreadId: string | null = original.threadId;
    if (!targetThreadId) {
      try {
        const threadService = new ThreadService(prisma);
        targetThreadId = await threadService.stitchInbound({
          userId,
          subject: baseSubject || 'Conversation',
          participants: [original.fromAddress, ...to],
          at: original.receivedAt || new Date(),
        });
        await prisma.email.update({
          where: { id: original.id },
          data: { threadId: targetThreadId },
        });
      } catch (err) {
        request.log.warn({ err, emailId: original.id }, 'reply thread stitching failed');
        targetThreadId = null;
      }
    }

    const sendService = createSendService(prisma);
    const draft = await sendService.compose({
      userId,
      toAddresses: to,
      ccAddresses: cc,
      bccAddresses: [],
      subject,
      bodyPlain: parsed.data.body,
      threadId: targetThreadId ?? undefined,
      inReplyTo: original.id,
      messageKind,
    });

    let sent: any;
    try {
      const sentFolder = await getOrCreateFolder(prisma, userId, 'Sent', 'SENT');
      sent = await sendService.send(userId, draft.id, sentFolder.id);
    } catch (sendError) {
      // M-F05: Clean up orphan draft if sending fails
      await prisma.email.delete({ where: { id: draft.id } }).catch((delErr) => {
        request.log.warn(
          { err: delErr, draftId: draft.id },
          'failed to delete orphan draft on reply send failure',
        );
      });
      throw sendError;
    }

    await recordRecipientInteractions({
      prisma,
      userId,
      addressGroups: [to, cc],
      logger: request.log,
    });

    try {
      await sendService.deliverInternally({
        fromUserId: userId,
        subject,
        bodyPlain: parsed.data.body,
        toAddresses: to,
        ccAddresses: cc,
        threadId: targetThreadId ?? undefined,
        inReplyTo: original.id,
        messageKind,
      });
    } catch (error) {
      request.log.warn({ err: error, emailId: sent.id }, 'internal reply delivery failed');
    }

    return reply.status(202).send({
      success: true,
      data: {
        message: 'Email queued for delivery',
        emailId: sent.id,
        deliveryStatus: (sent as { deliveryStatus?: string | null }).deliveryStatus ?? 'queued',
        email: formatEmailRecord(sent),
      },
    });
  });

  // POST /emails/:id/archive - move to the owner's archive folder without trashing it.
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (email.isTrash || email.deletedAt) {
      throw createAppError('Restore the email before archiving it', 409, 'EMAIL_IN_TRASH');
    }

    const archiveFolder = await getOrCreateFolder(prisma, userId, 'Archive', 'ARCHIVE');
    await prisma.email.update({
      where: { id: request.params.id },
      data: { folderId: archiveFolder.id, isTrash: false, deletedAt: null },
    });
    return reply.send({ success: true, data: { message: 'Email archived' } });
  });

  // POST /emails/:id/unarchive - move an archived email back to the inbox.
  fastify.post<{ Params: { id: string } }>('/:id/unarchive', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    await prisma.email.update({
      where: { id: request.params.id },
      data: { folderId: null, isTrash: false, deletedAt: null },
    });
    return reply.send({ success: true, data: { message: 'Email moved to inbox' } });
  });

  // POST /emails/:id/restore - restore a recoverable trashed email to the inbox.
  fastify.post<{ Params: { id: string } }>('/:id/restore', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (email.deletedAt) {
      throw createAppError('Permanently deleted email cannot be restored', 409, 'EMAIL_DELETED');
    }
    await prisma.email.update({
      where: { id: request.params.id },
      data: { folderId: null, isTrash: false, deletedAt: null },
    });
    return reply.send({ success: true, data: { message: 'Email restored to inbox' } });
  });

  // POST /emails/:id/snooze - persist a future wake time on an owner-local thread.
  fastify.post<{ Params: { id: string } }>('/:id/snooze', async (request, reply) => {
    const parsed = z.object({ snoozeUntil: z.string().datetime() }).safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const snoozeUntil = new Date(parsed.data.snoozeUntil);
    if (snoozeUntil.getTime() <= Date.now()) {
      throw createAppError('Snooze time must be in the future', 400, 'INVALID_SNOOZE_TIME');
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (email.isTrash || email.deletedAt) {
      throw createAppError('Trashed email cannot be snoozed', 409, 'EMAIL_IN_TRASH');
    }

    let thread = email.threadId
      ? await prisma.emailThread.findUnique({ where: { id: email.threadId } })
      : null;
    if (!thread || thread.userId !== userId) {
      thread = await prisma.emailThread.create({
        data: {
          userId,
          subject: email.subject,
          participantAddresses: [
            email.fromAddress,
            ...(Array.isArray(email.toAddresses) ? email.toAddresses : []),
          ].filter(Boolean),
          messageCount: 1,
          isRead: email.isRead,
          isStarred: email.isStarred,
          lastEmailAt: email.receivedAt ?? email.createdAt,
        },
      });
      await prisma.email.update({
        where: { id: request.params.id },
        data: { threadId: thread.id },
      });
    }

    await prisma.emailThread.update({
      where: { id: thread.id },
      data: { snoozedUntil: snoozeUntil },
    });
    return reply.send({
      success: true,
      data: { message: 'Email snoozed', snoozedUntil: snoozeUntil.toISOString() },
    });
  });

  // POST /emails/:id/unsnooze - clear the wake timer so the thread returns to the inbox now.
  fastify.post<{ Params: { id: string } }>('/:id/unsnooze', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    if (email.threadId) {
      const thread = await prisma.emailThread.findUnique({ where: { id: email.threadId } });
      if (thread && thread.userId === userId) {
        await prisma.emailThread.update({
          where: { id: thread.id },
          data: { snoozedUntil: null },
        });
      }
    }
    return reply.send({ success: true, data: { message: 'Snooze cleared' } });
  });

  // POST /emails/:id/not-spam - rescue a wrongly flagged email back to the inbox.
  fastify.post<{ Params: { id: string } }>('/:id/not-spam', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    await prisma.email.update({
      where: { id: request.params.id },
      data: { isSpam: false, folderId: null, isTrash: false, deletedAt: null },
    });
    return reply.send({ success: true, data: { message: 'Moved to inbox' } });
  });

  // POST /emails/:id/unread - mark as unread.
  fastify.post<{ Params: { id: string } }>('/:id/unread', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }
    await prisma.email.update({ where: { id: request.params.id }, data: { isRead: false } });
    return reply.send({ success: true, data: { message: 'Marked as unread' } });
  });

  // POST /emails/:id/unsubscribe - RFC 8058 One-Click List-Unsubscribe
  fastify.post<{ Params: { id: string } }>('/:id/unsubscribe', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId || email.deletedAt) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    const emailRecord = email as any;
    // Extract headers from authResults or custom header fields if present
    const authData =
      typeof emailRecord.authResults === 'object' && emailRecord.authResults !== null
        ? (emailRecord.authResults as Record<string, any>)
        : {};
    const headers = authData.headers || {};

    const rawListUnsub: string = headers['list-unsubscribe'] || headers['List-Unsubscribe'] || '';
    const listUnsubPost: string =
      headers['list-unsubscribe-post'] || headers['List-Unsubscribe-Post'] || '';

    let targetUrl: string | null = null;
    let method: 'POST' | 'GET' | 'mailto' = 'POST';

    if (rawListUnsub) {
      const match = rawListUnsub.match(/<([^>]+)>/);
      if (match && match[1]) {
        targetUrl = match[1];
        if (targetUrl.startsWith('mailto:')) {
          method = 'mailto';
        } else if (listUnsubPost.toLowerCase().includes('one-click')) {
          method = 'POST';
        } else {
          method = 'GET';
        }
      }
    } else if (email.bodyHtml && email.bodyHtml.includes('unsubscribe')) {
      const match = email.bodyHtml.match(/href=["'](https?:\/\/[^"']*unsubscribe[^"']*)["']/i);
      if (match && match[1]) {
        targetUrl = match[1];
        method = 'GET';
      }
    }

    if (!targetUrl) {
      throw createAppError(
        'No unsubscribe link or RFC 8058 header found for this email',
        400,
        'NO_UNSUBSCRIBE_HEADER',
      );
    }

    // Append 'UNSUBSCRIBED' label to email labels
    const currentLabels = Array.isArray(emailRecord.labels) ? (emailRecord.labels as string[]) : [];
    if (!currentLabels.includes('UNSUBSCRIBED')) {
      await prisma.email.update({
        where: { id: email.id },
        data: {
          labels: [...currentLabels, 'UNSUBSCRIBED'],
        },
      });
    }

    return reply.send({
      success: true,
      data: {
        unsubscribed: true,
        method,
        targetUrl,
        message: 'Successfully unsubscribed from mailing list',
      },
    });
  });

  // POST /emails/mark-all-read - bulk-clear unread state for the current inbox
  // view (optionally scoped to one category tab). Mirrors the GET / inbox
  // filters so it never touches drafts, sent, spam, trash or snoozed threads.
  fastify.post('/mark-all-read', async (request, reply) => {
    const parsed = z
      .object({ category: z.string().max(50).optional() })
      .safeParse(request.body ?? {});
    if (!parsed.success) throw parsed.error;

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = getPrisma(fastify);

    const where: any = {
      userId,
      deletedAt: null,
      isRead: false,
      isDraft: false,
      isSent: false,
      isSpam: false,
      isTrash: false,
      AND: [
        { OR: [{ folderId: null }, { folder: { is: { type: 'INBOX' } } }] },
        {
          OR: [
            { threadId: null },
            { thread: { is: { snoozedUntil: null } } },
            { thread: { is: { snoozedUntil: { lte: new Date() } } } },
          ],
        },
      ],
    };
    const category = parsed.data.category?.toLowerCase();
    if (category && category !== 'primary') {
      where.aiCategory = category;
    } else if (category === 'primary') {
      where.AND.push({ OR: [{ aiCategory: null }, { aiCategory: 'primary' }] });
    }

    const result = await prisma.email.updateMany({ where, data: { isRead: true } });
    return reply.send({
      success: true,
      data: { message: 'All caught up', updated: result.count ?? 0 },
    });
  });

  // GET /emails - List emails (requires folderId or search)
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const q = (request.query ?? {}) as Record<string, string>;
    const page = Math.max(1, Number(q.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize || q.limit) || 50));
    const skip = (page - 1) * pageSize;

    const prisma = getPrisma(fastify);
    const where: any = { userId, deletedAt: null };
    const folderType = q.folderType?.toUpperCase();
    if (q.folderId) {
      where.folderId = q.folderId;
    } else if (folderType === 'TRASH') {
      where.isTrash = true;
    } else if (folderType === 'ARCHIVE') {
      where.isTrash = false;
      where.folder = { is: { type: 'ARCHIVE' } };
    } else if (folderType === 'SENT') {
      where.isSent = true;
      where.isTrash = false;
    } else if (folderType === 'DRAFTS') {
      where.isDraft = true;
      where.isTrash = false;
    } else if (folderType === 'SPAM') {
      where.isSpam = true;
      where.isTrash = false;
    } else if (folderType === 'STARRED') {
      // Starred is a flag, not a folder: show every recoverable starred email.
      where.isStarred = true;
      where.isTrash = false;
      where.isDraft = false;
      where.isSpam = false;
    } else if (folderType === 'SNOOZED') {
      // Threads whose wake time is still in the future.
      where.isTrash = false;
      where.isDraft = false;
      where.isSpam = false;
      where.thread = { is: { snoozedUntil: { gt: new Date() } } };
    } else {
      // Default inbox: active conversation messages (both received and sent in active threads)
      // that are not in Trash, Archive, Spam, or Drafts, and whose snooze has elapsed.
      where.isDraft = false;
      where.isSpam = false;
      where.isTrash = false;
      where.AND = [
        {
          OR: [{ folderId: null }, { folder: { is: { type: 'INBOX' } } }, { isSent: true }],
        },
        /*
         * Archive has to outrank the `isSent` arm above, or it cannot remove a sent
         * message from the inbox at all.
         *
         * That arm is what puts your own replies in the same thread as the mail they
         * answer, and it is unconditional: `POST /:id/archive` moves the row into the
         * ARCHIVE folder, and the row matched `isSent: true` on the way back out. A
         * conversation that is entirely outbound therefore could not be archived —
         * eleven messages moved folder, eleven came back, and the only visible effect
         * was the list flickering. Received mail hid the bug, because it leaves the
         * inbox through the `folder.type` arm.
         *
         * Written as "no folder, or a folder that is not the archive" rather than as a
         * `NOT`, because the relation is nullable and a `NOT` over it reads as though
         * it might drop the unfiled mail that makes up most of the inbox.
         */
        {
          OR: [{ folderId: null }, { folder: { is: { type: { not: 'ARCHIVE' } } } }],
        },
        {
          OR: [
            { threadId: null },
            { thread: { is: { snoozedUntil: null } } },
            { thread: { is: { snoozedUntil: { lte: new Date() } } } },
          ],
        },
      ];
    }

    // Category tabs (Focus/Updates/People/Offers/Groups): filter on aiCategory.
    // Uncategorised mail counts as primary so Focus is never artificially empty,
    // and the other tabs only show mail that actually belongs to them.
    const category = typeof q.category === 'string' ? q.category.toLowerCase() : '';
    if (category && category !== 'primary') {
      where.aiCategory = category;
    } else if (category === 'primary') {
      const primaryOnly = { OR: [{ aiCategory: null }, { aiCategory: 'primary' }] };
      where.AND = Array.isArray(where.AND) ? [...where.AND, primaryOnly] : [primaryOnly];
    }

    /*
     * `createdAt` is the tiebreaker, not decoration. Two messages can share a
     * `receivedAt` to the millisecond — a send and its internal delivery copy
     * routinely do — and ordering by one column alone leaves their relative
     * position up to the planner, so the same row can land on two pages of the
     * same list or on none. The composite index added in migration 0052 matches
     * this ordering.
     */
    const timelineOrder: Prisma.EmailOrderByWithRelationInput[] = [
      { receivedAt: 'desc' },
      { createdAt: 'desc' },
    ];
    const [data, total, unreadCount] = await Promise.all([
      prisma.email.findMany({ where, skip, take: pageSize, orderBy: timelineOrder }),
      prisma.email.count({ where }),
      prisma.email.count({ where: { ...where, isRead: false } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Augment each email with a category (used by inbox tabs) and return a
    // unified envelope with data.
    const items = data.map(formatEmailRecord);
    return reply.send({
      success: true,
      data: items,
      page,
      pageSize,
      totalPages,
      totalCount: total,
      unreadCount,
    });
  });

  // GET /emails/search
  fastify.get('/search', async (request, reply) => {
    const queryResult = searchSchema.safeParse(request.query);
    if (!queryResult.success) {
      throw queryResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);

    const result = await service.search(userId, queryResult.data.q, {
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });

    // One API, one shape for a list of emails. Same envelope as the folder listing now,
    // pagination fields alongside the array rather than wrapped around it.
    const items = (result.data || []).map(formatEmailRecord);
    return reply.send({
      success: true,
      data: items,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
      totalCount: result.total,
      hasNext: result.hasNext,
      hasPrev: result.hasPrev,
    });
  });

  // GET /emails/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);
    const email = await service.getEmail(request.params.id, userId);

    return reply.send({ success: true, data: formatEmailRecord(email) });
  });

  // DELETE /emails/:id - first call moves to trash; a second call from trash
  // records a logical permanent deletion without erasing history.
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email || email.userId !== userId) {
      throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    }

    // Legal hold enforcement (Task X07)
    const sender = email.fromAddress;
    const toList = Array.isArray(email.toAddresses) ? (email.toAddresses as string[]) : [];
    const participants = [sender, ...toList].filter(Boolean);
    for (const address of participants) {
      if (await retentionService.isUnderLegalHold(address)) {
        throw createAppError(
          `Cannot delete email: participant ${address} is subject to an active legal hold`,
          423,
          'LEGAL_HOLD_ACTIVE',
        );
      }
    }

    if (email.isTrash) {
      const deleted = await prisma.email.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      });
      return reply.send({ success: true, data: formatEmailRecord(deleted) });
    }

    const trashFolder = await getOrCreateFolder(prisma, userId, 'Trash', 'TRASH');
    const trashed = await prisma.email.update({
      where: { id: request.params.id },
      data: { folderId: trashFolder.id, isTrash: true, deletedAt: null },
    });
    return reply.send({ success: true, data: formatEmailRecord(trashed) });
  });

  // POST /emails/:id/read
  fastify.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);
    const email = await service.markRead(request.params.id, userId);

    return reply.send({ success: true, data: formatEmailRecord(email) });
  });

  // POST /emails/:id/star
  fastify.post<{ Params: { id: string } }>('/:id/star', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);
    const email = await service.markStarred(request.params.id, userId);

    return reply.send({ success: true, data: formatEmailRecord(email) });
  });

  // POST /emails/:id/move
  fastify.post<{ Params: { id: string } }>('/:id/move', async (request, reply) => {
    const parseResult = moveSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);
    const email = await service.moveToFolder(request.params.id, parseResult.data.folderId, userId);

    return reply.send({ success: true, data: formatEmailRecord(email) });
  });

  const batchActionSchema = z.object({
    action: z.enum(['markRead', 'markUnread', 'archive', 'delete', 'star', 'unstar']),
    emailIds: z.array(z.string().min(1)).min(1).max(500),
    folderId: z.string().optional(),
    hard: z.boolean().optional(),
  });

  // POST /emails/batch - single batch transaction for bulk email actions (Task QM-04)
  fastify.post('/batch', async (request, reply) => {
    const parseResult = batchActionSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = getPrisma(fastify);
    const service = new EmailService(prisma);
    const { action, emailIds, folderId, hard } = parseResult.data;

    let result: { count: number };
    switch (action) {
      case 'markRead':
        result = await service.batchMarkRead(emailIds, userId, true);
        break;
      case 'markUnread':
        result = await service.batchMarkRead(emailIds, userId, false);
        break;
      case 'archive': {
        let targetFolderId = folderId;
        if (!targetFolderId) {
          const archiveFolder = await getOrCreateFolder(prisma, userId, 'Archive', 'ARCHIVE');
          targetFolderId = archiveFolder.id;
        }
        result = await service.batchArchive(emailIds, targetFolderId!, userId);
        break;
      }
      case 'delete':
        result = await service.batchDelete(emailIds, userId, hard ?? false);
        break;
      case 'star':
        result = await service.batchStar(emailIds, userId, true);
        break;
      case 'unstar':
        result = await service.batchStar(emailIds, userId, false);
        break;
    }

    return reply.send({ success: true, data: result });
  });

  const importMboxSchema = z.object({
    mboxData: z.string().min(1),
    folder: z.enum(['inbox', 'sent', 'archive', 'trash', 'spam', 'draft']).optional(),
    maxMessages: z.number().int().min(1).max(500).optional(),
  });

  // POST /emails/import/mbox - RFC 4155 / Google Takeout MBOX bulk import engine (Task X02)
  fastify.post('/import/mbox', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    let mboxData = '';
    let folder: string | undefined;
    let maxMessages: number | undefined;

    if (typeof request.body === 'string') {
      mboxData = request.body;
    } else {
      const parseResult = importMboxSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw parseResult.error;
      }
      mboxData = parseResult.data.mboxData;
      folder = parseResult.data.folder;
      maxMessages = parseResult.data.maxMessages;
    }

    const prisma = getPrisma(fastify);
    const service = new MboxParserService(prisma);
    const result = await service.importMbox(userId, mboxData, {
      targetFolder: folder,
      maxMessages,
    });

    return reply.status(201).send({ success: true, data: result });
  });

  const importImapSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().min(1).max(65535).optional(),
    tls: z.boolean().optional(),
    username: z.string().min(1),
    password: z.string().optional(),
    accessToken: z.string().optional(),
    mailbox: z.string().optional(),
    maxMessages: z.number().int().min(1).max(500).optional(),
    folder: z.enum(['inbox', 'sent', 'archive', 'trash', 'spam', 'draft']).optional(),
  });

  // POST /emails/import/imap - RFC 3501 IMAP mailbox bulk import & thread sync engine (Task X01)
  fastify.post('/import/imap', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const parseResult = importImapSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw createAppError(
        parseResult.error.errors[0]?.message || 'Validation error',
        400,
        'VALIDATION_ERROR',
      );
    }

    const prisma = getPrisma(fastify);
    const service = new ImapImporterService(prisma);
    const result = await service.importFromImap(userId, {
      ...parseResult.data,
      targetFolder: parseResult.data.folder,
    });

    return reply.status(201).send({ success: true, data: result });
  });

  // GET /emails/import/imap/status/:jobId - IMAP sync job progress inspection (Task X01)
  fastify.get<{ Params: { jobId: string } }>(
    '/import/imap/status/:jobId',
    async (request, reply) => {
      const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
      if (!userId) {
        throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const prisma = getPrisma(fastify);
      const service = new ImapImporterService(prisma);
      const job = service.getJobStatus(request.params.jobId);
      if (!job || job.userId !== userId) {
        throw createAppError('IMAP sync job not found', 404, 'NOT_FOUND');
      }

      return reply.send({ success: true, data: job });
    },
  );
}
