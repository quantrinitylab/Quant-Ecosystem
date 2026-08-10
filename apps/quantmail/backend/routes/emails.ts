import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { CrossAppDispatcher } from '@quant/notifications';
import { EmailService } from '../services/email.service';
import { OutboundDeliveryPipeline } from '../services/outbound-delivery.service';
import { validateComposeEmail, sanitizeHtml } from '../middleware/validate-email';

const notifier = new CrossAppDispatcher('quantmail');

const composeSchema = z.object({
  toAddresses: z.array(z.string().email()).min(1),
  ccAddresses: z.array(z.string().email()).optional(),
  bccAddresses: z.array(z.string().email()).optional(),
  subject: z.string().min(1).max(500),
  bodyHtml: z.string().optional(),
  bodyPlain: z.string().optional(),
  threadId: z.string().optional(),
  inReplyTo: z.string().optional(),
  send: z.boolean().optional(),
  sentFolderId: z.string().optional(),
});

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

export default async function emailsRoutes(fastify: FastifyInstance) {
  // POST /emails - Compose or send an email
  fastify.post('/', async (request, reply) => {
    const parseResult = composeSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    validateComposeEmail({
      toAddresses: parseResult.data.toAddresses,
      ccAddresses: parseResult.data.ccAddresses,
      bccAddresses: parseResult.data.bccAddresses,
      subject: parseResult.data.subject,
      bodyHtml: parseResult.data.bodyHtml,
      bodyPlain: parseResult.data.bodyPlain,
    });

    const sanitizedHtml = parseResult.data.bodyHtml
      ? sanitizeHtml(parseResult.data.bodyHtml)
      : undefined;

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);

    const email = await service.compose({
      userId,
      ...parseResult.data,
      bodyHtml: sanitizedHtml,
    });

    if (parseResult.data.send && parseResult.data.sentFolderId) {
      // Durable, queued outbound delivery: enqueue a real BullMQ job and set
      // the email deliveryStatus to `queued` (Requirements 4.1/4.2).
      const pipeline = new OutboundDeliveryPipeline(
        prisma as never,
        OutboundDeliveryPipeline.createQueue(),
      );
      const sendService = new EmailService(prisma as never, pipeline);
      const sent = await sendService.send(userId, email.id, parseResult.data.sentFolderId);

      // Internal delivery: any recipient that is itself a QuantMail user gets a
      // received copy in their mailbox immediately (mail between @quantchat.online
      // addresses works with no external SMTP). External recipients continue via
      // the outbound pipeline enqueued above.
      try {
        await sendService.deliverInternally({
          fromUserId: userId,
          subject: parseResult.data.subject,
          bodyHtml: sanitizedHtml,
          bodyPlain: parseResult.data.bodyPlain,
          toAddresses: parseResult.data.toAddresses,
          ccAddresses: parseResult.data.ccAddresses,
          bccAddresses: parseResult.data.bccAddresses,
          threadId: parseResult.data.threadId,
          inReplyTo: parseResult.data.inReplyTo,
        });
      } catch {
        /* internal delivery failure must not block the send response */
      }

      // Notify recipients about the new email
      try {
        notifier.notifyNewEmail(
          parseResult.data.toAddresses,
          userId,
          parseResult.data.subject,
          email.id,
        );
      } catch {
        /* notification failure should not block email sending */
      }

      return reply.status(201).send({ success: true, data: sent });
    }

    return reply.status(201).send({ success: true, data: email });
  });

  // POST /emails/compose - create a draft (frontend composer contract).
  // Accepts recipients as {email,name}[] and maps them to address arrays.
  const addr = z.object({ email: z.string().email(), name: z.string().optional() });
  const composeRequestSchema = z.object({
    to: z.array(addr).min(1),
    cc: z.array(addr).optional(),
    bcc: z.array(addr).optional(),
    subject: z.string().min(1).max(500),
    bodyText: z.string().optional(),
    bodyHtml: z.string().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    inReplyTo: z.string().optional(),
    threadId: z.string().optional(),
  });

  fastify.post('/compose', async (request, reply) => {
    const parsed = composeRequestSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const d = parsed.data;
    const sanitized = d.bodyHtml ? sanitizeHtml(d.bodyHtml) : undefined;
    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);

    const email = await service.compose({
      userId,
      toAddresses: d.to.map((r) => r.email),
      ccAddresses: d.cc?.map((r) => r.email) ?? [],
      bccAddresses: d.bcc?.map((r) => r.email) ?? [],
      subject: d.subject,
      bodyHtml: sanitized,
      bodyPlain: d.bodyText,
      inReplyTo: d.inReplyTo,
      threadId: d.threadId,
    });
    return reply.status(201).send({ success: true, data: email });
  });

  // PUT /emails/:id - update an owned draft without creating duplicates.
  fastify.put<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const parsed = composeRequestSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const existing = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!existing) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (existing.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    if (!existing.isDraft || existing.isSent) {
      throw createAppError('Only unsent drafts can be edited', 409, 'EMAIL_NOT_EDITABLE');
    }

    const d = parsed.data;
    const email = await prisma.email.update({
      where: { id: request.params.id },
      data: {
        toAddresses: d.to.map((recipient) => recipient.email),
        ccAddresses: d.cc?.map((recipient) => recipient.email) ?? [],
        bccAddresses: d.bcc?.map((recipient) => recipient.email) ?? [],
        subject: d.subject,
        bodyHtml: d.bodyHtml ? sanitizeHtml(d.bodyHtml) : '',
        bodyPlain: d.bodyText ?? '',
        priority: d.priority?.toUpperCase(),
        inReplyTo: d.inReplyTo ?? null,
        threadId: d.threadId ?? null,
      },
    });

    return reply.send({ success: true, data: email });
  });

  // POST /emails/:id/send - send a draft + deliver to QuantMail recipients.
  fastify.post<{ Params: { id: string } }>('/:id/send', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const service = new EmailService(prisma as never);

    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    if (!email.isDraft || email.isSent) {
      throw createAppError('Only an unsent draft can be sent', 409, 'EMAIL_NOT_SENDABLE');
    }

    await prisma.email.update({
      where: { id: request.params.id },
      data: { isDraft: false, isSent: true, sentAt: new Date(), deliveryStatus: 'delivered' },
    });

    const asArray = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);
    try {
      await service.deliverInternally({
        fromUserId: userId,
        subject: email.subject,
        bodyHtml: email.bodyHtml ?? undefined,
        bodyPlain: email.bodyPlain ?? undefined,
        toAddresses: asArray(email.toAddresses),
        ccAddresses: asArray(email.ccAddresses),
        bccAddresses: asArray(email.bccAddresses),
        threadId: email.threadId ?? undefined,
        inReplyTo: email.inReplyTo ?? undefined,
      });
    } catch {
      /* internal delivery failure must not fail the send */
    }

    try {
      notifier.notifyNewEmail(asArray(email.toAddresses), userId, email.subject, email.id);
    } catch {
      /* ignore */
    }

    // External delivery via SES: for recipients outside @quantmail.in, send
    // directly through Amazon SES. The BullMQ outbound worker handles this in
    // production (DKIM+SMTP), but when Redis/queue isn't available (sandbox,
    // early deploy) this direct SES path ensures emails actually leave.
    try {
      const { sendViaSes, isSesConfigured } = await import('../lib/ses-sender');
      if (isSesConfigured()) {
        const allRecipients = [
          ...asArray(email.toAddresses),
          ...asArray(email.ccAddresses),
          ...asArray(email.bccAddresses),
        ];
        const externalRecipients = allRecipients.filter(
          (addr: string) => !addr.endsWith('@quantmail.in') && !addr.endsWith('@quantchat.online'),
        );
        if (externalRecipients.length > 0) {
          const sender = await prisma.user.findUnique({
            where: { id: userId },
            select: { displayName: true, email: true },
          });
          const fromAddr = sender?.displayName
            ? `${sender.displayName} <${sender.email}>`
            : (sender?.email ?? `noreply@quantmail.in`);
          await sendViaSes({
            from: fromAddr,
            to: externalRecipients,
            subject: email.subject ?? '(no subject)',
            bodyHtml: email.bodyHtml ?? undefined,
            bodyText: email.bodyPlain ?? email.bodyText ?? undefined,
          });
          request.log.info({ to: externalRecipients }, 'external email sent via SES');
        }
      }
    } catch (sesErr) {
      // SES send failure should not fail the response (graceful degradation).
      request.log.warn({ err: sesErr }, 'SES external delivery failed (sandbox or config issue)');
    }

    return reply.send({ success: true, data: { message: 'Email sent', emailId: email.id } });
  });

  // POST /emails/:id/archive - move to the owner's archive folder without trashing it.
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    if (email.isTrash || email.deletedAt) {
      throw createAppError('Restore the email before archiving it', 409, 'EMAIL_IN_TRASH');
    }

    const archiveFolder = await prisma.emailFolder.upsert({
      where: { userId_name: { userId, name: 'Archive' } },
      update: { type: 'ARCHIVE' },
      create: { userId, name: 'Archive', type: 'ARCHIVE' },
    });
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
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
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
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
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
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
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

  // POST /emails/:id/unread - mark as unread.
  fastify.post<{ Params: { id: string } }>('/:id/unread', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    await prisma.email.update({ where: { id: request.params.id }, data: { isRead: false } });
    return reply.send({ success: true, data: { message: 'Marked as unread' } });
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

    const prisma = (fastify as unknown as { prisma: any }).prisma;
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
    } else {
      // Default inbox: received, recoverable, non-archived mail whose snooze has elapsed.
      where.isDraft = false;
      where.isSent = false;
      where.isSpam = false;
      where.isTrash = false;
      where.AND = [
        { OR: [{ folderId: null }, { folder: { is: { type: 'INBOX' } } }] },
        {
          OR: [
            { threadId: null },
            { thread: { is: { snoozedUntil: null } } },
            { thread: { is: { snoozedUntil: { lte: new Date() } } } },
          ],
        },
      ];
    }

    const [data, total, unreadCount] = await Promise.all([
      prisma.email.findMany({ where, skip, take: pageSize, orderBy: { receivedAt: 'desc' } }),
      prisma.email.count({ where }),
      prisma.email.count({ where: { ...where, isRead: false } }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Augment each email with a category (used by inbox tabs) and return a
    // shape that satisfies both consumers: useInbox reads response.data (the
    // array), useEmail reads response.emails.
    const items = data.map((e: any) => ({ ...e, category: e.aiCategory || 'primary' }));
    return reply.send({
      success: true,
      data: items,
      emails: items,
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

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);

    const result = await service.search(userId, queryResult.data.q, {
      page: queryResult.data.page,
      pageSize: queryResult.data.pageSize,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /emails/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.getEmail(request.params.id, userId);

    return reply.send({ success: true, data: email });
  });

  // DELETE /emails/:id - first call moves to trash; a second call from trash
  // records a logical permanent deletion without erasing history.
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');

    if (email.isTrash) {
      const deleted = await prisma.email.update({
        where: { id: request.params.id },
        data: { deletedAt: new Date() },
      });
      return reply.send({ success: true, data: deleted });
    }

    const trashFolder = await prisma.emailFolder.upsert({
      where: { userId_name: { userId, name: 'Trash' } },
      update: { type: 'TRASH' },
      create: { userId, name: 'Trash', type: 'TRASH' },
    });
    const trashed = await prisma.email.update({
      where: { id: request.params.id },
      data: { folderId: trashFolder.id, isTrash: true, deletedAt: null },
    });
    return reply.send({ success: true, data: trashed });
  });

  // POST /emails/:id/read
  fastify.post<{ Params: { id: string } }>('/:id/read', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.markRead(request.params.id, userId);

    return reply.send({ success: true, data: email });
  });

  // POST /emails/:id/star
  fastify.post<{ Params: { id: string } }>('/:id/star', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.markStarred(request.params.id, userId);

    return reply.send({ success: true, data: email });
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

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.moveToFolder(request.params.id, parseResult.data.folderId, userId);

    return reply.send({ success: true, data: email });
  });
}
