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
//
// Reply-aware lifecycle (fix/qm-followup-auto-dismiss-2): an inbound message
// in a thread with an active reminder auto-dismisses it (dismiss-on-reply in
// InboundIngestAdapter) — a thread that got a reply never resurfaces. GET
// additionally skips rows whose thread got an inbound reply after the
// reminder was set, covering rows that predate the ingest hook and rows
// written by importers that bypass ingest.

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
    email: {
      findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    };
  };
}

/**
 * Delivery-time reply guard (fix/qm-followup-auto-dismiss-2).
 *
 * An ACTIVE reminder whose thread received an inbound reply (isSent: false)
 * AFTER the reminder was set is treated as resolved: it is skipped from the
 * response and opportunistically dismissed so it never resurfaces in the
 * People-home "Due reminders" strip or the thread banner. This covers rows
 * that predate dismiss-on-reply in the ingest path and rows written by
 * importers that bypass ingest (imap-importer, mbox-parser).
 *
 * Fail-open: a lookup fault keeps the row (a stale nudge is better than a
 * silently dropped reminder the user explicitly set).
 */
async function hasInboundReplyAfterSet(
  prisma: {
    email: { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> };
  },
  userId: string,
  row: Record<string, unknown>,
): Promise<boolean> {
  const createdAtRaw = row['createdAt'];
  const createdAt =
    createdAtRaw instanceof Date ? createdAtRaw : new Date(createdAtRaw as string);
  if (Number.isNaN(createdAt.getTime())) return false;

  const replyWhere = { userId, isSent: false, receivedAt: { gt: createdAt } };

  const threadId = row['threadId'];
  if (typeof threadId === 'string' && threadId.length > 0) {
    const hit = await prisma.email.findFirst({ where: { ...replyWhere, threadId } });
    return hit !== null;
  }

  // Legacy threadId-null row: resolve the sent email's thread first.
  const sent = await prisma.email.findFirst({
    where: { userId, id: row['emailId'] as string },
  });
  const sentThreadId = sent?.['threadId'];
  if (typeof sentThreadId !== 'string' || sentThreadId.length === 0) return false;
  const hit = await prisma.email.findFirst({
    where: { ...replyWhere, threadId: sentThreadId },
  });
  return hit !== null;
}

async function filterOutRepliedReminders(
  prisma: {
    followUpReminder: {
      update: (args: unknown) => Promise<Record<string, unknown>>;
    };
    email: { findFirst: (args: unknown) => Promise<Record<string, unknown> | null> };
  },
  userId: string,
  rows: Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const kept: Record<string, unknown>[] = [];
  for (const row of rows) {
    let replied = false;
    try {
      replied = await hasInboundReplyAfterSet(prisma, userId, row);
    } catch {
      replied = false; // fail-open: keep the row
    }
    if (!replied) {
      kept.push(row);
      continue;
    }
    // Opportunistic dismiss: best-effort, never blocks the response.
    try {
      await prisma.followUpReminder.update({
        where: { id: row['id'] as string },
        data: { dismissedAt: new Date() },
      });
    } catch {
      // The row is still skipped this time; the next GET retries the dismiss.
    }
  }
  return kept;
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
  // Delivery-time reply guard: rows whose thread got an inbound reply after
  // the reminder was set are treated as resolved (skipped + opportunistically
  // dismissed), so the People-home strip never nudges about a replied thread.
  fastify.get('/', async (request, reply) => {
    const userId = getUserId(request);
    const prisma = getPrisma(fastify);

    const rows = await prisma.followUpReminder.findMany({
      where: { userId, dismissedAt: null },
      orderBy: { remindAt: 'asc' },
    });
    const live = await filterOutRepliedReminders(prisma, userId, rows);
    return reply.send({ success: true, data: live.map(toWire) });
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
