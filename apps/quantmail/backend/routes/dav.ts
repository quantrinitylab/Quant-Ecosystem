import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  CalDavService,
  serializeCalDavMultiStatus,
  type MultiStatusResponse,
} from '../services/caldav.service';
import {
  CardDavService,
  defaultCardDavService,
  serializeCardDavMultiStatus,
  type CardDavMultiStatusResponse,
} from '../services/carddav.service';

let calDavServiceSingleton: CalDavService | undefined;
let cardDavServiceSingleton: CardDavService | undefined;

export function __setCalDavService(service: CalDavService | undefined): void {
  calDavServiceSingleton = service;
}

export function __setCardDavService(service: CardDavService | undefined): void {
  cardDavServiceSingleton = service;
}

function getCalDav(fastify: FastifyInstance): CalDavService {
  if (calDavServiceSingleton) return calDavServiceSingleton;
  const prisma = (fastify as unknown as { prisma?: unknown }).prisma;
  return new CalDavService(prisma);
}

function getCardDav(fastify: FastifyInstance): CardDavService {
  if (cardDavServiceSingleton) return cardDavServiceSingleton;
  const prisma = (fastify as unknown as { prisma?: unknown }).prisma;
  return new CardDavService(prisma);
}

const DAV_HEADERS = {
  DAV: '1, 2, 3, calendar-access, addressbook',
  Allow: 'GET, HEAD, POST, PUT, DELETE, OPTIONS, PROPFIND, REPORT, MKCALENDAR',
};

function resolveUserId(request: FastifyRequest): string {
  const params = request.params as { userId?: string };
  if (params?.userId) return params.userId;

  const auth = (request as unknown as { auth?: { userId?: string } }).auth;
  if (auth?.userId) return auth.userId;

  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const [username] = decoded.split(':');
      if (username) return username;
    } catch {
      // ignore
    }
  }

  return 'user-primary';
}

function applyDavHeaders(reply: FastifyReply) {
  reply.header('DAV', DAV_HEADERS.DAV);
  reply.header('Allow', DAV_HEADERS.Allow);
}

