import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  StalwartMailEngineAdapter,
  SesMailEngineAdapter,
  SmtpRelayMailEngineAdapter,
  getMailEngineAdapter,
  createMailEngineAdapter,
  resetMailEngineAdapterCache,
  type OutboundMailPayload,
  type TransactionalMailPayload,
  type MailboxAccount,
} from '../adapters/mail-engine';
import * as sesSender from '../lib/ses-sender';
import type { SmtpTransport, SmtpDeliveryParams, SmtpResult } from '../services/delivery-worker.service';

describe('Mail Engine Adapters', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    resetMailEngineAdapterCache();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ==========================================================================
  // StalwartMailEngineAdapter Tests
  // ==========================================================================
  describe('StalwartMailEngineAdapter', () => {
    const mockJmapSession = {
      capabilities: {
        'urn:ietf:params:jmap:core': {},
        'urn:ietf:params:jmap:mail': {},
        'urn:ietf:params:jmap:submission': {},
      },
      accounts: {
        'acc-test-1': {
          name: 'test@quantmail.local',
          isPersonal: true,
        },
      },
      primaryAccounts: {
        'urn:ietf:params:jmap:mail': 'acc-test-1',
        'urn:ietf:params:jmap:submission': 'acc-test-1',
      },
      apiUrl: 'http://localhost:8080/jmap',
    };

    it('discovers and caches JMAP session via /.well-known/jmap', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockJmapSession,
      });

      const adapter = new StalwartMailEngineAdapter({
        baseUrl: 'http://localhost:8080',
        apiToken: 'secret-token-123',
        fetchFn: fetchMock as unknown as typeof fetch,
      });

      const session = await adapter.getSession();
      expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/.well-known/jmap', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer secret-token-123',
        },
      });
      expect(session.apiUrl).toBe('http://localhost:8080/jmap');
      expect(session.primaryAccounts?.['urn:ietf:params:jmap:mail']).toBe('acc-test-1');

      // Second call should return cached session without re-fetching
      await adapter.getSession();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('sends outbound email using Email/set and EmailSubmission/set', async () => {
      let callCount = 0;
      let jmapRequestBody: unknown;

      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        callCount++;
        if (url.includes('.well-known/jmap')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => mockJmapSession,
          });
        }
        if (url.includes('/jmap')) {
          jmapRequestBody = JSON.parse(init?.body as string);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              methodResponses: [
                [
                  'Email/set',
                  {
                    created: {
                      [Object.keys((jmapRequestBody as any).methodCalls[0][1].create)[0]]: {
                        id: 'stalwart-msg-456',
                      },
                    },
                  },
                  'c1',
                ],
                [
                  'EmailSubmission/set',
                  {
                    created: {
                      [Object.keys((jmapRequestBody as any).methodCalls[1][1].create)[0]]: {
                        id: 'stalwart-sub-789',
                      },
                    },
                  },
                  'c2',
                ],
              ],
            }),
          });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      const adapter = new StalwartMailEngineAdapter({
        baseUrl: 'http://localhost:8080',
        apiToken: 'token-xyz',
        fetchFn: fetchMock as unknown as typeof fetch,
      });

      const payload: OutboundMailPayload = {
        from: 'sender@quantmail.app',
        fromName: 'Quant Sender',
        to: ['recipient@external.com'],
        cc: ['cc@external.com'],
        subject: 'JMAP Delivery Test',
        bodyText: 'Plain text content',
        bodyHtml: '<p>HTML content</p>',
        emailId: 'local-email-1',
      };

      const receipt = await adapter.send(payload);

      expect(receipt.deliveryStatus).toBe('accepted');
      expect(receipt.messageId).toBe('stalwart-sub-789');
      expect(receipt.emailId).toBe('local-email-1');
      expect(receipt.recipients).toHaveLength(2);
      expect(receipt.recipients[0]?.recipient).toBe('recipient@external.com');
      expect(receipt.recipients[0]?.status).toBe('accepted');
      expect(receipt.recipients[1]?.recipient).toBe('cc@external.com');

      // Verify JMAP method call payloads
      const req = jmapRequestBody as any;
      expect(req.using).toContain('urn:ietf:params:jmap:mail');
      expect(req.using).toContain('urn:ietf:params:jmap:submission');
      expect(req.methodCalls[0][0]).toBe('Email/set');
      expect(req.methodCalls[1][0]).toBe('EmailSubmission/set');
    });

    it('falls back to SMTP submission when JMAP fails and fallbackToSmtp is true', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('JMAP connection refused'));

      const mockTransport: SmtpTransport = {
        send: vi.fn().mockResolvedValue({
          outcome: 'accepted',
          response: '250 2.0.0 OK queued as 99999',
        } as SmtpResult),
      };

      const adapter = new StalwartMailEngineAdapter({
        baseUrl: 'http://localhost:8080',
        fallbackToSmtp: true,
        smtpHost: 'mail.internal',
        smtpPort: 587,
        smtpUser: 'relay-user',
        smtpPassword: 'relay-password',
        fetchFn: fetchMock as unknown as typeof fetch,
        smtpTransport: mockTransport,
      });

      const payload: OutboundMailPayload = {
        from: 'sender@quantmail.app',
        to: ['fallback@external.com'],
        subject: 'SMTP Fallback Test',
        bodyText: 'Fallback body',
      };

      const receipt = await adapter.send(payload);

      expect(receipt.deliveryStatus).toBe('accepted');
      expect(mockTransport.send).toHaveBeenCalledTimes(1);
      const sendParams = vi.mocked(mockTransport.send).mock.calls[0]![0];
      expect(sendParams.mxHost).toBe('mail.internal');
      expect(sendParams.port).toBe(587);
      expect(sendParams.recipient).toBe('fallback@external.com');
      expect(sendParams.auth).toEqual({ user: 'relay-user', pass: 'relay-password' });
      expect(receipt.recipients[0]?.smtpResponse).toContain('Stalwart SMTP fallback');
    });

    it('provisions a mailbox principal via REST /api/principal', async () => {
      let principalUrlCalled = '';
      let requestBody: any;
      let authHeader = '';

      const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        principalUrlCalled = url;
        authHeader = (init?.headers as any)?.Authorization;
        requestBody = JSON.parse(init?.body as string);
        return Promise.resolve({
          ok: true,
          status: 201,
          text: async () => 'Created',
        });
      });

      const adapter = new StalwartMailEngineAdapter({
        baseUrl: 'http://localhost:8080',
        apiToken: 'admin-secret-token',
        fetchFn: fetchMock as unknown as typeof fetch,
      });

      const account: MailboxAccount = {
        email: 'alice@quantmail.app',
        name: 'alice',
        secret: 'hash-password-123',
        quota: 5368709120, // 5 GB
        roles: ['user', 'mailbox'],
      };

      const result = await adapter.provisionMailbox(account);

      expect(result.success).toBe(true);
      expect(result.principalId).toBe('alice@quantmail.app');
      expect(principalUrlCalled).toBe('http://localhost:8080/api/principal');
      expect(authHeader).toBe('Bearer admin-secret-token');
      expect(requestBody.name).toBe('alice');
      expect(requestBody.emails).toEqual(['alice@quantmail.app']);
      expect(requestBody.secrets).toEqual(['hash-password-123']);
      expect(requestBody.quota).toBe(5368709120);
    });

    it('pings the Stalwart server health via /.well-known/jmap', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const adapter = new StalwartMailEngineAdapter({
        baseUrl: 'http://localhost:8080',
        fetchFn: fetchMock as unknown as typeof fetch,
      });

      const pingResult = await adapter.ping();
      expect(pingResult.ok).toBe(true);
      expect(pingResult.latencyMs).toBeGreaterThanOrEqual(0);
      expect(pingResult.details?.['status']).toBe(200);
    });
  });

  // ==========================================================================
  // SmtpRelayMailEngineAdapter Tests
  // ==========================================================================
  describe('SmtpRelayMailEngineAdapter', () => {
    it('transmits email over authenticated SMTP submission', async () => {
      const mockTransport: SmtpTransport = {
        send: vi.fn().mockResolvedValue({
          outcome: 'accepted',
          response: '250 2.0.0 Message accepted for delivery',
        } as SmtpResult),
      };

      const adapter = new SmtpRelayMailEngineAdapter(
        {
          host: 'relay.quantmail.internal',
          port: 587,
          user: 'smtp_user',
          pass: 'smtp_pass',
          heloName: 'mta.quantmail.app',
        },
        mockTransport,
      );

      const payload: OutboundMailPayload = {
        from: 'notifications@quantmail.app',
        fromName: 'Quant Alerts',
        to: ['user1@domain.com', 'user2@domain.com'],
        subject: 'Relay Alert',
        bodyText: 'Alert notification details',
      };

      const receipt = await adapter.send(payload);

      expect(receipt.deliveryStatus).toBe('accepted');
      expect(receipt.recipients).toHaveLength(2);
      expect(mockTransport.send).toHaveBeenCalledTimes(2);

      const firstCall = vi.mocked(mockTransport.send).mock.calls[0]![0];
      expect(firstCall.mxHost).toBe('relay.quantmail.internal');
      expect(firstCall.port).toBe(587);
      expect(firstCall.recipient).toBe('user1@domain.com');
      expect(firstCall.auth).toEqual({ user: 'smtp_user', pass: 'smtp_pass' });
      expect(firstCall.rawMessage).toContain('Subject: Relay Alert');
      expect(firstCall.rawMessage).toContain('From: Quant Alerts <notifications@quantmail.app>');
    });

    it('sends transactional mail with single or array recipient', async () => {
      const mockTransport: SmtpTransport = {
        send: vi.fn().mockResolvedValue({
          outcome: 'accepted',
          response: '250 OK',
        } as SmtpResult),
      };

      const adapter = new SmtpRelayMailEngineAdapter(
        { host: 'relay.local', port: 587 },
        mockTransport,
      );

      const payload: TransactionalMailPayload = {
        to: 'single@domain.com',
        from: 'system@domain.com',
        subject: 'Verification Code',
        bodyText: 'Code is 123456',
      };

      const receipt = await adapter.sendTransactional(payload);
      expect(receipt.deliveryStatus).toBe('accepted');
      expect(mockTransport.send).toHaveBeenCalledWith(
        expect.objectContaining({ recipient: 'single@domain.com' }),
      );
    });

    it('provisions mailbox as a no-op success and reports ping health', async () => {
      const adapter = new SmtpRelayMailEngineAdapter({ host: 'relay.local', port: 587 });
      const provision = await adapter.provisionMailbox({ email: 'box@relay.local' });
      expect(provision.success).toBe(true);

      const ping = await adapter.ping();
      expect(ping.ok).toBe(true);
      expect(ping.details?.['host']).toBe('relay.local');
      expect(ping.details?.['port']).toBe(587);
    });
  });

  // ==========================================================================
  // SesMailEngineAdapter Tests
  // ==========================================================================
  describe('SesMailEngineAdapter', () => {
    it('delegates outbound send to sendViaSes', async () => {
      const sendViaSesSpy = vi
        .spyOn(sesSender, 'sendViaSes')
        .mockResolvedValue('ses-message-id-12345');

      const adapter = new SesMailEngineAdapter({ defaultFrom: 'default@quantmail.app' });

      const payload: OutboundMailPayload = {
        from: 'custom@quantmail.app',
        fromName: 'Custom Sender',
        to: ['customer@example.com'],
        subject: 'SES Direct Send',
        bodyHtml: '<p>SES content</p>',
        attachments: [
          {
            filename: 'invoice.pdf',
            contentType: 'application/pdf',
            content: Buffer.from('pdf-data'),
          },
        ],
      };

      const receipt = await adapter.send(payload);

      expect(sendViaSesSpy).toHaveBeenCalledTimes(1);
      expect(sendViaSesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Custom Sender <custom@quantmail.app>',
          to: ['customer@example.com'],
          subject: 'SES Direct Send',
          bodyHtml: '<p>SES content</p>',
          attachments: [
            {
              filename: 'invoice.pdf',
              contentType: 'application/pdf',
              content: expect.any(Buffer),
            },
          ],
        }),
      );

      expect(receipt.deliveryStatus).toBe('accepted');
      expect(receipt.messageId).toBe('ses-message-id-12345');
      expect(receipt.recipients[0]?.status).toBe('accepted');
    });

    it('handles SES errors gracefully with failed deliveryStatus', async () => {
      vi.spyOn(sesSender, 'sendViaSes').mockRejectedValue(new Error('SES daily quota exceeded'));

      const adapter = new SesMailEngineAdapter();
      const receipt = await adapter.send({
        from: 'noreply@quantmail.app',
        to: ['dest@example.com'],
        subject: 'Failed SES',
        bodyText: 'Text',
      });

      expect(receipt.deliveryStatus).toBe('failed');
      expect(receipt.recipients[0]?.status).toBe('failed');
      expect(receipt.recipients[0]?.smtpResponse).toContain('SES daily quota exceeded');
    });

    it('checks ping using isSesConfigured', async () => {
      vi.spyOn(sesSender, 'isSesConfigured').mockReturnValue(true);

      const adapter = new SesMailEngineAdapter();
      const ping = await adapter.ping();
      expect(ping.ok).toBe(true);
      expect(ping.details?.['configured']).toBe(true);
    });
  });

  // ==========================================================================
  // getMailEngineAdapter Factory Tests
  // ==========================================================================
  describe('getMailEngineAdapter Factory', () => {
    it('defaults to SesMailEngineAdapter when MAIL_ENGINE_ADAPTER is unset', () => {
      delete process.env['MAIL_ENGINE_ADAPTER'];
      const adapter = getMailEngineAdapter();
      expect(adapter).toBeInstanceOf(SesMailEngineAdapter);
      expect(adapter.name).toBe('ses');
    });

    it('returns StalwartMailEngineAdapter when MAIL_ENGINE_ADAPTER=stalwart', () => {
      process.env['MAIL_ENGINE_ADAPTER'] = 'stalwart';
      const adapter = getMailEngineAdapter();
      expect(adapter).toBeInstanceOf(StalwartMailEngineAdapter);
      expect(adapter.name).toBe('stalwart');
    });

    it('returns SmtpRelayMailEngineAdapter when MAIL_ENGINE_ADAPTER=smtp_relay', () => {
      process.env['MAIL_ENGINE_ADAPTER'] = 'smtp_relay';
      const adapter = getMailEngineAdapter();
      expect(adapter).toBeInstanceOf(SmtpRelayMailEngineAdapter);
      expect(adapter.name).toBe('smtp_relay');
    });

    it('caches the adapter singleton', () => {
      process.env['MAIL_ENGINE_ADAPTER'] = 'ses';
      const first = getMailEngineAdapter();
      const second = getMailEngineAdapter();
      expect(first).toBe(second);
    });

    it('allows creating discrete adapter instances via createMailEngineAdapter', () => {
      const stalwart = createMailEngineAdapter('stalwart', { baseUrl: 'http://test:8080' });
      const smtp = createMailEngineAdapter('smtp_relay', { host: 'relay.test' });
      const ses = createMailEngineAdapter('ses');

      expect(stalwart).toBeInstanceOf(StalwartMailEngineAdapter);
      expect(smtp).toBeInstanceOf(SmtpRelayMailEngineAdapter);
      expect(ses).toBeInstanceOf(SesMailEngineAdapter);
    });
  });
});
