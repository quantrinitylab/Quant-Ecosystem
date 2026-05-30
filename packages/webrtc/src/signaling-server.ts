import type { ISocket } from './types.js';
import { SignalMessageSchema } from './types.js';
import type { RoomManager } from './room-manager.js';
import type pino from 'pino';

export interface SignalingServerOptions {
  roomManager: RoomManager;
  logger?: pino.Logger;
}

export class SignalingServer {
  private connections: Map<string, ISocket> = new Map();
  private roomManager: RoomManager;
  private logger?: pino.Logger;

  constructor(options: SignalingServerOptions) {
    this.roomManager = options.roomManager;
    this.logger = options.logger;
  }

  handleConnection(socket: ISocket, participantId: string): void {
    this.connections.set(participantId, socket);
    this.logger?.info({ participantId }, 'WebRTC connection registered');
  }

  handleMessage(participantId: string, raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger?.warn({ participantId }, 'Invalid JSON received');
      const socket = this.connections.get(participantId);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      }
      return;
    }

    const result = SignalMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.logger?.warn({ participantId, errors: result.error.issues }, 'Invalid signal message');
      const socket = this.connections.get(participantId);
      if (socket && socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
      return;
    }

    const message = result.data;

    switch (message.type) {
      case 'join': {
        try {
          this.roomManager.joinRoom(message.roomId, message.participantId, message.displayName);
          this.broadcastToRoom(
            message.roomId,
            { type: 'participant-joined', participantId: message.participantId },
            message.participantId,
          );
          const participants = this.roomManager
            .getRoomParticipants(message.roomId)
            .filter((p) => p.id !== message.participantId)
            .map((p) => p.id);
          this.sendToPeer(message.participantId, {
            type: 'joined',
            roomId: message.roomId,
            participants,
          });
        } catch (err) {
          this.sendToPeer(participantId, {
            type: 'error',
            message: err instanceof Error ? err.message : 'Failed to join room',
          });
        }
        break;
      }

      case 'leave': {
        this.roomManager.leaveRoom(message.roomId, message.participantId);
        this.broadcastToRoom(message.roomId, {
          type: 'participant-left',
          participantId: message.participantId,
        });
        break;
      }

      case 'offer': {
        this.sendToPeer(message.toId, {
          type: 'offer',
          fromId: message.fromId,
          sdp: message.sdp,
        });
        break;
      }

      case 'answer': {
        this.sendToPeer(message.toId, {
          type: 'answer',
          fromId: message.fromId,
          sdp: message.sdp,
        });
        break;
      }

      case 'ice-candidate': {
        this.sendToPeer(message.toId, {
          type: 'ice-candidate',
          fromId: message.fromId,
          candidate: message.candidate,
        });
        break;
      }

      case 'mute': {
        this.broadcastToRoom(
          message.roomId,
          { type: 'mute', participantId: message.participantId, track: message.track },
          message.participantId,
        );
        break;
      }

      case 'unmute': {
        this.broadcastToRoom(
          message.roomId,
          { type: 'unmute', participantId: message.participantId, track: message.track },
          message.participantId,
        );
        break;
      }
    }
  }

  sendToPeer(peerId: string, message: object): boolean {
    const socket = this.connections.get(peerId);
    if (!socket || socket.readyState !== 1) {
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  }

  broadcastToRoom(roomId: string, message: object, excludeId?: string): void {
    const participants = this.roomManager.getRoomParticipants(roomId);
    const payload = JSON.stringify(message);
    for (const participant of participants) {
      if (participant.id === excludeId) continue;
      const socket = this.connections.get(participant.id);
      if (socket && socket.readyState === 1) {
        socket.send(payload);
      }
    }
  }

  removeConnection(participantId: string): void {
    this.connections.delete(participantId);
    this.logger?.info({ participantId }, 'WebRTC connection removed');
  }

  getConnectionCount(): number {
    return this.connections.size;
  }
}