export default async function davRoutes(fastify: FastifyInstance) {
  // Register WebDAV HTTP methods
  for (const m of ['PROPFIND', 'REPORT', 'MKCALENDAR']) {
    try {
      fastify.addHttpMethod(m, { hasBody: true });
    } catch {
      // already registered
    }
  }

  // Add raw body parser for WebDAV payloads (XML, iCalendar, vCard)
  fastify.addContentTypeParser(
    ['application/xml', 'text/xml', 'text/calendar', 'text/vcard', 'text/x-vcard'],
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, body);
    },
  );

  // Hook to ensure DAV header is stamped on all responses in this plugin
  fastify.addHook('onSend', async (_request, reply) => {
    applyDavHeaders(reply);
  });

  // OPTIONS handler
  fastify.options('/*', async (_req, reply) => {
    applyDavHeaders(reply);
    return reply.status(200).send();
  });

  // ==========================================================================
  // CALDAV ROUTES (RFC 4791)
  // ==========================================================================

  // PROPFIND /calendars or /calendars/:userId
  fastify.route({
    method: 'PROPFIND',
    url: '/calendars',
    handler: handleCalendarHomePropfind,
  });
  fastify.route({
    method: 'PROPFIND',
    url: '/calendars/:userId',
    handler: handleCalendarHomePropfind,
  });

  async function handleCalendarHomePropfind(request: FastifyRequest, reply: FastifyReply) {
    const userId = resolveUserId(request);
    const depth = request.headers.depth === '0' ? 0 : 1;
    const calService = getCalDav(fastify);
    const primary = await calService.ensurePrimaryCalendar(userId);
    const calendars = await calService.listCalendars(userId);

    const responses: MultiStatusResponse[] = [
      {
        href: `/dav/calendars/${userId}/`,
        propstat: [
          {
            prop: {
              resourcetype: 'collection',
              'current-user-principal': `/dav/calendars/${userId}/`,
              'calendar-home-set': `/dav/calendars/${userId}/`,
              'calendar-user-address-set': `mailto:${userId}@quantmail.in`,
              displayname: `${userId}'s Calendars`,
            },
            status: 'HTTP/1.1 200 OK',
          },
        ],
      },
    ];

    if (depth > 0) {
      for (const cal of calendars) {
        responses.push({
          href: `/dav/calendars/${userId}/${cal.id}/`,
          propstat: [
            {
              prop: {
                resourcetype: 'calendar',
                displayname: cal.name,
                'calendar-color': cal.color || '#fffc00',
                getctag: cal.ctag,
                'sync-token': cal.syncToken,
                'supported-calendar-component-set': 'VEVENT',
              },
              status: 'HTTP/1.1 200 OK',
            },
          ],
        });
      }
    }

    const xml = serializeCalDavMultiStatus(responses);
    return reply.status(207).type('application/xml; charset=utf-8').send(xml);
  }

  // PROPFIND /calendars/:userId/:calendarId
  fastify.route({
    method: 'PROPFIND',
    url: '/calendars/:userId/:calendarId',
    handler: async (request, reply) => {
      const { userId, calendarId } = request.params as { userId: string; calendarId: string };
      const depth = request.headers.depth === '0' ? 0 : 1;
      const calService = getCalDav(fastify);
      const cal = await calService.getCalendar(userId, calendarId);

      if (!cal) {
        return reply.status(404).send('Calendar not found');
      }

      const responses: MultiStatusResponse[] = [
        {
          href: `/dav/calendars/${userId}/${cal.id}/`,
          propstat: [
            {
              prop: {
                resourcetype: 'calendar',
                displayname: cal.name,
                'calendar-color': cal.color || '#fffc00',
                getctag: cal.ctag,
                'sync-token': cal.syncToken,
                'supported-calendar-component-set': 'VEVENT',
              },
              status: 'HTTP/1.1 200 OK',
            },
          ],
        },
      ];

      if (depth > 0) {
        const events = await calService.listEvents(userId, cal.id);
        for (const ev of events) {
          responses.push({
            href: `/dav/calendars/${userId}/${cal.id}/${ev.id}.ics`,
            propstat: [
              {
                prop: {
                  getetag: ev.etag,
                  getcontenttype: 'text/calendar; component=vevent; charset=utf-8',
                },
                status: 'HTTP/1.1 200 OK',
              },
            ],
          });
        }
      }

      const xml = serializeCalDavMultiStatus(responses);
      return reply.status(207).type('application/xml; charset=utf-8').send(xml);
    },
  });

  // REPORT /calendars or /calendars/:userId or /calendars/:userId/:calendarId
  fastify.route({
    method: 'REPORT',
    url: '/calendars',
    handler: handleCalendarReport,
  });
  fastify.route({
    method: 'REPORT',
    url: '/calendars/:userId',
    handler: handleCalendarReport,
  });
  fastify.route({
    method: 'REPORT',
    url: '/calendars/:userId/:calendarId',
    handler: handleCalendarReport,
  });

  async function handleCalendarReport(request: FastifyRequest, reply: FastifyReply) {
    const { userId, calendarId } = request.params as { userId?: string; calendarId?: string };
    const effectiveUserId = userId || resolveUserId(request);
    const calService = getCalDav(fastify);
    const events = await calService.listEvents(effectiveUserId, calendarId);

    const responses: MultiStatusResponse[] = events.map((ev) => ({
      href: `/dav/calendars/${effectiveUserId}/${calendarId || ev.calendarId || 'primary'}/${ev.id}.ics`,
      propstat: [
        {
          prop: {
            getetag: ev.etag,
            getcontenttype: 'text/calendar; component=vevent; charset=utf-8',
            'calendar-data': ev.icsData,
          },
          status: 'HTTP/1.1 200 OK',
        },
      ],
    }));

    const xml = serializeCalDavMultiStatus(responses);
    return reply.status(207).type('application/xml; charset=utf-8').send(xml);
  }

  // GET /calendars/:userId/:calendarId/:eventId
  fastify.get('/calendars/:userId/:calendarId/:eventId', async (request, reply) => {
    const { userId, calendarId, eventId } = request.params as {
      userId: string;
      calendarId: string;
      eventId: string;
    };
    const calService = getCalDav(fastify);
    const ev = await calService.getEvent(userId, eventId);

    if (!ev) {
      return reply.status(404).send('Event not found');
    }

    reply.header('ETag', ev.etag);
    return reply.status(200).type('text/calendar; charset=utf-8').send(ev.icsData);
  });

  // PUT /calendars/:userId/:calendarId/:eventId
  fastify.put('/calendars/:userId/:calendarId/:eventId', async (request, reply) => {
    const { userId, calendarId, eventId } = request.params as {
      userId: string;
      calendarId: string;
      eventId: string;
    };
    const calService = getCalDav(fastify);
    const icsData = typeof request.body === 'string' ? request.body : '';

    const result = await calService.upsertEventFromIcs(userId, calendarId, eventId, icsData);
    reply.header('ETag', result.event.etag);
    return reply.status(result.created ? 201 : 204).send();
  });

  // DELETE /calendars/:userId/:calendarId/:eventId
  fastify.delete('/calendars/:userId/:calendarId/:eventId', async (request, reply) => {
    const { userId, eventId } = request.params as {
      userId: string;
      calendarId: string;
      eventId: string;
    };
    const calService = getCalDav(fastify);
    const deleted = await calService.deleteEvent(userId, eventId);

    if (!deleted) {
      return reply.status(404).send('Event not found');
    }
    return reply.status(204).send();
  });

  // MKCALENDAR /calendars/:userId/:calendarId
  fastify.route({
    method: 'MKCALENDAR',
    url: '/calendars/:userId/:calendarId',
    handler: async (request, reply) => {
      const { userId, calendarId } = request.params as { userId: string; calendarId: string };
      const calService = getCalDav(fastify);
      const created = await calService.createCalendar(userId, calendarId);

      return reply.status(201).type('text/plain').send(`Calendar ${created.id} created`);
    },
  });

  // ==========================================================================
  // CARDDAV ROUTES (RFC 6350 / RFC 6352)
  // ==========================================================================

  // PROPFIND /addressbooks or /addressbooks/:userId
  fastify.route({
    method: 'PROPFIND',
    url: '/addressbooks',
    handler: handleAddressBookHomePropfind,
  });
  fastify.route({
    method: 'PROPFIND',
    url: '/addressbooks/:userId',
    handler: handleAddressBookHomePropfind,
  });

  async function handleAddressBookHomePropfind(request: FastifyRequest, reply: FastifyReply) {
    const userId = resolveUserId(request);
    const depth = request.headers.depth === '0' ? 0 : 1;
    const cardService = getCardDav(fastify);
    const books = await cardService.getAddressBooks(userId);

    const responses: CardDavMultiStatusResponse[] = [
      {
        href: `/dav/addressbooks/${userId}/`,
        propstat: [
          {
            prop: {
              resourcetype: 'collection',
              'current-user-principal': `/dav/addressbooks/${userId}/`,
              'addressbook-home-set': `/dav/addressbooks/${userId}/`,
              displayname: `${userId}'s Address Books`,
            },
            status: 'HTTP/1.1 200 OK',
          },
        ],
      },
    ];

    if (depth > 0) {
      for (const b of books) {
        responses.push({
          href: `/dav/addressbooks/${userId}/${b.id}/`,
          propstat: [
            {
              prop: {
                resourcetype: 'addressbook',
                displayname: b.name,
                getctag: b.ctag,
                'sync-token': b.syncToken,
              },
              status: 'HTTP/1.1 200 OK',
            },
          ],
        });
      }
    }

    const xml = serializeCardDavMultiStatus(responses);
    return reply.status(207).type('application/xml; charset=utf-8').send(xml);
  }

  // PROPFIND /addressbooks/:userId/:bookId
  fastify.route({
    method: 'PROPFIND',
    url: '/addressbooks/:userId/:bookId',
    handler: async (request, reply) => {
      const { userId, bookId } = request.params as { userId: string; bookId: string };
      const depth = request.headers.depth === '0' ? 0 : 1;
      const cardService = getCardDav(fastify);
      const book = await cardService.getAddressBook(userId, bookId);

      if (!book) {
        return reply.status(404).send('Address book not found');
      }

      const responses: CardDavMultiStatusResponse[] = [
        {
          href: `/dav/addressbooks/${userId}/${book.id}/`,
          propstat: [
            {
              prop: {
                resourcetype: 'addressbook',
                displayname: book.name,
                getctag: book.ctag,
                'sync-token': book.syncToken,
              },
              status: 'HTTP/1.1 200 OK',
            },
          ],
        },
      ];

      if (depth > 0) {
        const contacts = await cardService.getContacts(userId, book.id);
        for (const c of contacts) {
          responses.push({
            href: `/dav/addressbooks/${userId}/${book.id}/${c.id}.vcf`,
            propstat: [
              {
                prop: {
                  getetag: c.etag,
                  getcontenttype: 'text/vcard; version=4.0; charset=utf-8',
                },
                status: 'HTTP/1.1 200 OK',
              },
            ],
          });
        }
      }

      const xml = serializeCardDavMultiStatus(responses);
      return reply.status(207).type('application/xml; charset=utf-8').send(xml);
    },
  });

  // REPORT /addressbooks or /addressbooks/:userId or /addressbooks/:userId/:bookId
  fastify.route({
    method: 'REPORT',
    url: '/addressbooks',
    handler: handleAddressBookReport,
  });
  fastify.route({
    method: 'REPORT',
    url: '/addressbooks/:userId',
    handler: handleAddressBookReport,
  });
  fastify.route({
    method: 'REPORT',
    url: '/addressbooks/:userId/:bookId',
    handler: handleAddressBookReport,
  });

  async function handleAddressBookReport(request: FastifyRequest, reply: FastifyReply) {
    const { userId, bookId } = request.params as { userId?: string; bookId?: string };
    const effectiveUserId = userId || resolveUserId(request);
    const effectiveBookId = bookId || 'default';
    const cardService = getCardDav(fastify);
    const contacts = await cardService.getContacts(effectiveUserId, effectiveBookId);

    const responses: CardDavMultiStatusResponse[] = contacts.map((c) => ({
      href: `/dav/addressbooks/${effectiveUserId}/${effectiveBookId}/${c.id}.vcf`,
      propstat: [
        {
          prop: {
            getetag: c.etag,
            getcontenttype: 'text/vcard; version=4.0; charset=utf-8',
            'address-data': c.vcardData,
          },
          status: 'HTTP/1.1 200 OK',
        },
      ],
    }));

    const xml = serializeCardDavMultiStatus(responses);
    return reply.status(207).type('application/xml; charset=utf-8').send(xml);
  }

  // GET /addressbooks/:userId/:bookId/:contactId
  fastify.get('/addressbooks/:userId/:bookId/:contactId', async (request, reply) => {
    const { userId, contactId } = request.params as {
      userId: string;
      bookId: string;
      contactId: string;
    };
    const cardService = getCardDav(fastify);
    const contact = await cardService.getContact(userId, contactId);

    if (!contact) {
      return reply.status(404).send('Contact not found');
    }

    reply.header('ETag', contact.etag);
    return reply.status(200).type('text/vcard; version=4.0; charset=utf-8').send(contact.vcardData);
  });

  // PUT /addressbooks/:userId/:bookId/:contactId
  fastify.put('/addressbooks/:userId/:bookId/:contactId', async (request, reply) => {
    const { userId, bookId, contactId } = request.params as {
      userId: string;
      bookId: string;
      contactId: string;
    };
    const cardService = getCardDav(fastify);
    const vcardData = typeof request.body === 'string' ? request.body : '';

    const result = await cardService.createOrUpdateContact(userId, bookId, contactId, vcardData);
    reply.header('ETag', result.contact.etag);
    return reply.status(result.created ? 201 : 204).send();
  });

  // DELETE /addressbooks/:userId/:bookId/:contactId
  fastify.delete('/addressbooks/:userId/:bookId/:contactId', async (request, reply) => {
    const { userId, bookId, contactId } = request.params as {
      userId: string;
      bookId: string;
      contactId: string;
    };
    const cardService = getCardDav(fastify);
    const deleted = await cardService.deleteContact(userId, bookId, contactId);

    if (!deleted) {
      return reply.status(404).send('Contact not found');
    }
    return reply.status(204).send();
  });
}
