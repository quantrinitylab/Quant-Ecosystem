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

export interface StalwartEngineAdapterOptions {
  /** Base URL for Stalwart server, e.g. "http://localhost:8080" */
  baseUrl?: string;
  /** Admin / API token for management and JMAP authentication */
  apiToken?: string;
  /** Default account ID or email for JMAP session (optional; discovered if not provided) */
  accountId?: string;
  /** Fallback SMTP host (defaults to parsed host from baseUrl or 'localhost') */
  smtpHost?: string;
  /** Fallback SMTP port (default 587 or 25) */
  smtpPort?: number;
  /** Fallback SMTP username */
  smtpUser?: string;
  /** Fallback SMTP password */
  smtpPassword?: string;
  /** Whether to fallback to SMTP when JMAP fails (default true) */
  fallbackToSmtp?: boolean;
  /** HELO hostname for SMTP */
  heloName?: string;
  /** Default from address */
  defaultFrom?: string;
  /** Custom SmtpTransport for tests/injection */
  smtpTransport?: SmtpTransport;
  /** Custom fetch implementation for tests/mocking */
  fetchFn?: typeof fetch;
}

export interface JmapSession {
  capabilities: Record<string, unknown>;
  accounts: Record<
    string,
    {
      name: string;
      isPersonal?: boolean;
      isReadOnly?: boolean;
      accountCapabilities?: Record<string, unknown>;
    }
  >;
  primaryAccounts?: Record<string, string>;
  apiUrl: string;
  downloadUrl?: string;
  uploadUrl?: string;
  state?: string;
}

export class StalwartMailEngineAdapter implements IMailEngineAdapter {
  readonly name = 'stalwart';
  private readonly baseUrl: string;
  private readonly apiToken?: string;
  private readonly accountId?: string;
  private readonly smtpHost: string;
  private readonly smtpPort: number;
  private readonly smtpUser?: string;
  private readonly smtpPassword?: string;
  private readonly fallbackToSmtp: boolean;
  private readonly heloName: string;
  private readonly defaultFrom: string;
  private readonly smtpTransport: SmtpTransport;
  private readonly fetchFn: typeof fetch;

  private cachedSession: JmapSession | null = null;
  private sessionPromise: Promise<JmapSession> | null = null;

  constructor(options: StalwartEngineAdapterOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env['STALWART_URL'] ??
      process.env['STALWART_JMAP_URL'] ??
      'http://localhost:8080'
    ).replace(/\/+$/, '');

    this.apiToken =
      options.apiToken ??
      process.env['STALWART_API_TOKEN'] ??
      process.env['STALWART_ADMIN_SECRET'];

    this.accountId =
      options.accountId ?? process.env['STALWART_ACCOUNT_ID'];

    let parsedHost = 'localhost';
    try {
      parsedHost = new URL(this.baseUrl).hostname;
    } catch {
      // Keep localhost default
    }

    this.smtpHost =
      options.smtpHost ??
      process.env['STALWART_SMTP_HOST'] ??
      parsedHost;

    this.smtpPort =
      options.smtpPort ??
      Number(
        process.env['STALWART_SMTP_PORT'] ??
          process.env['SMTP_PORT'] ??
          587,
      );

    this.smtpUser =
      options.smtpUser ??
      process.env['STALWART_SMTP_USER'] ??
      process.env['SMTP_USER'];

    this.smtpPassword =
      options.smtpPassword ??
      process.env['STALWART_SMTP_PASSWORD'] ??
      process.env['SMTP_PASSWORD'];

    this.fallbackToSmtp =
      options.fallbackToSmtp ??
      process.env['STALWART_FALLBACK_TO_SMTP'] !== 'false';

    this.heloName =
      options.heloName ?? process.env['SMTP_HELO_NAME'] ?? 'quantmail.local';

    this.defaultFrom =
      options.defaultFrom ??
      process.env['MAIL_FROM_ADDRESS'] ??
      'noreply@quantmail.app';

    this.smtpTransport =
      options.smtpTransport ?? new NetSmtpTransport(this.heloName);

    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Discover or retrieve the cached JMAP session (RFC 8620 §2).
   */
  async getSession(forceRefresh = false): Promise<JmapSession> {
    if (this.cachedSession && !forceRefresh) {
      return this.cachedSession;
    }
    if (this.sessionPromise && !forceRefresh) {
      return this.sessionPromise;
    }

    this.sessionPromise = (async () => {
      const wellKnownUrl = `${this.baseUrl}/.well-known/jmap`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }

      const res = await this.fetchFn(wellKnownUrl, {
        method: 'GET',
        headers,
      });

      if (!res.ok) {
        throw new Error(
          `JMAP session discovery failed at ${wellKnownUrl}: ${res.status} ${res.statusText}`,
        );
      }

      const session = (await res.json()) as JmapSession;
      if (!session.apiUrl) {
        throw new Error('JMAP session missing required apiUrl endpoint');
      }

      // If apiUrl is relative, resolve against baseUrl
      if (session.apiUrl.startsWith('/')) {
        session.apiUrl = `${this.baseUrl}${session.apiUrl}`;
      }

      this.cachedSession = session;
      return session;
    })();

