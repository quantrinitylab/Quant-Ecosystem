import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

function resolveUserId(request: FastifyRequest): string | undefined {
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

  return undefined;
}

export default async function wellKnownRoutes(fastify: FastifyInstance) {
  try {
    fastify.addHttpMethod('PROPFIND', { hasBody: true });
  } catch {
    // already registered
  }

  // RFC 6764 CalDAV Discovery: /.well-known/caldav -> 308 Permanent Redirect to /dav/calendars
  const caldavRedirect = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = resolveUserId(request);
    const targetUrl = userId ? `/dav/calendars/${userId}` : '/dav/calendars';
    reply.header('DAV', '1, 2, 3, calendar-access, addressbook');
    return reply.redirect(targetUrl, 308);
  };

  fastify.get('/.well-known/caldav', caldavRedirect);
  fastify.route({
    method: 'PROPFIND',
    url: '/.well-known/caldav',
    handler: caldavRedirect,
  });

  // RFC 6764 CardDAV Discovery: /.well-known/carddav -> 308 Permanent Redirect to /dav/addressbooks
  const carddavRedirect = async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = resolveUserId(request);
    const targetUrl = userId ? `/dav/addressbooks/${userId}` : '/dav/addressbooks';
    reply.header('DAV', '1, 2, 3, calendar-access, addressbook');
    return reply.redirect(targetUrl, 308);
  };

  fastify.get('/.well-known/carddav', carddavRedirect);
  fastify.route({
    method: 'PROPFIND',
    url: '/.well-known/carddav',
    handler: carddavRedirect,
  });
}
