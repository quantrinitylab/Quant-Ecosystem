// ============================================================================
// SMTP Inbound Server - Receives and parses inbound email
// ============================================================================

import { SMTPServer } from 'smtp-server';
import { simpleParser } from 'mailparser';
import { z } from 'zod';
import type { Readable } from 'node:stream';

export const SmtpConfigSchema = z.object({
  port: z.number().int().positive().default(2525),
  host: z.string().default('0.0.0.0'),
  secure: z.boolean().default(false),
  authOptional: z.boolean().default(true),
  maxMessageSize: z
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
});

export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;

export interface ParsedEmail {
  from: string;
  to: string[];
  subject: string;
  html: string | null;
  text: string | null;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    content: Buffer;
  }>;
  messageId: string | null;
  inReplyTo: string | null;
  date: Date | null;
}

export type EmailHandler = (email: ParsedEmail) => Promise<void>;

/**
 * SmtpInboundServer - Accepts inbound email via SMTP protocol
 *
 * Uses smtp-server for the SMTP protocol handling and mailparser
 * for parsing the raw email stream into structured data.
 */
export class SmtpInboundServer {
  private server: SMTPServer | null = null;
  private handler: EmailHandler | null = null;

  constructor(private readonly config: SmtpConfig) {}

  onMessage(handler: EmailHandler): void {
    this.handler = handler;
  }

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = new SMTPServer({
        secure: this.config.secure,
        authOptional: this.config.authOptional,
        size: this.config.maxMessageSize,
        onData: (stream: Readable, session: unknown, callback: (err?: Error | null) => void) => {
          void this.handleIncomingMessage(stream, session, callback);
        },
        onAuth: (
          _auth: unknown,
          _session: unknown,
          callback: (err: Error | null, response?: { user: string }) => void,
        ) => {
          callback(null, { user: 'anonymous' });
        },
      });

      this.server.on('error', (err: Error) => {
        reject(err);
      });

      this.server.listen(this.config.port, this.config.host, () => {
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleIncomingMessage(
    stream: Readable,
    _session: unknown,
    callback: (err?: Error | null) => void,
  ): Promise<void> {
    try {
      const parsed = await simpleParser(stream);

      const from = typeof parsed.from?.text === 'string' ? parsed.from.text : '';
      const toAddresses: string[] = [];

      if (parsed.to) {
        const toArray = Array.isArray(parsed.to) ? parsed.to : [parsed.to];
        for (const addr of toArray) {
          if ('text' in addr) {
            toAddresses.push(addr.text);
          }
        }
      }

      const email: ParsedEmail = {
        from,
        to: toAddresses,
        subject: parsed.subject ?? '',
        html: parsed.html || null,
        text: parsed.text ?? null,
        attachments: (parsed.attachments ?? []).map((att) => ({
          filename: att.filename ?? 'unnamed',
          contentType: att.contentType ?? 'application/octet-stream',
          size: att.size,
          content: att.content,
        })),
        messageId: parsed.messageId ?? null,
        inReplyTo: parsed.inReplyTo ?? null,
        date: parsed.date ?? null,
      };

      if (this.handler) {
        await this.handler(email);
      }

      callback(null);
    } catch (err) {
      callback(err instanceof Error ? err : new Error(String(err)));
    }
  }
}
