import { randomUUID } from 'node:crypto';
import {
  NetSmtpTransport,
  type SmtpTransport,
} from '../../services/delivery-worker.service';
import { buildRawMimeMessage } from '../../lib/ses-sender';
import type {
  IMailEngineAdapter,
  OutboundMailPayload,
  TransactionalMailPayload,
  DeliveryReceipt,
  RecipientReceipt,
  MailboxAccount,
  MailEnginePingResult,
} from './mail-engine.interface';

export interface SmtpRelayAdapterOptions {
  host?: string;
  port?: number;
  user?: string;
  pass?: string;
  secure?: boolean;
  heloName?: string;
  defaultFrom?: string;
}

export class SmtpRelayMailEngineAdapter implements IMailEngineAdapter {
  readonly name = 'smtp_relay';
  private readonly host: string;
  private readonly port: number;
  private readonly user?: string;
  private readonly pass?: string;
  private readonly secure: boolean;
  private readonly heloName: string;
  private readonly defaultFrom: string;
  private readonly transport: SmtpTransport;

  constructor(
    options: SmtpRelayAdapterOptions = {},
    transport?: SmtpTransport,
  ) {
    this.host =
      options.host ??
      process.env['SMTP_RELAY_HOST'] ??
      process.env['SMTP_HOST'] ??
      'localhost';
    this.port =
      options.port ??
      Number(process.env['SMTP_RELAY_PORT'] ?? process.env['SMTP_PORT'] ?? 587);
    this.user = options.user ?? process.env['SMTP_RELAY_USER'] ?? process.env['SMTP_USER'];
    this.pass =
      options.pass ?? process.env['SMTP_RELAY_PASSWORD'] ?? process.env['SMTP_PASSWORD'];
    this.secure =
      options.secure ??
      (this.port === 465 || process.env['SMTP_RELAY_SECURE'] === 'true');
    this.heloName =
      options.heloName ?? process.env['SMTP_HELO_NAME'] ?? 'quantmail.local';
    this.defaultFrom =
      options.defaultFrom ??
      process.env['MAIL_FROM_ADDRESS'] ??
      'noreply@quantmail.app';
    this.transport = transport ?? new NetSmtpTransport(this.heloName);
  }

  async send(payload: OutboundMailPayload): Promise<DeliveryReceipt> {
    const fromAddress = payload.from || this.defaultFrom;
    const from = payload.fromName ? `${payload.fromName} <${fromAddress}>` : fromAddress;

    const rawBuffer = buildRawMimeMessage({
      from,
      to: payload.to,
      cc: payload.cc,
      subject: payload.subject,
      bodyText: payload.bodyText,
      bodyHtml: payload.bodyHtml,
      replyTo: payload.replyTo ?? fromAddress,
      messageId: payload.messageId,
      attachments:
        payload.attachments?.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
        })) ?? [],
    });
    const rawMessage = rawBuffer.toString('utf8');

    const allRecipients = [
      ...payload.to,
      ...(payload.cc ?? []),
      ...(payload.bcc ?? []),
    ];
    const receipts: RecipientReceipt[] = [];
    let anyAccepted = false;
    let anyDeferred = false;

    for (const recipient of allRecipients) {
      try {
        const res = await this.transport.send({
          mxHost: this.host,
          port: this.port,
          from: fromAddress,
          recipient,
          rawMessage,
          auth:
            this.user && this.pass ? { user: this.user, pass: this.pass } : undefined,
          secure: this.secure,
        });

        const status: RecipientReceipt['status'] =
          res.outcome === 'accepted'
            ? 'accepted'
            : res.outcome === 'deferred'
              ? 'deferred'
              : 'bounced';

        if (res.outcome === 'accepted') anyAccepted = true;
        if (res.outcome === 'deferred') anyDeferred = true;

        receipts.push({
          recipient,
          status,
          smtpResponse: res.response,
        });
      } catch (err) {
        receipts.push({
          recipient,
          status: 'failed',
          smtpResponse: `550 Transport error: ${(err as Error).message}`,
        });
      }
    }

    const deliveryStatus = anyAccepted
      ? 'accepted'
      : anyDeferred
        ? 'deferred'
        : 'failed';

    const messageId =
      payload.messageId ?? `<${randomUUID()}@${this.heloName}>`;

    return {
      messageId,
      emailId: payload.emailId,
      deliveryStatus,
      recipients: receipts,
    };
  }

  async sendTransactional(payload: TransactionalMailPayload): Promise<DeliveryReceipt> {
    const to = Array.isArray(payload.to) ? payload.to : [payload.to];
    return this.send({
      from: payload.from ?? this.defaultFrom,
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
    // SMTP relay submission forwards to upstream relay; local mailbox provisioning is not applicable.
    return {
      success: true,
      principalId: account.email,
    };
  }

  async ping(): Promise<MailEnginePingResult> {
    const start = Date.now();
    return {
      ok: Boolean(this.host),
      latencyMs: Date.now() - start,
      details: {
        host: this.host,
        port: this.port,
        secure: this.secure,
        authenticated: Boolean(this.user && this.pass),
      },
    };
  }
}