    try {
      return await this.sessionPromise;
    } finally {
      this.sessionPromise = null;
    }
  }

  /**
   * Send an email via JMAP (RFC 8620 / RFC 8621 / RFC 8622).
   * Creates the Email draft and submits it via EmailSubmission in one batch.
   */
  private async sendViaJmap(
    payload: OutboundMailPayload,
    session: JmapSession,
  ): Promise<DeliveryReceipt> {
    const fromAddress = payload.from || this.defaultFrom;
    const accountId =
      this.accountId ??
      session.primaryAccounts?.['urn:ietf:params:jmap:mail'] ??
      session.primaryAccounts?.['urn:ietf:params:jmap:submission'] ??
      Object.keys(session.accounts || {})[0] ??
      'default';

    const draftKey = `draft-${Date.now()}`;
    const subKey = `sub-${Date.now()}`;

    const bodyValues: Record<string, { value: string }> = {};
    const textBody: Array<{ partId: string; type: string }> = [];
    const htmlBody: Array<{ partId: string; type: string }> = [];

    if (payload.bodyText) {
      bodyValues['text1'] = { value: payload.bodyText };
      textBody.push({ partId: 'text1', type: 'text/plain' });
    }
    if (payload.bodyHtml) {
      bodyValues['html1'] = { value: payload.bodyHtml };
      htmlBody.push({ partId: 'html1', type: 'text/html' });
    }

    const emailObject: Record<string, unknown> = {
      from: [{ name: payload.fromName, email: fromAddress }],
      to: payload.to.map((email) => ({ email })),
      subject: payload.subject,
      bodyValues: Object.keys(bodyValues).length > 0 ? bodyValues : undefined,
      textBody: textBody.length > 0 ? textBody : undefined,
      htmlBody: htmlBody.length > 0 ? htmlBody : undefined,
    };

    if (payload.cc && payload.cc.length > 0) {
      emailObject['cc'] = payload.cc.map((email) => ({ email }));
    }
    if (payload.bcc && payload.bcc.length > 0) {
      emailObject['bcc'] = payload.bcc.map((email) => ({ email }));
    }
    if (payload.replyTo) {
      emailObject['replyTo'] = [{ email: payload.replyTo }];
    }
    if (payload.inReplyTo) {
      emailObject['inReplyTo'] = [payload.inReplyTo];
    }
    if (payload.references) {
      emailObject['references'] = Array.isArray(payload.references)
        ? payload.references
        : [payload.references];
    }
    if (payload.messageId) {
      emailObject['messageId'] = [payload.messageId];
    }

    const allRecipients = [
      ...payload.to,
      ...(payload.cc ?? []),
      ...(payload.bcc ?? []),
    ];

    const submissionObject = {
      emailId: `#${draftKey}`,
      envelope: {
        mailFrom: { email: fromAddress },
        rcptTo: allRecipients.map((email) => ({ email })),
      },
    };

    const jmapPayload = {
      using: [
        'urn:ietf:params:jmap:core',
        'urn:ietf:params:jmap:mail',
        'urn:ietf:params:jmap:submission',
      ],
      methodCalls: [
        [
          'Email/set',
          {
            accountId,
            create: {
              [draftKey]: emailObject,
            },
          },
          'c1',
        ],
        [
          'EmailSubmission/set',
          {
            accountId,
            create: {
              [subKey]: submissionObject,
            },
          },
          'c2',
        ],
      ],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    const res = await this.fetchFn(session.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(jmapPayload),
    });

    if (!res.ok) {
      throw new Error(
        `JMAP invocation failed on ${session.apiUrl}: ${res.status} ${res.statusText}`,
      );
    }

    const responseData = (await res.json()) as {
      methodResponses?: Array<[string, Record<string, unknown>, string]>;
    };

    const methodResponses = responseData.methodResponses || [];
    const emailSetRes = methodResponses.find((r) => r[0] === 'Email/set');
    const subSetRes = methodResponses.find((r) => r[0] === 'EmailSubmission/set');

    const emailSetPayload = emailSetRes?.[1] as
      | {
          created?: Record<string, { id: string }>;
          notCreated?: Record<string, { type: string; description?: string }>;
        }
      | undefined;

    const subSetPayload = subSetRes?.[1] as
      | {
          created?: Record<string, { id: string }>;
          notCreated?: Record<string, { type: string; description?: string }>;
        }
      | undefined;

    if (emailSetPayload?.notCreated?.[draftKey]) {
      const err = emailSetPayload.notCreated[draftKey];
      throw new Error(
        `JMAP Email/set error: ${err.type} - ${err.description ?? 'unknown error'}`,
      );
    }

    if (subSetPayload?.notCreated?.[subKey]) {
      const err = subSetPayload.notCreated[subKey];
      throw new Error(
        `JMAP EmailSubmission/set error: ${err.type} - ${err.description ?? 'unknown error'}`,
      );
    }

    const createdEmailId = emailSetPayload?.created?.[draftKey]?.id;
    const createdSubId = subSetPayload?.created?.[subKey]?.id;

    const messageId =
      createdSubId ?? createdEmailId ?? payload.messageId ?? `jmap-${randomUUID()}`;

    return {
      messageId,
      emailId: payload.emailId,
      deliveryStatus: 'accepted',
      recipients: allRecipients.map((r) => ({
        recipient: r,
        status: 'accepted',
        smtpResponse: '250 2.0.0 JMAP EmailSubmission OK',
      })),
      rawResponse: responseData,
    };
  }

  /**
   * Fallback SMTP submission via NetSmtpTransport.
   */
  private async sendViaSmtpFallback(
    payload: OutboundMailPayload,
    reason: string,
  ): Promise<DeliveryReceipt> {
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
        const res = await this.smtpTransport.send({
          mxHost: this.smtpHost,
          port: this.smtpPort,
          from: fromAddress,
          recipient,
          rawMessage,
          auth:
            this.smtpUser && this.smtpPassword
              ? { user: this.smtpUser, pass: this.smtpPassword }
              : undefined,
          secure: this.smtpPort === 465,
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
          smtpResponse: `${res.response} (Stalwart SMTP fallback: ${reason})`,
        });
      } catch (err) {
        receipts.push({
          recipient,
          status: 'failed',
          smtpResponse: `550 SMTP fallback error: ${(err as Error).message}`,
        });
      }
    }

    const deliveryStatus = anyAccepted
      ? 'accepted'
      : anyDeferred
        ? 'deferred'
        : 'failed';

    return {
      messageId: payload.messageId ?? `<${randomUUID()}@${this.heloName}>`,
      emailId: payload.emailId,
      deliveryStatus,
      recipients: receipts,
      rawResponse: { fallbackReason: reason },
    };
  }

  async send(payload: OutboundMailPayload): Promise<DeliveryReceipt> {
    try {
      const session = await this.getSession();
      return await this.sendViaJmap(payload, session);
    } catch (jmapError) {
      const reason = (jmapError as Error).message;
      if (this.fallbackToSmtp) {
        return this.sendViaSmtpFallback(payload, reason);
      }
      const allRecipients = [
        ...payload.to,
        ...(payload.cc ?? []),
        ...(payload.bcc ?? []),
      ];
      return {
        messageId: payload.messageId ?? `err-${Date.now()}`,
        emailId: payload.emailId,
        deliveryStatus: 'failed',
        recipients: allRecipients.map((r) => ({
          recipient: r,
          status: 'failed',
          smtpResponse: `550 Stalwart JMAP delivery error: ${reason}`,
        })),
        rawResponse: jmapError,
      };
    }
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

  /**
   * Provision mailbox/principal via Stalwart Management REST API (/api/principal).
   */
  async provisionMailbox(
    account: MailboxAccount,
  ): Promise<{ success: boolean; principalId?: string; error?: string }> {
    const principalUrl = `${this.baseUrl}/api/principal`;
    const username = account.name ?? account.email.split('@')[0];

    const body = {
      type: account.type ?? 'individual',
      name: username,
      emails: [account.email],
      secrets: account.secret ? [account.secret] : [],
      quota: account.quota ?? 0,
      roles: account.roles ?? ['user'],
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    try {
      const res = await this.fetchFn(principalUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok || res.status === 201 || res.status === 204) {
        return { success: true, principalId: account.email };
      }

      // If already exists (409), treat as success or update
      if (res.status === 409) {
        return { success: true, principalId: account.email };
      }

      const text = await res.text();
      return {
        success: false,
        error: `Stalwart provisioning returned ${res.status}: ${text}`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Stalwart principal provisioning network error: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Check Stalwart server health via /.well-known/jmap.
   */
  async ping(): Promise<MailEnginePingResult> {
    const start = Date.now();
    try {
      const pingUrl = `${this.baseUrl}/.well-known/jmap`;
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (this.apiToken) {
        headers['Authorization'] = `Bearer ${this.apiToken}`;
      }

      const res = await this.fetchFn(pingUrl, {
        method: 'GET',
        headers,
      });

      const latencyMs = Date.now() - start;
      const ok = res.status < 500;
      return {
        ok,
        latencyMs,
        details: {
          status: res.status,
          url: pingUrl,
        },
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: (err as Error).message,
      };
    }
  }
}
