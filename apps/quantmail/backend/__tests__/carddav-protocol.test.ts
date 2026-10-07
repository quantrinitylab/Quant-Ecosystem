import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fastify from 'fastify';
import davRoutes, { __setCardDavService } from '../routes/dav';
import {
  CardDavService,
  generateVCard4,
  parseVCard4,
  serializeCardDavMultiStatus,
} from '../services/carddav.service';

const SAMPLE_VCARD4 =
  [
    'BEGIN:VCARD',
    'VERSION:4.0',
    'PRODID:-//Test//CardDAV Test//EN',
    'UID:urn:uuid:contact-uuid-1234',
    'FN:Ada Lovelace',
    'N:Lovelace;Ada;;;',
    'EMAIL;TYPE=work:ada@computing.org',
    'TEL;TYPE=cell:+1-555-0199',
    'ORG:Analytical Engines Inc.',
    'TITLE:Chief Mathematician',
    'NOTE:Pioneer of scientific computing',
    'END:VCARD',
  ].join('\r\n') + '\r\n';

async function buildTestApp(userId?: string) {
  const app = fastify();
  for (const m of ['PROPFIND', 'REPORT', 'MKCALENDAR']) {
    try {
      app.addHttpMethod(m, { hasBody: true });
    } catch {}
  }
  if (userId) {
    app.addHook('preHandler', async (req) => {
      (req as unknown as { auth?: { userId?: string } }).auth = { userId };
    });
  }
  await app.register(davRoutes, { prefix: '/dav' });
  await app.ready();
  return app;
}

