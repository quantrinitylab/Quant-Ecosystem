import { describe, it, expect } from 'vitest';
import fastify from 'fastify';
import wellKnownRoutes from '../routes/well-known';

async function buildTestApp(userId?: string) {
  const app = fastify();
  try {
    app.addHttpMethod('PROPFIND', { hasBody: true });
  } catch {}
  app.addHook('preHandler', async (req) => {
    if (userId) {
      (req as unknown as { auth?: { userId?: string } }).auth = { userId };
    }
  });
  await app.register(wellKnownRoutes);
  await app.ready();
  return app;
}

describe('Task W33-07: RFC 6764 WebDAV Auto-Discovery & SRV DNS Discovery', () => {
  describe('CalDAV Auto-Discovery (RFC 6764 Section 5)', () => {
    it('GET /.well-known/caldav returns 308 Permanent Redirect to /dav/calendars for unauthenticated clients', async () => {
      const app = await buildTestApp(undefined);
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/caldav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/calendars');
      expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');
    });

    it('GET /.well-known/caldav returns 308 Permanent Redirect to user-specific calendar home for authenticated clients', async () => {
      const app = await buildTestApp('bob');
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/caldav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/calendars/bob');
    });

    it('PROPFIND /.well-known/caldav also responds with 308 Permanent Redirect for macOS/iOS clients', async () => {
      const app = await buildTestApp('bob');
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/.well-known/caldav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/calendars/bob');
    });
  });

  describe('CardDAV Auto-Discovery (RFC 6764 Section 6)', () => {
    it('GET /.well-known/carddav returns 308 Permanent Redirect to /dav/addressbooks for unauthenticated clients', async () => {
      const app = await buildTestApp(undefined);
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/carddav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/addressbooks');
      expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');
    });

    it('GET /.well-known/carddav returns 308 Permanent Redirect to user-specific address book home for authenticated clients', async () => {
      const app = await buildTestApp('charlie');
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/carddav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/addressbooks/charlie');
    });

    it('PROPFIND /.well-known/carddav also responds with 308 Permanent Redirect for macOS/iOS clients', async () => {
      const app = await buildTestApp('charlie');
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/.well-known/carddav',
      });

      expect(res.statusCode).toBe(308);
      expect(res.headers['location']).toBe('/dav/addressbooks/charlie');
    });
  });
});
