import { z } from 'zod';

export const SMTPConfigSchema = z.object({
  host: z.string(),
  port: z.number(),
  tls: z.boolean().default(true),
  username: z.string(),
  password: z.string(),
});

export type SMTPConfig = z.infer<typeof SMTPConfigSchema>;

export const SMTPOutboundMessageSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
  html: z.string().optional(),
  headers: z.record(z.string()).optional(),
});

export type SMTPOutboundMessage = z.infer<typeof SMTPOutboundMessageSchema>;

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface RelayStatus {
  connected: boolean;
  queueSize: number;
  lastSentAt: string | null;
  errorCount: number;
}

export class SMTPBridge {
  private connected = false;
  private queue: SMTPOutboundMessage[] = [];
  private sent: SMTPOutboundMessage[] = [];
  private lastSentAt: string | null = null;
  private errorCount = 0;

  connect(config: SMTPConfig): boolean {
    const parsed = SMTPConfigSchema.safeParse(config);
    if (!parsed.success) return false;

    this.connected = true;
    return true;
  }

  send(message: SMTPOutboundMessage): SendResult {
    if (!this.connected) {
      this.errorCount++;
      return {
        messageId: message.id,
        accepted: [],
        rejected: message.to,
        response: 'Not connected',
      };
    }

    this.sent.push(message);
    this.lastSentAt = new Date().toISOString();

    return {
      messageId: message.id,
      accepted: message.to,
      rejected: [],
      response: '250 OK',
    };
  }

  verify(address: string): boolean {
    if (!this.connected) return false;
    // Basic email validation
    return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(address);
  }

  getRelayStatus(): RelayStatus {
    return {
      connected: this.connected,
      queueSize: this.queue.length,
      lastSentAt: this.lastSentAt,
      errorCount: this.errorCount,
    };
  }

  queueMessage(message: SMTPOutboundMessage): string {
    this.queue.push(message);
    return message.id;
  }

  processQueue(): SendResult[] {
    if (!this.connected) return [];

    const results: SendResult[] = [];
    while (this.queue.length > 0) {
      const message = this.queue.shift()!;
      results.push(this.send(message));
    }

    return results;
  }

  disconnect(): void {
    this.connected = false;
  }

  getSentMessages(): SMTPOutboundMessage[] {
    return [...this.sent];
  }
}
