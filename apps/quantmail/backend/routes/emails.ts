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

  // POST /emails/:id/send - send a draft + deliver to QuantMail recipients.
  fastify.post<{ Params: { id: string } }>('/:id/send', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');

    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const service = new EmailService(prisma as never);

    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');

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

    return reply.send({ success: true, data: { message: 'Email sent', emailId: email.id } });
  });

  // POST /emails/:id/archive - remove from the inbox view (soft archive).
  fastify.post<{ Params: { id: string } }>('/:id/archive', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    const prisma = (fastify as unknown as { prisma: any }).prisma;
    const email = await prisma.email.findUnique({ where: { id: request.params.id } });
    if (!email) throw createAppError('Email not found', 404, 'EMAIL_NOT_FOUND');
    if (email.userId !== userId) throw createAppError('Not authorized', 403, 'FORBIDDEN');
    await prisma.email.update({ where: { id: request.params.id }, data: { isTrash: true } });
    return reply.send({ success: true, data: { message: 'Email archived' } });
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
    if (q.folderId) {
      where.folderId = q.folderId;
    } else {
      // Default inbox view: received mail only — exclude the user's own sent
      // copies, drafts, and archived/trashed messages.
      where.isDraft = false;
      where.isSent = false;
      where.isTrash = false;
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

  // DELETE /emails/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new EmailService(prisma as never);
    const email = await service.delete(request.params.id, userId);

    return reply.send({ success: true, data: email });
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
