// ============================================================================
// Email Sender - Nodemailer based outbound email
// ============================================================================

import { createTransport, type Transporter } from 'nodemailer';
import { z } from 'zod';

export const SendEmailOptionsSchema = z.object({
  from: z.string().email(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string(),
  html: z.string().optional(),
  text: z.string().optional(),
  replyTo: z.string().email().optional(),
});

export type SendEmailOptions = z.infer<typeof SendEmailOptionsSchema>;

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailSenderConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
}

/**
 * EmailSender - Sends outbound email via SMTP using Nodemailer
 *
 * Defaults to Mailhog settings (localhost:1025) in development.
 * Production config is loaded from environment variables.
 */
export class EmailSender {
  private transporter: Transporter;

  constructor(config?: EmailSenderConfig) {
    const host = config?.host ?? process.env['SMTP_HOST'] ?? 'localhost';
    const port = config?.port ?? Number(process.env['SMTP_PORT'] ?? 1025);
    const secure = config?.secure ?? false;

    this.transporter = createTransport({
      host,
      port,
      secure,
      auth: config?.auth,
    });
  }

  async send(options: SendEmailOptions): Promise<SendResult> {
    try {
      const validated = SendEmailOptionsSchema.parse(options);

      const info = await this.transporter.sendMail({
        from: validated.from,
        to: Array.isArray(validated.to) ? validated.to.join(', ') : validated.to,
        subject: validated.subject,
        html: validated.html,
        text: validated.text,
        replyTo: validated.replyTo,
      });

      return {
        success: true,
        messageId: info.messageId as string | undefined,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: message };
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch {
      return false;
    }
  }
}
