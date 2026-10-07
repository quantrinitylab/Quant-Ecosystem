import { z } from 'zod';
import { createHmac } from 'node:crypto';

export const SMTPMessageSchema = z.object({
  from: z.string().email(),
  to: z.array(z.string().email()),
  subject: z.string(),
  body: z.string(),
  headers: z.record(z.string()).optional(),
});

export type SMTPMessage = z.infer<typeof SMTPMessageSchema>;

export const DKIMConfigSchema = z.object({
  domain: z.string(),
  selector: z.string(),
  privateKey: z.string(),
});

export type DKIMConfig = z.infer<typeof DKIMConfigSchema>;

export interface RelayResult {
  messageId: string;
  status: 'queued' | 'sent' | 'failed';
  timestamp: number;
  dkimSigned: boolean;
  error?: string;
}

export class SMTPRelay {
  private dkimConfig: DKIMConfig | null = null;
  private outbox: RelayResult[] = [];
  private messageCounter = 0;

  configureDKIM(config: DKIMConfig): void {
    this.dkimConfig = DKIMConfigSchema.parse(config);
  }

  send(message: SMTPMessage): RelayResult {
    const parsed = SMTPMessageSchema.safeParse(message);
    if (!parsed.success) {
      return {
        messageId: '',
        status: 'failed',
        timestamp: Date.now(),
        dkimSigned: false,
        error: 'Invalid message: ' + parsed.error.message,
      };
    }

    const messageId = this.generateMessageId();
    const dkimSigned = this.dkimConfig !== null;

    const result: RelayResult = {
      messageId,
      status: 'queued',
      timestamp: Date.now(),
      dkimSigned,
    };

    this.outbox.push(result);
    return result;
  }

  /**
   * Generate a DKIM-like signature header for a message.
   *
   * NOTE: This is a simulation placeholder. Real DKIM uses RSA or Ed25519 asymmetric
   * signatures verified against a DNS TXT record. This implementation uses HMAC-SHA256
   * with the private key as a shared secret, which is NOT standards-compliant (RFC 6376).
   * Do not use in production mail delivery.
   */
  signDKIM(message: SMTPMessage): string | null {
    if (!this.dkimConfig) {
      return null;
    }

    const canonicalHeaders = [
      `from:${message.from}`,
      `to:${message.to.join(',')}`,
      `subject:${message.subject}`,
    ].join('\r\n');

    const bodyHash = createHmac('sha256', this.dkimConfig.privateKey)
      .update(message.body)
      .digest('base64');

    const headerHash = createHmac('sha256', this.dkimConfig.privateKey)
      .update(canonicalHeaders)
      .digest('base64');

    return [
      `v=1`,
      `a=hmac-sha256-sim`,
      `d=${this.dkimConfig.domain}`,
      `s=${this.dkimConfig.selector}`,
      `bh=${bodyHash}`,
      `b=${headerHash}`,
    ].join('; ');
  }

  getOutbox(): RelayResult[] {
    return [...this.outbox];
  }

  getStats(): { total: number; queued: number; sent: number; failed: number } {
    return {
      total: this.outbox.length,
      queued: this.outbox.filter((r) => r.status === 'queued').length,
      sent: this.outbox.filter((r) => r.status === 'sent').length,
      failed: this.outbox.filter((r) => r.status === 'failed').length,
    };
  }

  private generateMessageId(): string {
    return `<${++this.messageCounter}.${Date.now()}@quant.relay>`;
  }
}
