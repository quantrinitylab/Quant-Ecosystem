// @vitest-environment node
// ============================================================================
// fix/qm-booking-slug-409: duplicate booking slug must 409, never 500.
//
// BookingLink.slug is globally @unique (not per-user). Two hosts racing on
// the same slug (or a host reusing someone else's slug) hits Prisma P2002.
// The service must map that to an honest 409 BOOKING_LINK_SLUG_TAKEN so the
// modal can tell the host to pick another slug — before this fix the
// unmapped P2002 escaped as a raw 500 and the modal kept a permanently
// unsyncable local copy with a misleading "saved on this device only" toast.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin, isAppError } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import { BookingLinkService } from '../services/booking-link.service';

function createInMemoryPrisma() {
  const bookingLinks = new Map<string, any>();
  const events = new Map<string, any>();
  const users = new Map<string, any>();

  users.set('host-user-1', {
    id: 'host-user-1',
    email: 'alex.host@quantmail.in',
    displayName: 'Alex Host',
  });

  return {
    bookingLink: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const id = data.id || `blink-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const record = { ...data, id };
        bookingLinks.set(id, record);
        bookingLinks.set(data.slug, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return bookingLinks.get(where.slug) || null;
        if (where.id) return bookingLinks.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { userId?: string } } = {}) => {
        const unique = Array.from(new Set(bookingLinks.values()));
        if (where?.userId) return unique.filter((l) => l.userId === where.userId);
        return unique;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const item = bookingLinks.get(where.id);
        if (item) {
          bookingLinks.delete(where.id);
          bookingLinks.delete(item.slug);
        }
        return item;
      }),
    },
  };
}

const p2002 = () => Object.assign(new Error('Unique constraint failed on the fields: (`slug`)'), { code: 'P2002' });

describe('booking-slug-409: duplicate booking slug maps to 409 BOOKING_LINK_SLUG_TAKEN', () => {
  let prisma: ReturnType<typeof createInMemoryPrisma>;
  let service: BookingLinkService;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    BookingLinkService.clearLocks();
    prisma = createInMemoryPrisma();
    service = new BookingLinkService(prisma as any);

    app = Fastify();
    await app.register(errorHandlerPlugin);
    app.decorate('prisma', prisma as never);
    app.addHook('onRequest', async (request: any) => {
      (request as unknown as { auth: { userId: string } }).auth = { userId: 'host-user-1' };
    });
    await app.register(calendarRoutes);
    await app.ready();
  });

  afterEach(async () => {
    BookingLinkService.clearLocks();
    await app.close();
  });

  describe('service: createBookingLink', () => {
    it('throws a 409 BOOKING_LINK_SLUG_TAKEN AppError on Prisma P2002, never a raw 500', async () => {
      prisma.bookingLink.create.mockRejectedValueOnce(p2002());

      const err = await service
        .createBookingLink({
          userId: 'host-user-1',
          slug: 'strategy-session',
          title: 'Strategy Session',
          duration: 30,
        })
        .catch((e) => e);

      expect(isAppError(err)).toBe(true);
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('BOOKING_LINK_SLUG_TAKEN');
      expect(err.message).toContain('already taken');
    });

    it('propagates non-P2002 failures unchanged (no swallowing)', async () => {
      const boom = new Error('database is on fire');
      prisma.bookingLink.create.mockRejectedValueOnce(boom);

      await expect(
        service.createBookingLink({
          userId: 'host-user-1',
          slug: 'other-slug',
          title: 'Other',
          duration: 30,
        }),
      ).rejects.toBe(boom);
    });

    it('still creates the link on the happy path', async () => {
      const link = await service.createBookingLink({
        userId: 'host-user-1',
        slug: 'fresh-slug',
        title: 'Fresh',
        duration: 30,
      });
      expect(link.slug).toBe('fresh-slug');
      expect(link.title).toBe('Fresh');
    });
  });

  describe('route: POST /calendar/booking/links', () => {
    it('answers 409 with the honest error code when the slug is taken', async () => {
      prisma.bookingLink.create.mockRejectedValueOnce(p2002());

      const res = await app.inject({
        method: 'POST',
        url: '/calendar/booking/links',
        payload: {
          slug: 'strategy-session',
          title: 'Strategy Session',
          duration: 30,
          availableDays: [1, 2, 3, 4, 5],
          startHour: 9,
          endHour: 17,
        },
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('BOOKING_LINK_SLUG_TAKEN');
      expect(body.error.message).toContain('already taken');
      expect(body.error.statusCode).toBe(409);
    });

    it('answers 201 on the happy path (no behavior change)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/calendar/booking/links',
        payload: {
          slug: 'brand-new-slug',
          title: 'Brand New',
          duration: 30,
          availableDays: [1, 2, 3, 4, 5],
          startHour: 9,
          endHour: 17,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(body.data.slug).toBe('brand-new-slug');
    });

    it('answers 409 on the /booking/links alias too (same handler)', async () => {
      prisma.bookingLink.create.mockRejectedValueOnce(p2002());

      const res = await app.inject({
        method: 'POST',
        url: '/booking/links',
        payload: {
          slug: 'strategy-session',
          title: 'Strategy Session',
          duration: 30,
          availableDays: [1, 2, 3, 4, 5],
          startHour: 9,
          endHour: 17,
        },
      });

      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.body).error.code).toBe('BOOKING_LINK_SLUG_TAKEN');
    });
  });
});
