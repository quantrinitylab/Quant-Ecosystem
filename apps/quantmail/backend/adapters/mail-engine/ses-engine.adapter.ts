import { sendViaSes, isSesConfigured, type SesAttachment } from '../../lib/ses-sender';
import type {
  IMailEngineAdapter,
  OutboundMailPayload,
  TransactionalMailPayload,
  DeliveryReceipt,
  MailboxAccount,
  MailEnginePingResult,
} from './mail-engine.interface';

export interface SesEngineAdapterOptions {
  defaultFrom?: string;
}

export class SesMailEngineAdapter implements IMailEngineAdapter {
  readonly name = 'ses';

  constructor(private readonly options: SesEngineAdapterOptions = {}) {}

  async send(payload: OutboundMailPayload): Promise<DeliveryReceipt> {
    const fromAddress =
      payload.from ||
      this.options.defaultFrom ||
      process.env['MAIL_FROM_ADDRESS'] ||
      'noreply@quantmail.app';
    const from = payload.fromName ? `${payload.fromName} <${fromAddress}>` : fromAddress;

    const attachments: SesAttachment[] | undefined = payload.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
    }));

    try {
      const messageId = await sendViaSes({
        from,
        to: payload.to,
        cc: payload.cc && payload.cc.length > 0 ? payload.cc : undefined,
        bcc: payload.bcc && payload.bcc.length > 0 ? payload.bcc : undefined,
        subject: payload.subject,
        bodyText: payload.bodyText,
        bodyHtml: payload.bodyHtml,
        replyTo: payload.replyTo ?? fromAddress,
        attachments,
      });

      const allRecipients = [...payload.to, ...(payload.cc ?? []), ...(payload.bcc ?? [])];
      return {
        messageId,
        emailId: payload.emailId,
        deliveryStatus: 'accepted',
        recipients: allRecipients.map((recipient) => ({
          recipient,
          status: 'accepted',
          smtpResponse: '250 2.0.0 OK (AWS SES)',
        })),
        rawResponse: messageId,
      };
    } catch (err) {
      const errorMsg = (err as Error).message;
      const allRecipients = [...payload.to, ...(payload.cc ?? []), ...(payload.bcc ?? [])];
      return {
        messageId: payload.messageId ?? `err-${Date.now()}`,
        emailId: payload.emailId,
        deliveryStatus: 'failed',
        recipients: allRecipients.map((recipient) => ({
          recipient,
          status: 'failed',
          smtpResponse: `550 AWS SES error: ${errorMsg}`,
        })),
        rawResponse: err,
      };
    }
  }

  async sendTransactional(payload: TransactionalMailPayload): Promise<DeliveryReceipt> {
    const to = Array.isArray(payload.to) ? payload.to : [payload.to];
    return this.send({
      from:
        payload.from ??
        this.options.defaultFrom ??
        process.env['MAIL_FROM_ADDRESS'] ??
        'noreply@quantmail.app',
      fromName: payload.fromName,
      to,
      subject: payload.subject,
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml,
      replyTo: payload.replyTo,
      attachments: payload.attachments,
      headers: payload.headers,
      messageId: payload.messageId,
    });
  }

  async provisionMailbox(
    account: MailboxAccount,
  ): Promise<{ success: boolean; principalId?: string; error?: string }> {
    // AWS SES is an external MTA delivery provider, not a local IMAP/JMAP mailbox host.
    // Provisioning is a no-op for unified domain lifecycle symmetry.
    return {
      success: true,
      principalId: account.email,
    };
  }

  async ping(): Promise<MailEnginePingResult> {
    const start = Date.now();
    const configured = isSesConfigured();
    return {
      ok: configured,
      latencyMs: Date.now() - start,
      details: {
        configured,
        region: process.env['AWS_REGION'] ?? 'us-east-1',
      },
    };
  }
}
