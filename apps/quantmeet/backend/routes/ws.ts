import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import * as jose from 'jose';
import { RoomManager, SignalingServer } from '@quant/webrtc';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a value of at least 32 characters in production');
    }
    return secret;
  }
  if (!secret) {
    globalThis.console.warn(
      '[SECURITY] JWT_SECRET not set - using dev-only fallback. NEVER use in production.',
    );
    return 'dev-only-insecure-jwt-secret-not-for-production-use-000';
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_ISSUER = process.env.JWT_ISSUER || 'quant-ecosystem';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'quant-apps';

const roomManager = new RoomManager();
const signalingServer = new SignalingServer({ roomManager });

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/',
    {
      websocket: true,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (socket: WebSocket, request: FastifyRequest) => {
      const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');

      if (!token) {
        socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
        socket.close(4001, 'Authentication required');
        return;
      }

      let participantId: string;
      try {
        const secret = new TextEncoder().encode(JWT_SECRET);
        const { payload } = await jose.jwtVerify(token, secret, {
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        });
        participantId = (payload.sub as string) || crypto.randomUUID();
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
        socket.close(4001, 'Invalid token');
        return;
      }

      signalingServer.handleConnection(socket, participantId);

      socket.on('message', (rawData: Buffer | string) => {
        const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
        signalingServer.handleMessage(participantId, data);
      });

      socket.on('close', () => {
        signalingServer.removeConnection(participantId);
      });
    },
  );
}
