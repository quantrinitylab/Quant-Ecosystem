import { z } from 'zod';

export type SignalType =
  | 'join'
  | 'leave'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'mute'
  | 'unmute';

export const SignalMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('join'),
    roomId: z.string().min(1),
    participantId: z.string().min(1),
    displayName: z.string().optional(),
  }),
  z.object({
    type: z.literal('leave'),
    roomId: z.string().min(1),
    participantId: z.string().min(1),
  }),
  z.object({
    type: z.literal('offer'),
    roomId: z.string().min(1),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal('answer'),
    roomId: z.string().min(1),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal('ice-candidate'),
    roomId: z.string().min(1),
    fromId: z.string().min(1),
    toId: z.string().min(1),
    candidate: z.object({
      candidate: z.string(),
      sdpMLineIndex: z.number().nullable(),
      sdpMid: z.string().nullable(),
    }),
  }),
  z.object({
    type: z.literal('mute'),
    roomId: z.string().min(1),
    participantId: z.string().min(1),
    track: z.enum(['audio', 'video']),
  }),
  z.object({
    type: z.literal('unmute'),
    roomId: z.string().min(1),
    participantId: z.string().min(1),
    track: z.enum(['audio', 'video']),
  }),
]);

export type SignalMessage = z.infer<typeof SignalMessageSchema>;

export interface Participant {
  id: string;
  displayName: string;
  joinedAt: Date;
  audioMuted: boolean;
  videoMuted: boolean;
}

export interface Room {
  id: string;
  createdAt: Date;
  participants: Map<string, Participant>;
  maxParticipants: number;
}

export interface SignalingConfig {
  maxRoomsPerServer: number;
  maxParticipantsPerRoom: number;
  roomCleanupIntervalMs: number;
  roomMaxIdleMs: number;
}

export interface PeerConnectionConfig {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
  iceCandidatePoolSize?: number;
}

export interface ISocket {
  send(data: string): void;
  readyState: number;
}
