// ============================================================================
// QuantChat - Snap Map Backend Routes (friend-location sharing)
//
//   POST   /map/location   publish/refresh the caller's current location
//                          (opt-in sharing). Zod-validated lat/long.
//   DELETE /map/location   stop sharing — removes the caller's location row
//                          (idempotent).
//   GET    /map/friends    the caller's CLOSE FRIENDS who are currently
//                          sharing, shaped for the map view.
//
// All routes require authentication (the global auth hook from createApp()
// binds `request.auth.userId`). The feature wires the previously-unused Prisma
// `FriendLocation` model via the shared `fastify.prisma` decorator.
// ============================================================================
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAppError } from '@quant/server-core';
import {
  LocationService,
  type LocationPrismaClient,
  type FriendLocationRecord,
  type FriendOnMap,
} from '../services/location.service';

const updateLocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

interface AuthedRequest {
  auth?: { userId?: string };
  user?: { id?: string };
}

function requireUserId(request: unknown): string {
  const r = request as AuthedRequest;
  const userId = r.auth?.userId ?? r.user?.id;
  if (!userId) {
    throw createAppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
}

function getLocationService(fastify: FastifyInstance): LocationService {
  const prisma = (fastify as unknown as { prisma?: LocationPrismaClient }).prisma;
  if (!prisma) {
    throw createAppError('Database unavailable', 503, 'DB_UNAVAILABLE');
  }
  return new LocationService(prisma);
}

function serializeLocation(record: FriendLocationRecord) {
  return {
    userId: record.userId,
    latitude: record.latitude,
    longitude: record.longitude,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}

function serializeFriendOnMap(friend: FriendOnMap) {
  return {
    userId: friend.userId,
    username: friend.username,
    displayName: friend.displayName,
    avatarUrl: friend.avatarUrl,
    latitude: friend.latitude,
    longitude: friend.longitude,
    updatedAt: friend.updatedAt instanceof Date ? friend.updatedAt.toISOString() : friend.updatedAt,
  };
}

export default async function mapRoutes(fastify: FastifyInstance) {
  // POST /map/location — publish/refresh the caller's location (opt-in share).
  fastify.post('/location', async (request, reply) => {
    const parsed = updateLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      throw createAppError('Invalid location payload', 400, 'VALIDATION_ERROR');
    }
    const userId = requireUserId(request);
    const service = getLocationService(fastify);

    const location = await service.updateLocation(userId, {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
    });

    return reply.send({ success: true, data: serializeLocation(location) });
  });

  // DELETE /map/location — stop sharing (idempotent).
  fastify.delete('/location', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getLocationService(fastify);

    const result = await service.clearLocation(userId);

    return reply.send({ success: true, data: result });
  });

  // GET /map/friends — close friends currently sharing, shaped for the map.
  fastify.get('/friends', async (request, reply) => {
    const userId = requireUserId(request);
    const service = getLocationService(fastify);

    const friends = await service.getFriendsOnMap(userId);

    return reply.send({
      success: true,
      data: { friends: friends.map(serializeFriendOnMap), total: friends.length },
    });
  });
}
