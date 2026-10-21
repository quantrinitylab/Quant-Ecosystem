// @vitest-environment node
// ============================================================================
// fix/qm-booking-link-host-controls: hosts can pause/resume a booking link.
//
// Before this fix the host had no way to deactivate a link: BookingLinksModal
// only POSTed new links (isActive hardcoded true at creation) and the backend
// exposed no PATCH/PUT on booking links. The public booking page already
// renders an honest "inactive" dead-link state for isActive=false links — but
// the host could never reach that state from the product UI.
//
// These tests pin:
//   1. PATCH /booking/links/:id toggles isActive (true -> false -> true).
//   2. A host cannot toggle another host's link (404, not 403 — no oracle).
//   3. Unknown ids 404.
//   4. Non-boolean isActive bodies 400 (never a silent partial write).
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { errorHandlerPlugin, isAppError } from '@quant/server-core';
import calendarRoutes from '../routes/calendar';
import { BookingLinkService } from '../services/booking-link.service';

function createInMemoryPrisma() {
  const bookingLinks = new Map<string, any>();

  const seedLink = {
    id: 'clx-booking-server-1',
    userId: 'host-user-1',
    slug: 'strategy-session',
    title: 'Strategy Session',
    description: 'Pick a time',
    duration: 30,
    availableDays: JSON.stringify([1, 2, 3, 4, 5]),
    startHour: 9,
    endHour: 17,
    timezone: 'UTC',
    isActive: true,
    createdAt: new Date('2026-10-11T10:00:00.000Z'),
    updatedAt: new Date('2026-10-11T10:00:00.000Z'),
  };
  bookingLinks.set(seedLink.id, { ...seedLink });

  const otherHostLink = {
    ...seedLink,
    id: 'clx-booking-server-2',
    userId: 'host-user-2',
    slug: 'other-host-slug',
  };
  bookingLinks.set(otherHostLink.id, { ...otherHostLink });

  return {
    bookingLink: {
      create: vi.fn(async ({ data }: { data: any }) => {
        const id = data.id || `blink-${Date.now()}`;
        const record = { ...data, id };
        bookingLinks.set(id, record);
        return record;
      }),
      findUnique: vi.fn(async ({ where }: { where: { slug?: string; id?: string } }) => {
        if (where.slug) return bookingLinks.get(where.slug) || null;
        if (where.id) return bookingLinks.get(where.id) || null;
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where?: { userId?: string } } = {}) => {
        const values = Array.from(bookingLinks.values());
        if (where?.userId) return values.filter((l) => l.userId === where.userId);
        return values;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
        const existing = bookingLinks.get(where.id);
        if (!existing) throw Object.assign(new Error('No record found'), { code: 'P2025' });
        const record = { ...existing, ...data };
        bookingLinks.set(where.id, record);
        return record;
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const item = bookingLinks.get(where.id);
        bookingLinks.delete(where.id);
        return item;
      }),
    },
  };
}

describe('booking-link-patch: host pause/resume (PATCH /booking/links/:id)', () => {
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

  describe('service: updateBookingLink', () => {
    it('toggles isActive true -> false and returns the updated record', async () => {
      const updated = await service.updateBookingLink('clx-booking-server-1', 'host-user-1', {
        isActive: false,
      });
      expect(updated.id).toBe('clx-booking-server-1');
      expect(updated.isActive).toBe(false);

      const again = await service.updateBookingLink('clx-booking-server-1', 'host-user-1', {
        isActive: true,
      });
      expect(again.isActive).toBe(true);
    });

    it('writes through to the store so later reads see the paused state', async () => {
      await service.updateBookingLink('clx-booking-server-1', 'host-user-1', { isActive: false });
      const row = await prisma.bookingLink.findUnique({ where: { id: 'clx-booking-server-1' } });
      expect(row.isActive).toBe(false);
    });

    it('404s on an unknown id (never a silent no-op)', async () => {
      const err = await service
        .updateBookingLink('does-not-exist', 'host-user-1', { isActive: false })
        .catch((e) => e);
      expect(isAppError(err)).toBe(true);
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('BOOKING_LINK_NOT_FOUND');
    });

    it('404s when the link belongs to another host (cross-user toggle is impossible)', async () => {
      const err = await service
        .updateBookingLink('clx-booking-server-2', 'host-user-1', { isActive: false })
        .catch((e) => e);
      expect(isAppError(err)).toBe(true);
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('BOOKING_LINK_NOT_FOUND');
    });
  });

  describe('route: PATCH /booking/links/:id', () => {
    it('pauses the link (200, isActive false in the response)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/booking/links/clx-booking-server-1',
        payload: { isActive: false },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.isActive).toBe(false);
    });

    it('re-activates the link (200, isActive true)', async () => {
      await app.inject({
        method: 'PATCH',
        url: '/booking/links/clx-booking-server-1',
        payload: { isActive: false },
      });
      const res = await app.inject({
        method: 'PATCH',
        url: '/booking/links/clx-booking-server-1',
        payload: { isActive: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.isActive).toBe(true);
    });

    it('400s on a non-boolean isActive (never a partial write)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/booking/links/clx-booking-server-1',
        payload: { isActive: 'no' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().success).toBe(false);
      // State untouched by the invalid body.
      const row = await prisma.bookingLink.findUnique({ where: { id: 'clx-booking-server-1' } });
      expect(row.isActive).toBe(true);
    });

    it('404s on an unknown id', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/booking/links/does-not-exist',
        payload: { isActive: false },
      });
      expect(res.statusCode).toBe(404);
    });

    it('404s when the link belongs to another host', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/booking/links/clx-booking-server-2',
        payload: { isActive: false },
      });
      expect(res.statusCode).toBe(404);
      // The other host's link is untouched.
      const row = await prisma.bookingLink.findUnique({ where: { id: 'clx-booking-server-2' } });
      expect(row.isActive).toBe(true);
    });
  });
});
