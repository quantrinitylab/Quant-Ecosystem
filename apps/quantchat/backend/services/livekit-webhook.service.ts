import { EventEmitter } from 'node:events';
import { createAppError } from '@quant/server-core';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';

export type LiveKitWebhookEventType =
  | 'participant_joined'
  | 'participant_left'
  | 'room_started'
  | 'room_finished'
  | 'egress_ended';

export interface DomainEvent {
  type: LiveKitWebhookEventType;
  roomName: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export class LiveKitWebhookService extends EventEmitter {
  private readonly receiver: WebhookReceiver;

  constructor(apiKey: string, apiSecret: string) {
    super();
    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  async handleWebhook(body: string, authHeader: string | undefined): Promise<DomainEvent | null> {
    if (!authHeader) {
      throw createAppError('Missing authorization header', 401, 'WEBHOOK_AUTH_MISSING');
    }

    let event: WebhookEvent;
    try {
      event = await this.receiver.receive(body, authHeader);
    } catch (err) {
      throw createAppError(
        `Webhook signature validation failed: ${(err as Error).message}`,
        401,
        'WEBHOOK_SIGNATURE_INVALID',
      );
    }

    const eventType = event.event as LiveKitWebhookEventType | undefined;
    if (!eventType) {
      return null;
    }

    const supportedEvents: LiveKitWebhookEventType[] = [
      'participant_joined',
      'participant_left',
      'room_started',
      'room_finished',
      'egress_ended',
    ];

    if (!supportedEvents.includes(eventType)) {
      return null;
    }

    const domainEvent: DomainEvent = {
      type: eventType,
      roomName: event.room?.name ?? '',
      timestamp: new Date(Number(event.createdAt) * 1000),
      payload: this.extractPayload(event),
    };

    this.emit('event', domainEvent);
    this.emit(eventType, domainEvent);

    return domainEvent;
  }

  private extractPayload(event: WebhookEvent): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    if (event.participant) {
      payload['participant'] = {
        sid: event.participant.sid,
        identity: event.participant.identity,
        name: event.participant.name,
      };
    }

    if (event.room) {
      payload['room'] = {
        sid: event.room.sid,
        name: event.room.name,
        numParticipants: event.room.numParticipants,
      };
    }

    if (event.egressInfo) {
      payload['egress'] = {
        egressId: event.egressInfo.egressId,
        roomName: event.egressInfo.roomName,
        status: event.egressInfo.status,
      };
    }

    return payload;
  }
}
