import { createAppError } from '@quant/server-core';
import {
  RoomServiceClient,
  EgressClient,
  AccessToken,
  EncodedFileOutput,
  S3Upload,
  EncodedFileType,
  type VideoGrant,
  type EncodedOutputs,
} from 'livekit-server-sdk';

export interface LiveKitConfig {
  apiKey: string;
  apiSecret: string;
  wsUrl: string;
}

export interface CreateRoomOptions {
  name: string;
  maxParticipants?: number;
  emptyTimeout?: number;
}

export interface TokenOptions {
  canPublish?: boolean;
  canSubscribe?: boolean;
  isAdmin?: boolean;
}

export interface S3EgressConfig {
  bucket: string;
  region: string;
  accessKey: string;
  secret: string;
  endpoint?: string;
}

export interface LiveKitRoom {
  name: string;
  sid: string;
  numParticipants: number;
  maxParticipants: number;
  creationTime: number;
}

export interface LiveKitParticipant {
  sid: string;
  identity: string;
  name: string;
  joinedAt: number;
}

export interface EgressInfo {
  egressId: string;
  roomName: string;
  status: string;
}

export class LiveKitGateway {
  private readonly roomClient: RoomServiceClient;
  private readonly egressClient: EgressClient;
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(config: LiveKitConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.roomClient = new RoomServiceClient(config.wsUrl, config.apiKey, config.apiSecret);
    this.egressClient = new EgressClient(config.wsUrl, config.apiKey, config.apiSecret);
  }

  async createRoom(name: string, maxParticipants = 50): Promise<LiveKitRoom> {
    try {
      const room = await this.roomClient.createRoom({
        name,
        maxParticipants,
        emptyTimeout: 300,
      });
      return {
        name: room.name,
        sid: room.sid,
        numParticipants: room.numParticipants,
        maxParticipants: room.maxParticipants,
        creationTime: Number(room.creationTime),
      };
    } catch (err) {
      throw createAppError(
        `Failed to create LiveKit room: ${(err as Error).message}`,
        502,
        'LIVEKIT_CREATE_ROOM_FAILED',
      );
    }
  }

  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomClient.deleteRoom(roomName);
    } catch (err) {
      throw createAppError(
        `Failed to delete LiveKit room: ${(err as Error).message}`,
        502,
        'LIVEKIT_DELETE_ROOM_FAILED',
      );
    }
  }

  /**
   * Generate a LiveKit access token for a meeting participant.
   *
   * Token TTL: 6 hours. Meetings can be long-running sessions (lectures,
   * all-hands, workshops) so the token validity window must accommodate
   * multi-hour usage without requiring a mid-session refresh.
   */
  async generateToken(
    roomName: string,
    participantIdentity: string,
    participantName: string,
    options: TokenOptions = {},
  ): Promise<string> {
    const { canPublish = true, canSubscribe = true, isAdmin = false } = options;

    const grant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      roomAdmin: isAdmin,
    };

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantIdentity,
      name: participantName,
      ttl: '6h',
    });
    token.addGrant(grant);

    return await token.toJwt();
  }

  async startRecordingEgress(roomName: string, s3Config: S3EgressConfig): Promise<EgressInfo> {
    try {
      const s3Upload = new S3Upload({
        bucket: s3Config.bucket,
        region: s3Config.region,
        accessKey: s3Config.accessKey,
        secret: s3Config.secret,
        endpoint: s3Config.endpoint ?? '',
      });

      const fileOutput = new EncodedFileOutput({
        fileType: EncodedFileType.MP4,
        filepath: `recordings/${roomName}/{time}`,
        output: { case: 's3', value: s3Upload },
      });

      const output: EncodedOutputs = { file: fileOutput };

      const egress = await this.egressClient.startRoomCompositeEgress(roomName, output);

      return {
        egressId: egress.egressId,
        roomName: roomName,
        status: String(egress.status),
      };
    } catch (err) {
      throw createAppError(
        `Failed to start recording egress: ${(err as Error).message}`,
        502,
        'LIVEKIT_EGRESS_START_FAILED',
      );
    }
  }

  async stopEgress(egressId: string): Promise<EgressInfo> {
    try {
      const egress = await this.egressClient.stopEgress(egressId);
      return {
        egressId: egress.egressId,
        roomName: egress.roomName,
        status: String(egress.status),
      };
    } catch (err) {
      throw createAppError(
        `Failed to stop egress: ${(err as Error).message}`,
        502,
        'LIVEKIT_EGRESS_STOP_FAILED',
      );
    }
  }

  async listParticipants(roomName: string): Promise<LiveKitParticipant[]> {
    try {
      const participants = await this.roomClient.listParticipants(roomName);
      return participants.map((p) => ({
        sid: p.sid,
        identity: p.identity,
        name: p.name,
        joinedAt: Number(p.joinedAt),
      }));
    } catch (err) {
      throw createAppError(
        `Failed to list participants: ${(err as Error).message}`,
        502,
        'LIVEKIT_LIST_PARTICIPANTS_FAILED',
      );
    }
  }

  getRoomClient(): RoomServiceClient {
    return this.roomClient;
  }

  getEgressClient(): EgressClient {
    return this.egressClient;
  }
}