describe('Task W33-06: Fastify CardDAV RFC 6350 Route Mounting & vCard 4.0 Address Book Sync', () => {
  let cardDavService: CardDavService;

  beforeEach(() => {
    cardDavService = new CardDavService();
    __setCardDavService(cardDavService);
  });

  afterEach(() => {
    cardDavService.clearStore();
    __setCardDavService(undefined);
  });

  describe('vCard 4.0 Generator and Parser (RFC 6350)', () => {
    it('generates authentic vCard 4.0 with required VERSION:4.0, FN, N, and REV', () => {
      const vcard = generateVCard4({
        id: 'user-001',
        fn: 'Grace Hopper',
        family: 'Hopper',
        given: 'Grace',
        email: 'grace@navy.mil',
        phone: '+1-555-0100',
        org: 'US Navy',
        title: 'Rear Admiral',
      });

      expect(vcard).toContain('BEGIN:VCARD');
      expect(vcard).toContain('VERSION:4.0');
      expect(vcard).toContain('FN:Grace Hopper');
      expect(vcard).toContain('N:Hopper;Grace;;;');
      expect(vcard).toContain('EMAIL;TYPE=work:grace@navy.mil');
      expect(vcard).toContain('TEL;TYPE=cell:+1-555-0100');
      expect(vcard).toContain('ORG:US Navy');
      expect(vcard).toContain('TITLE:Rear Admiral');
      expect(vcard).toContain('END:VCARD');
    });

    it('parses vCard 4.0 into structured contact fields', () => {
      const parsed = parseVCard4(SAMPLE_VCARD4);

      expect(parsed.uid).toBe('contact-uuid-1234');
      expect(parsed.fn).toBe('Ada Lovelace');
      expect(parsed.family).toBe('Lovelace');
      expect(parsed.given).toBe('Ada');
      expect(parsed.email).toBe('ada@computing.org');
      expect(parsed.phone).toBe('+1-555-0199');
      expect(parsed.org).toBe('Analytical Engines Inc.');
      expect(parsed.title).toBe('Chief Mathematician');
      expect(parsed.note).toBe('Pioneer of scientific computing');
    });
  });

  describe('CardDAV XML Multi-Status Serialization (RFC 6352)', () => {
    it('serializes authentic XML Multi-Status with CARD namespace and CDATA address-data', () => {
      const xml = serializeCardDavMultiStatus([
        {
          href: '/dav/addressbooks/ada/default/contact-1.vcf',
          propstat: [
            {
              prop: {
                getetag: 'etag-1',
                getcontenttype: 'text/vcard; version=4.0',
                'address-data': SAMPLE_VCARD4,
              },
              status: 'HTTP/1.1 200 OK',
            },
          ],
        },
      ]);

      expect(xml).toContain('<?xml version="1.0" encoding="utf-8" ?>');
      expect(xml).toContain(
        '<D:multistatus xmlns:D="DAV:" xmlns:CARD="urn:ietf:params:xml:ns:carddav"',
      );
      expect(xml).toContain('<D:response>');
      expect(xml).toContain('<D:href>/dav/addressbooks/ada/default/contact-1.vcf</D:href>');
      expect(xml).toContain('<D:getetag>"etag-1"</D:getetag>');
      expect(xml).toContain('<CARD:address-data><![CDATA[');
      expect(xml).toContain('BEGIN:VCARD');
      expect(xml).toContain('VERSION:4.0');
    });
  });

  describe('CardDAV HTTP Protocol Endpoints', () => {
    it('1. OPTIONS /dav/addressbooks returns DAV compliance header and Allow methods', async () => {
      const app = await buildTestApp('ada');
      const res = await app.inject({
        method: 'OPTIONS',
        url: '/dav/addressbooks',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');
      expect(res.headers['allow']).toContain('PROPFIND');
      expect(res.headers['allow']).toContain('REPORT');
    });

    it('2. PROPFIND /dav/addressbooks returns 207 Multi-Status XML with addressbook-home-set', async () => {
      const app = await buildTestApp('ada');
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks',
        headers: { depth: '0' },
      });

      expect(res.statusCode).toBe(207);
      expect(res.headers['content-type']).toContain('application/xml');
      expect(res.headers['dav']).toBe('1, 2, 3, calendar-access, addressbook');

      const body = res.body;
      expect(body).toContain('<D:multistatus');
      expect(body).toContain('xmlns:CARD="urn:ietf:params:xml:ns:carddav"');
      expect(body).toContain('<CARD:addressbook-home-set>');
      expect(body).toContain('/dav/addressbooks/ada/');
    });

    it('3. PROPFIND /dav/addressbooks/ada (Depth 1) returns address book collection with ctag', async () => {
      const app = await buildTestApp('ada');
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks/ada',
        headers: { depth: '1' },
      });

      expect(res.statusCode).toBe(207);
      const body = res.body;
      expect(body).toContain('<D:resourcetype><D:collection/><CARD:addressbook/></D:resourcetype>');
      expect(body).toContain('<CS:getctag>');
      expect(body).toContain('<D:sync-token>');
      expect(body).toContain('<D:displayname>Contacts</D:displayname>');
    });

    it('4. PUT & GET /dav/addressbooks/ada/default/contact-123.vcf creates and retrieves vCard 4.0 contact', async () => {
      const app = await buildTestApp('ada');
      // PUT contact
      const putRes = await app.inject({
        method: 'PUT',
        url: '/dav/addressbooks/ada/default/contact-123.vcf',
        headers: { 'content-type': 'text/vcard; version=4.0; charset=utf-8' },
        body: SAMPLE_VCARD4,
      });

      expect([201, 204]).toContain(putRes.statusCode);
      expect(putRes.headers['etag']).toBeDefined();

      // GET contact
      const getRes = await app.inject({
        method: 'GET',
        url: '/dav/addressbooks/ada/default/contact-123.vcf',
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.headers['content-type']).toContain('text/vcard');
      expect(getRes.body).toContain('BEGIN:VCARD');
      expect(getRes.body).toContain('VERSION:4.0');
      expect(getRes.body).toContain('FN:Ada Lovelace');
      expect(getRes.body).toContain('EMAIL;TYPE=work:ada@computing.org');
    });

    it('5. REPORT /dav/addressbooks/ada/default returns 207 Multi-Status with <CARD:address-data>', async () => {
      await cardDavService.createOrUpdateContact('ada', 'default', 'contact-123', SAMPLE_VCARD4);

      const app = await buildTestApp('ada');
      const reportRes = await app.inject({
        method: 'REPORT' as any,
        url: '/dav/addressbooks/ada/default',
        headers: { 'content-type': 'application/xml; charset=utf-8' },
        body: '<CARD:addressbook-query xmlns:D="DAV:" xmlns:CARD="urn:ietf:params:xml:ns:carddav"/>',
      });

      expect(reportRes.statusCode).toBe(207);
      expect(reportRes.headers['content-type']).toContain('application/xml');
      const body = reportRes.body;
      expect(body).toContain('<D:response>');
      expect(body).toContain('<CARD:address-data>');
      expect(body).toContain('BEGIN:VCARD');
      expect(body).toContain('VERSION:4.0');
      expect(body).toContain('FN:Ada Lovelace');
    });

    it('6. DELETE /dav/addressbooks/ada/default/contact-123.vcf removes contact', async () => {
      await cardDavService.createOrUpdateContact('ada', 'default', 'contact-123', SAMPLE_VCARD4);

      const app = await buildTestApp('ada');
      const delRes = await app.inject({
        method: 'DELETE',
        url: '/dav/addressbooks/ada/default/contact-123.vcf',
      });

      expect(delRes.statusCode).toBe(204);

      const getRes = await app.inject({
        method: 'GET',
        url: '/dav/addressbooks/ada/default/contact-123.vcf',
      });
      expect(getRes.statusCode).toBe(404);
    });

    it('7. PROPFIND /dav/addressbooks/ada without authentication returns 401 UNAUTHORIZED with WWW-Authenticate header', async () => {
      const app = await buildTestApp(); // unauthenticated
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks/ada',
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toContain('Basic realm="QuantMail DAV"');
    });

    it("8. Cross-user access returns 403 FORBIDDEN (ada attempting to access charles's address book)", async () => {
      const app = await buildTestApp('ada');
      const res = await app.inject({
        method: 'PROPFIND' as any,
        url: '/dav/addressbooks/charles',
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
