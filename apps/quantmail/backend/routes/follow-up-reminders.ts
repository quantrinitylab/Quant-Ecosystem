// ============================================================================
// follow-up-reminders — server-backed follow-up reminders (fix/qm-followup-reminders)
// ============================================================================
// The EmailFollowUpReminder component used to flip local state and show a
// toast — the reminder died on reload and nothing ever resurfaced. These
// routes persist the reminder per user:
//
//   POST   /follow-up-reminders   — set (or move) a reminder
//   GET    /follow-up-reminders   — list the caller's active reminders
//   DELETE /follow-up-reminders/:id — dismiss one
//
// A reminder is ACTIVE while dismissedAt is NULL. "Due" (remindAt <= now) is
// computed by the caller — the People home resurfaces due rows at the top of
// the conversation list, Superhuman/Gmail-nudge style — so the backend never
// has to mutate on read. One active reminder per (user, thread): POST upserts
// on the existing active row instead of stacking duplicates.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

const setReminderSchema = z.object({
  emailId: z.string().min(1).max(200),
  threadId: z.string().min(1).max(200).optional(),
  subject: z.string().min(1).max(500).optional(),
  remindAt: z.string().min(1).max(100),
});

function getUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getPrisma(fastify: FastifyInstance) {
  const prisma = (fastify as unknown as { prisma: unknown }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return prisma as {
    followUpReminder: {
      findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
      findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
      create: (args: unknown) => Promise<Record<string, unknown>>;
      update: (args: unknown) => Promise<Record<string, unknown>>;
    };
  };
}

function toWire(row: Record<string, unknown>) {
  return {
    id: row['id'],
    emailId: row['emailId'],
    threadId: row['threadId'],
    subject: row['subject'],
    remindAt: row['remindAt'] instanceof Date ? (row['remindAt'] as Date).toISOString() : row['remindAt'],
    createdAt:
      row['createdAt'] instanceof Date ? (row['createdAt'] as Date).toISOString() : row['createdAt'],
  };
}

export default async function followUpReminderRoutes(fastify: FastifyInstance) {
  // POST /follow-up-reminders — set (or move) a reminder.
  fastify.post('/', async (request, reply) => {
    const parseResult = setReminderSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const remindAt = new Date(parseResult.data.remindAt);
    if (Number.isNaN(remindAt.getTime())) {
      throw createAppError('remindAt must be a valid ISO date', 400, 'INVALID_REMIND_AT');
    }
    if (remindAt.getTime() <= Date.now()) {
      throw createAppError('remindAt must be in the future', 400, 'REMIND_AT_IN_PAST');
    }

    // One active reminder per (user, thread): an existing active row for the
    // same thread gets moved instead of duplicating. threadId is nullable, so
    // rows without one match on the email id.
    const existing = await prisma.followUpReminder.findFirst({
      where: {
        userId,
        dismissedAt: null,
        ...(parseResult.data.threadId
          ? { threadId: parseResult.data.threadId }
          : { emailId: parseResult.data.emailId, threadId: null }),
      },
    });

    if (existing) {
      const updated = await prisma.followUpReminder.update({
        where: { id: existing['id'] as string },
        data: {
          remindAt,
          ...(parseResult.data.subject !== undefined ? { subject: parseResult.data.subject } : {}),
        },
      });
      return reply.send({ success: true, data: toWire(updated) });
    }

    const created = await prisma.followUpReminder.create({
      data: {
        userId,
        emailId: parseResult.data.emailId,
        threadId: parseResult.data.threadId ?? null,
        subject: parseResult.data.subject ?? null,
        remindAt,
      },
    });
    return reply.status(201).send({ success: true, data: toWire(created) });
  });

  // GET /follow-up-reminders — the caller's active reminders, soonest first.
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const rows = await prisma.followUpReminder.findMany({
      where: { userId, dismissedAt: null },
      orderBy: { remindAt: 'asc' },
    });
    return reply.send({ success: true, data: rows.map(toWire) });
  });

  // DELETE /follow-up-reminders/:id — dismiss (tenant-walled, 404 when not owned).
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const existing = await prisma.followUpReminder.findFirst({
      where: { id: request.params.id, userId, dismissedAt: null },
    });
    if (!existing) {
      throw createAppError('Reminder not found', 404, 'REMINDER_NOT_FOUND');
    }

    await prisma.followUpReminder.update({
      where: { id: request.params.id },
      data: { dismissedAt: new Date() },
    });
    return reply.send({ success: true, data: { message: 'Reminder dismissed' } });
  });
}
