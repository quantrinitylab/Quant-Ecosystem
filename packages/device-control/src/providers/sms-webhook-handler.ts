import twilio from 'twilio';
import type { SmsMessage } from '../capabilities/sms.js';
import type { MessageStatus, SMSWebhookPayload } from './types.js';
import type { MessageStore } from './message-store.js';

const VALID_STATUSES: readonly string[] = ['queued', 'sent', 'delivered', 'failed', 'received'];

export interface WebhookHandlerConfig {
  authToken: string;
  webhookUrl: string;
}

export class SMSWebhookHandler {
  private config: WebhookHandlerConfig;
  private store: MessageStore;
  private callbacks: Array<(msg: SmsMessage) => void> = [];

  constructor(config: WebhookHandlerConfig, store: MessageStore) {
    this.config = config;
    this.store = store;
  }

  validateSignature(signature: string, url: string, params: Record<string, string>): boolean {
    return twilio.validateRequest(this.config.authToken, signature, url, params);
  }

  handleInbound(payload: SMSWebhookPayload, signature: string, url: string): boolean {
    if (!this.validateSignature(signature, url, payload as unknown as Record<string, string>)) {
      return false;
    }
    const msg = {
      id: payload.MessageSid,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      timestamp: Date.now(),
      status: 'received' as const,
      direction: 'inbound' as const,
    };
    this.store.store(msg);
    const smsMsg: SmsMessage = {
      id: msg.id,
      from: msg.from,
      body: msg.body,
      timestamp: msg.timestamp,
    };
    for (const cb of this.callbacks) cb(smsMsg);
    return true;
  }

  handleStatusUpdate(payload: SMSWebhookPayload, signature: string, url: string): boolean {
    if (!this.validateSignature(signature, url, payload as unknown as Record<string, string>)) {
      return false;
    }
    if (payload.MessageStatus && VALID_STATUSES.includes(payload.MessageStatus)) {
      this.store.updateStatus(payload.MessageSid, payload.MessageStatus as MessageStatus);
    }
    return true;
  }

  onIncoming(cb: (msg: SmsMessage) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      const idx = this.callbacks.indexOf(cb);
      if (idx !== -1) this.callbacks.splice(idx, 1);
    };
  }
}
