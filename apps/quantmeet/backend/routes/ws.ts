import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import * as jose from 'jose';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret.length < 32) {
      throw new Error('JWT_SECRET must be set to a value of at least 32 characters in production');
    }
    return secret;
  }
  if (!secret) {
    console.warn(
      '[SECURITY] JWT_SECRET not set - using dev-only fallback. NEVER use in production.',
    );
    return 'dev-only-insecure-jwt-secret-not-for-production-use-000';
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();
const JWT_ISSUER = process.env.JWT_ISSUER || 'quant-ecosystem';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'quant-apps';

interface WsMessage {
  type: string;
  roomId?: string;
  participantId?: string;
  sdp?: string;
  candidate?: {
    candidate: string;
    sdpMLineIndex: number | null;
    sdpMid: string | null;
  };
  track?: 'audio' | 'video';
}

interface RoomConnection {
  socket: WebSocket;
  participantId: string;
  roomId: string;
}

export default async function wsRoutes(fastify: FastifyInstance) {
  const rooms = new Map<string, RoomConnection[]>();

  function broadcastToRoom(roomId: string, message: unknown, excludeParticipantId?: string): void {
    const connections = rooms.get(roomId) ?? [];
    const payload = JSON.stringify(message);
    for (const conn of connections) {
      if (conn.participantId !== excludeParticipantId && conn.socket.readyState === 1) {
        conn.socket.send(payload);
      }
    }
  }

  function removeConnection(socket: WebSocket): void {
    for (const [roomId, connections] of rooms) {
      const index = connections.findIndex((c) => c.socket === socket);
      if (index !== -1) {
        const conn = connections[index];
        connections.splice(index, 1);
        if (connections.length === 0) {
          rooms.delete(roomId);
        }
        if (conn) {
          broadcastToRoom(roomId, {
            type: 'participant-left',
            participantId: conn.participantId,
          });
        }
        break;
      }
    }
  }

  fastify.get('/', { websocket: true }, async (socket: WebSocket, request: FastifyRequest) => {
    // Authenticate the WebSocket connection via JWT token in query string
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Authentication required' }));
      socket.close(4001, 'Authentication required');
      return;
    }

    try {
      const secret = new TextEncoder().encode(JWT_SECRET);
      await jose.jwtVerify(token, secret, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid token' }));
      socket.close(4001, 'Invalid token');
      return;
    }

    socket.on('message', (rawData: Buffer | string) => {
      let message: WsMessage;
      try {
        const data = typeof rawData === 'string' ? rawData : rawData.toString('utf-8');
        message = JSON.parse(data) as WsMessage;
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        return;
      }

      switch (message.type) {
        case 'join-room': {
          if (
            !message.roomId ||
            typeof message.roomId !== 'string' ||
            message.roomId.trim().length === 0
          ) {
            socket.send(
              JSON.stringify({ type: 'error', message: 'roomId must be a non-empty string' }),
            );
            return;
          }
          if (!message.participantId || typeof message.participantId !== 'string') {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: 'participantId must be a non-empty string',
              }),
            );
            return;
          }
          const connections = rooms.get(message.roomId) ?? [];
          connections.push({
            socket,
            participantId: message.participantId,
            roomId: message.roomId,
          });
          rooms.set(message.roomId, connections);

          broadcastToRoom(
            message.roomId,
            {
              type: 'participant-joined',
              participantId: message.participantId,
            },
            message.participantId,
          );

          socket.send(
            JSON.stringify({
              type: 'joined',
              roomId: message.roomId,
              participants: connections
                .filter((c) => c.participantId !== message.participantId)
                .map((c) => c.participantId),
            }),
          );
          break;
        }

        case 'leave-room': {
          removeConnection(socket);
          socket.send(JSON.stringify({ type: 'left' }));
          break;
        }

        case 'offer': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'offer',
              participantId: message.participantId,
              sdp: message.sdp,
            },
            message.participantId,
          );
          break;
        }

        case 'answer': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'answer',
              participantId: message.participantId,
              sdp: message.sdp,
            },
            message.participantId,
          );
          break;
        }

        case 'ice-candidate': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'ice-candidate',
              participantId: message.participantId,
              candidate: message.candidate,
            },
            message.participantId,
          );
          break;
        }

        case 'mute': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'mute',
              participantId: message.participantId,
              track: message.track,
            },
            message.participantId,
          );
          break;
        }

        case 'unmute': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'unmute',
              participantId: message.participantId,
              track: message.track,
            },
            message.participantId,
          );
          break;
        }

        case 'start-screen-share': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'screen-share-started',
              participantId: message.participantId,
            },
            message.participantId,
          );
          break;
        }

        case 'stop-screen-share': {
          if (!message.roomId || !message.participantId) return;
          broadcastToRoom(
            message.roomId,
            {
              type: 'screen-share-stopped',
              participantId: message.participantId,
            },
            message.participantId,
          );
          break;
        }

        default: {
          socket.send(
            JSON.stringify({ type: 'error', message: `Unknown message type: ${message.type}` }),
          );
          break;
        }
      }
    });

    socket.on('close', () => {
      removeConnection(socket);
    });
  });
}
