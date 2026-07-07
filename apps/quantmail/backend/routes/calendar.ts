// ============================================================================
// QuantMail — Calendar routes (/events, /calendars) for the Calendar page.
// The page called /events and /calendars which did not exist ("Failed to load
// events"). Backed by the Event + Calendar Prisma models. Enveloped responses
// ({ success, data }) to match the api-client. Global auth hook → req.auth.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';

function getPrisma(fastify: FastifyInstance): any {
  return (fastify as unknown as { prisma: unknown }).prisma;
}
function requireUserId(request: unknown): string {
  const userId = (request as { auth?: { userId?: string } }).auth?.userId;
  if (!userId) throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
}

const eventCreateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  start: z.string(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(500).optional(),
  calendarId: z.string().optional(),
});

type EventRow = {
  id: string;
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  allDay: boolean;
  location: string;
  status: string;
};

function toEventDto(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    start: e.startTime,
    end: e.endTime,
    startTime: e.startTime,
    endTime: e.endTime,
    allDay: e.allDay,
    location: e.location,
    status: e.status,
  };
}

export default async function calendarRoutes(fastify: FastifyInstance) {
  // GET /calendars — the user's calendars (auto-provision a primary one).
  fastify.get('/calendars', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    let calendars = await prisma.calendar.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    if (!calendars || calendars.length === 0) {
      const primary = await prisma.calendar.create({
        data: { userId, name: 'My Calendar', color: '#4F46E5', isPrimary: true },
      });
      calendars = [primary];
    }
    return reply.send({ success: true, data: calendars });
  });

  // GET /events — events for the signed-in user, optional [start,end] window.
  fastify.get<{ Querystring: { start?: string; end?: string; calendarId?: string } }>(
    '/events',
    async (request, reply) => {
      const userId = requireUserId(request);
      const prisma = getPrisma(fastify);
      const where: Record<string, unknown> = { userId };
      const { start, end } = request.query;
      if (start || end) {
        where.startTime = {
          ...(start ? { gte: new Date(start) } : {}),
          ...(end ? { lte: new Date(end) } : {}),
        };
      }
      const rows = (await prisma.event.findMany({
        where,
        orderBy: { startTime: 'asc' },
        take: 1000,
      })) as EventRow[];
      return reply.send({ success: true, data: rows.map(toEventDto) });
    },
  );

  // POST /events — create an event.
  fastify.post('/events', async (request, reply) => {
    const parsed = eventCreateSchema.safeParse(request.body);
    if (!parsed.success) throw parsed.error;
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const now = new Date();
    const start = new Date(parsed.data.start);
    const end = parsed.data.end ? new Date(parsed.data.end) : new Date(start.getTime() + 3600_000);
    const created = (await prisma.event.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description ?? '',
        startTime: start,
        endTime: end,
        allDay: parsed.data.allDay ?? false,
        location: parsed.data.location ?? '',
        userId,
        status: 'confirmed',
        createdAt: now,
        updatedAt: now,
      },
    })) as EventRow;
    return reply.status(201).send({ success: true, data: toEventDto(created) });
  });

  // DELETE /events/:id — remove an event (owner only).
  fastify.delete<{ Params: { id: string } }>('/events/:id', async (request, reply) => {
    const userId = requireUserId(request);
    const prisma = getPrisma(fastify);
    const ev = await prisma.event.findUnique({ where: { id: request.params.id } });
    if (!ev || ev.userId !== userId)
      throw createAppError('Event not found', 404, 'EVENT_NOT_FOUND');
    await prisma.event.delete({ where: { id: request.params.id } });
    return reply.send({ success: true, data: { message: 'Event deleted' } });
  });
}
