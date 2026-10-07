// ============================================================================
// QuantAI — AgentLabs Webhook Action Dispatcher & Signature Verification Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import {
  generateHmacSignature,
  dispatchWebhook,
  getExecutionLogs,
  clearLogsForTesting,
  WebhookRequest,
} from '../services/webhook-dispatcher.service';

function mockJsonResponse(data: any, status = 200, statusText = 'OK'): Response {
  return new Response(JSON.stringify(data), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AgentLabs Webhook Dispatcher & Execution Retry Queue', () => {
  beforeEach(() => {
    clearLogsForTesting();
    vi.restoreAllMocks();
  });

  describe('HMAC SHA-256 Signature Generation', () => {
    it('produces the exact expected HMAC SHA-256 hex digest', () => {
      const payload = JSON.stringify({ event: 'agent.action', status: 'completed' });
      const secret = 'super-secret-key-12345';
      const expectedHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const signature = generateHmacSignature(payload, secret);
      expect(signature).toBe(expectedHex);
      expect(signature).toHaveLength(64);
    });

    it('generates different signatures for different secrets or payloads', () => {
      const payload1 = '{"data":1}';
      const payload2 = '{"data":2}';
      const secret = 'test-secret';

      expect(generateHmacSignature(payload1, secret)).not.toBe(
        generateHmacSignature(payload2, secret),
      );
    });
  });

  describe('dispatchWebhook execution & headers', () => {
    it('successfully dispatches on first attempt (200 OK) with HMAC & idempotency headers', async () => {
      const request: WebhookRequest = {
        id: 'req-001',
        agentId: 'agent-alpha',
        url: 'https://api.external.com/webhooks/action',
        method: 'POST',
        headers: { 'X-Custom-Client': 'QuantAI-Voice-Engine' },
        body: { customerId: 'cust-99', intent: 'payment_verified' },
        secretKey: 'key-xyz',
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValue(mockJsonResponse({ received: true, actionId: 'act-555' }, 200));

      const result = await dispatchWebhook(request, fetchMock as unknown as typeof fetch);

      expect(result.success).toBe(true);
      expect(result.requestId).toBe('req-001');
      expect(result.agentId).toBe('agent-alpha');
      expect(result.statusCode).toBe(200);
      expect(result.attemptCount).toBe(1);
      expect(result.responseBody).toEqual({ received: true, actionId: 'act-555' });
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(new Date(result.executedAt).getTime()).not.toBeNaN();

      // Verify headers passed to fetch
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://api.external.com/webhooks/action');
      expect(init.method).toBe('POST');

      const headers = init.headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Custom-Client']).toBe('QuantAI-Voice-Engine');
      expect(headers['X-Quant-Idempotency']).toBe('req-001');

      const expectedSignature = generateHmacSignature(JSON.stringify(request.body), 'key-xyz');
      expect(headers['X-Quant-Signature']).toBe(`sha256=${expectedSignature}`);
    });

    it('retries on 500 error up to maxRetries and records failed result if all retries fail', async () => {
      const request: WebhookRequest = {
        id: 'req-fail',
        agentId: 'agent-beta',
        url: 'https://api.external.com/fail',
        method: 'POST',
        body: { query: 'failing_call' },
        secretKey: 'secret-beta',
        maxRetries: 3,
        initialBackoffMs: 1, // Fast retry for tests
      };

      const fetchMock = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            mockJsonResponse({ error: 'Internal Server Error' }, 500, 'Server Error'),
          ),
        );

      const result = await dispatchWebhook(request, fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.attemptCount).toBe(3);
      expect(result.error).toContain('HTTP 500');
      expect(result.responseBody).toEqual({ error: 'Internal Server Error' });
    });

    it('successfully recovers on retry (fails first, succeeds second)', async () => {
      const request: WebhookRequest = {
        id: 'req-retry-success',
        agentId: 'agent-gamma',
        url: 'https://api.external.com/flaky',
        method: 'POST',
        body: { transfer: true },
        secretKey: 'gamma-key',
        maxRetries: 3,
        initialBackoffMs: 1,
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(mockJsonResponse({ error: 'Service Unavailable' }, 503))
        .mockResolvedValueOnce(mockJsonResponse({ transferred: true }, 200));

      const result = await dispatchWebhook(request, fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attemptCount).toBe(2);
      expect(result.responseBody).toEqual({ transferred: true });
    });

    it('retries on network exceptions (e.g. fetch failed) and recovers', async () => {
      const request: WebhookRequest = {
        id: 'req-net-err',
        agentId: 'agent-gamma',
        url: 'https://api.external.com/socket-timeout',
        method: 'POST',
        body: { ping: 'pong' },
        secretKey: 'key',
        maxRetries: 2,
        initialBackoffMs: 1,
      };

      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection reset by peer'))
        .mockResolvedValueOnce(mockJsonResponse({ ok: true }, 200));

      const result = await dispatchWebhook(request, fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(2);
      expect(result.responseBody).toEqual({ ok: true });
    });

    it('does not retry on 4xx client errors (e.g. 400 Bad Request)', async () => {
      const request: WebhookRequest = {
        id: 'req-400',
        agentId: 'agent-delta',
        url: 'https://api.external.com/bad-input',
        method: 'POST',
        body: { invalidField: -1 },
        secretKey: 'key',
        maxRetries: 3,
        initialBackoffMs: 1,
      };

      const fetchMock = vi
        .fn()
        .mockResolvedValue(mockJsonResponse({ error: 'Invalid schema' }, 400));

      const result = await dispatchWebhook(request, fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.attemptCount).toBe(1);
      expect(result.error).toContain('HTTP 400');
    });
  });

  describe('Audit Logging: getExecutionLogs and clearLogsForTesting', () => {
    it('records logs and filters correctly by agentId', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({ ok: true }));

      await dispatchWebhook(
        {
          id: 'log-1',
          agentId: 'agent-100',
          url: 'https://api.test/1',
          method: 'POST',
          body: {},
          secretKey: 's',
        },
        fetchMock as unknown as typeof fetch,
      );

      await dispatchWebhook(
        {
          id: 'log-2',
          agentId: 'agent-200',
          url: 'https://api.test/2',
          method: 'POST',
          body: {},
          secretKey: 's',
        },
        fetchMock as unknown as typeof fetch,
      );

      const allLogs = getExecutionLogs();
      expect(allLogs).toHaveLength(2);

      const agent100Logs = getExecutionLogs('agent-100');
      expect(agent100Logs).toHaveLength(1);
      expect(agent100Logs[0].requestId).toBe('log-1');

      const agent200Logs = getExecutionLogs('agent-200');
      expect(agent200Logs).toHaveLength(1);
      expect(agent200Logs[0].requestId).toBe('log-2');

      clearLogsForTesting();
      expect(getExecutionLogs()).toHaveLength(0);
    });
  });
});
