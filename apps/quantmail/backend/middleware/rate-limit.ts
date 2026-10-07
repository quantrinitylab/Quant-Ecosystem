import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface RateLimitConfig {
  max: number;
  timeWindow: string;
  keyPrefix?: string;
}

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

function parseTimeWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
  if (!match) return 60_000;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 'second':
      return value * 1000;
    case 'minute':
      return value * 60_000;
    case 'hour':
      return value * 3_600_000;
    case 'day':
      return value * 86_400_000;
    default:
      return 60_000;
  }
}

function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip || 'unknown';
}

export function createRateLimitPreHandler(config: RateLimitConfig) {
  const windowMs = parseTimeWindow(config.timeWindow);
  const prefix = config.keyPrefix || 'rl';

  return async function rateLimitPreHandler(request: FastifyRequest, reply: FastifyReply) {
    const userId = (request as unknown as { auth?: { userId?: string } }).auth?.userId;
    const key = `${prefix}:${userId || getClientIp(request)}:${request.url}`;
    const now = Date.now();

    const entry = store[key];
    if (!entry || now > entry.resetAt) {
      store[key] = { count: 1, resetAt: now + windowMs };
      return;
    }

    entry.count++;

    const remaining = Math.max(0, config.max - entry.count);
    reply.header('X-RateLimit-Limit', String(config.max));
    reply.header('X-RateLimit-Remaining', String(remaining));
    reply.header('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > config.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      reply.header('Retry-After', String(retryAfter));
      reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          statusCode: 429,
        },
      });
    }
  };
}

export function registerRateLimits(fastify: FastifyInstance) {
  fastify.addHook('onRoute', (routeOptions) => {
    const config = (routeOptions as unknown as { config?: { rateLimit?: RateLimitConfig } }).config
      ?.rateLimit;
    if (config) {
      const existingPreHandler = routeOptions.preHandler;
      const rateLimitHandler = createRateLimitPreHandler(config);

      if (Array.isArray(existingPreHandler)) {
        routeOptions.preHandler = [...existingPreHandler, rateLimitHandler];
      } else if (existingPreHandler) {
        routeOptions.preHandler = [existingPreHandler, rateLimitHandler];
      } else {
        routeOptions.preHandler = rateLimitHandler;
      }
    }
  });
}
