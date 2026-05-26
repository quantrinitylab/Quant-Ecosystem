import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';

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

  fastify.get('/', { websocket: true }, (socket: WebSocket) => {
    // TODO: Authentication should be added here. In production, validate a JWT token
    // passed as a query parameter or in the initial WebSocket upgrade headers.
    // Example: const token = request.query.token; verify(token, jwtSecret);
    // Until then, any connected socket can join rooms without proving identity.

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
          // TODO: Validate that the room exists in RoomService and that the participant
          // has been authenticated and authorized to join this room.
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
