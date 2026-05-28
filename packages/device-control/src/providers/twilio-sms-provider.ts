import type { SMSCapability, SmsMessage } from '../capabilities/sms.js';
import type { TwilioConfig } from './types.js';
import { MessageStore } from './message-store.js';
import { SMSWebhookHandler } from './sms-webhook-handler.js';

export interface TwilioSMSClientLike {
  messages: {
    create(opts: { to: string; from: string; body: string }): Promise<{ sid: string }>;
  };
}

export class TwilioSMSProvider implements SMSCapability {
  readonly capability = 'sms' as const;
  private liveMode: boolean;
  private client: TwilioSMSClientLike | null;
  private config: TwilioConfig | null;
  private store = new MessageStore();
  private webhookHandler: SMSWebhookHandler | null = null;
  private msgCounter = 0;

  constructor(config?: TwilioConfig, client?: TwilioSMSClientLike) {
    const accountSid = config?.accountSid ?? process.env['TWILIO_ACCOUNT_SID'];
    const authToken = config?.authToken ?? process.env['TWILIO_AUTH_TOKEN'];
    const fromNumber = config?.fromNumber ?? process.env['TWILIO_FROM_NUMBER'];

    if (accountSid && authToken && fromNumber) {
      this.liveMode = true;
      this.config = {
        accountSid,
        authToken,
        fromNumber,
        statusCallbackUrl: config?.statusCallbackUrl,
      };
      this.client = client ?? null;
      this.webhookHandler = new SMSWebhookHandler(
        { authToken, webhookUrl: config?.statusCallbackUrl ?? '' },
        this.store,
      );
    } else {
      this.liveMode = false;
      this.config = null;
      this.client = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async initialize(): Promise<void> {
    if (this.liveMode && !this.client && this.config) {
      const { default: Twilio } = await import('twilio');
      this.client = (Twilio as unknown as (sid: string, token: string) => TwilioSMSClientLike)(
        this.config.accountSid,
        this.config.authToken,
      );
    }
  }

  dispose(): void {
    this.client = null;
  }

  async sendSMS(to: string, body: string): Promise<string> {
    if (this.liveMode && this.client && this.config) {
      const result = await this.client.messages.create({ to, from: this.config.fromNumber, body });
      this.store.store({
        id: result.sid,
        from: this.config.fromNumber,
        to,
        body,
        timestamp: Date.now(),
        status: 'sent',
        direction: 'outbound',
      });
      return result.sid;
    }
    const sid = `SM_mock_${++this.msgCounter}`;
    this.store.store({
      id: sid,
      from: 'mock-from',
      to,
      body,
      timestamp: Date.now(),
      status: 'sent',
      direction: 'outbound',
    });
    return sid;
  }

  async readSMS(id: string): Promise<SmsMessage> {
    const msg = this.store.get(id);
    if (!msg) throw new Error(`Message not found: ${id}`);
    return { id: msg.id, from: msg.from, body: msg.body, timestamp: msg.timestamp };
  }

  onIncomingSMS(cb: (msg: SmsMessage) => void): () => void {
    if (this.webhookHandler) {
      return this.webhookHandler.onIncoming(cb);
    }
    // Mock mode: no webhook handler, just return no-op unsubscribe
    return () => {
      /* no-op */
    };
  }

  getStore(): MessageStore {
    return this.store;
  }

  getWebhookHandler(): SMSWebhookHandler | null {
    return this.webhookHandler;
  }
}
