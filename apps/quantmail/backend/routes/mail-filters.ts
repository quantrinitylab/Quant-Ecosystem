import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import { MailFilterService, validateForwardRecipient } from '../services/mail-filter.service';

const conditionSchema = z.object({
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  subjectContains: z.string().min(1).optional(),
  bodyContains: z.string().min(1).optional(),
  hasAttachment: z.boolean().optional(),
  domain: z.string().min(1).optional(),
});

const actionSchema = z.object({
  addLabelId: z.string().min(1).optional(),
  moveToFolderId: z.string().min(1).optional(),
  markRead: z.boolean().optional(),
  star: z.boolean().optional(),
  archive: z.boolean().optional(),
  markSpam: z.boolean().optional(),
  forwardTo: z.string().email().optional(),
  delete: z.boolean().optional(),
});

const createFilterSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  matchAll: z.boolean().optional(),
  conditions: z.array(conditionSchema).min(1),
  actions: z.array(actionSchema).min(1),
});

const updateFilterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  matchAll: z.boolean().optional(),
  conditions: z.array(conditionSchema).min(1).optional(),
  actions: z.array(actionSchema).min(1).optional(),
});

const testEmailSchema = z.object({
  fromAddress: z.string(),
  toAddresses: z.array(z.string()).optional(),
  subject: z.string().optional(),
  bodyPlain: z.string().nullable().optional(),
  bodyHtml: z.string().nullable().optional(),
  hasAttachments: z.boolean().optional(),
});

async function verifyForwardActions(
  actions: Array<{ forwardTo?: string }> | undefined,
  prisma: any,
  userId: string,
) {
  if (!actions || actions.length === 0) return;
  const forwardActions = actions.filter((a) => Boolean(a.forwardTo));
  if (forwardActions.length === 0) return;

  let userEmail: string | undefined;
  if (prisma?.user?.findUnique) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    userEmail = user?.email;
  }

  for (const action of forwardActions) {
    if (action.forwardTo) {
      validateForwardRecipient(action.forwardTo, userEmail);
    }
  }
}

export default async function mailFiltersRoutes(fastify: FastifyInstance) {
  /**
   * Conditional step-up guard for mail-filter writes.
   *
   * Gmail forces a 2-Step Verification challenge when you create/edit a filter
   * with a forwarding action (or add a forwarding address / enable IMAP): a
   * hijacked session must not silently set up mail exfiltration.
   *
   * The stock `fastify.requireStepUp()` is unconditional per route, so this
   * wrapper delegates to it only when the request body actually carries a
   * forwarding action (`actions[].forwardTo`). Otherwise plain session auth
   * applies — creating a label-only filter does not demand a fresh sign-in.
   *
   * The detection is structural and mirrors the zod action schema, so any
   * forward the handler would accept is caught here first (a malformed body
   * can never create a filter — the handler's schema parse rejects it).
   */
  const requireStepUpForForwarding = (() => {
    const stepUp = fastify.requireStepUp();
    const auth = fastify.requireAuth();
    return async function (request: FastifyRequest, reply: FastifyReply) {
      const actions = (request.body as { actions?: unknown } | undefined)?.actions;
      const hasForwardAction =
        Array.isArray(actions) &&
        actions.some(
          (action) =>
            typeof action === 'object' &&
            action !== null &&
            Boolean((action as { forwardTo?: unknown }).forwardTo),
        );
      if (hasForwardAction) {
        await stepUp(request, reply);
        return;
      }
      await auth(request, reply);
    };
  })();

  // POST /mail-filters — rate-limited: filter writes (esp. with a forwarding
  // action) are an exfiltration vector, so they get a tighter per-user budget
  // than the global 1000/min default (CodeQL js/missing-rate-limiting).
  fastify.post(
    '/',
    {
      preHandler: requireStepUpForForwarding,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
    const parseResult = createFilterSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    await verifyForwardActions(parseResult.data.actions, prisma, userId);

    const service = new MailFilterService(prisma as never);
    const filter = await service.createFilter({ userId, ...parseResult.data });

    return reply.status(201).send({ success: true, data: filter });
  });

  // GET /mail-filters
  fastify.get('/', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MailFilterService(prisma as never);
    const filters = await service.listFilters(userId);

    return reply.send({ success: true, data: filters });
  });

  // GET /mail-filters/:id
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MailFilterService(prisma as never);
    const filter = await service.getFilter(request.params.id, userId);

    return reply.send({ success: true, data: filter });
  });

  // PUT /mail-filters/:id — same rate limit as create (see above).
  fastify.put<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: requireStepUpForForwarding,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
    const parseResult = updateFilterSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    await verifyForwardActions(parseResult.data.actions, prisma, userId);

    const service = new MailFilterService(prisma as never);
    const filter = await service.updateFilter(request.params.id, userId, parseResult.data);

    return reply.send({ success: true, data: filter });
  });

  // DELETE /mail-filters/:id
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MailFilterService(prisma as never);
    const filter = await service.deleteFilter(request.params.id, userId);

    return reply.send({ success: true, data: filter });
  });

  // POST /mail-filters/:id/test
  fastify.post<{ Params: { id: string } }>('/:id/test', async (request, reply) => {
    const parseResult = testEmailSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }

    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MailFilterService(prisma as never);
    const filter = await service.getFilter(request.params.id, userId);

    const sample = parseResult.data;
    const matches = service.evaluate(filter, {
      fromAddress: sample.fromAddress,
      toAddresses: sample.toAddresses ?? [],
      subject: sample.subject ?? '',
      bodyPlain: sample.bodyPlain ?? null,
      bodyHtml: sample.bodyHtml ?? null,
      hasAttachments: sample.hasAttachments ?? false,
    });

    return reply.send({ success: true, data: { matches } });
  });

  // POST /mail-filters/:id/apply
  // Evaluates filter against existing messages and applies actions.
  fastify.post<{ Params: { id: string } }>('/:id/apply', async (request, reply) => {
    const userId = (request as unknown as { auth: { userId: string } }).auth?.userId;
    if (!userId) {
      throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const prisma = (fastify as unknown as { prisma: unknown }).prisma;
    const service = new MailFilterService(prisma as never);
    const result = await service.applyFilterToMessages(request.params.id, userId);

    return reply.send({ success: true, data: result });
  });
}
