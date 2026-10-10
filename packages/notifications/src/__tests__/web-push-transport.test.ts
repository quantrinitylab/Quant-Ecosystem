// ============================================================================
// createWebPushSendHandler — the REAL Web Push transport (QM-UIUX-053).
//
// The handler is the boundary between this package and the `web-push`
// library: everything above it (WebPushService, QuantMail's push delivery) is
// tested against injected handlers, so THIS file pins the adapter itself —
// VAPID details are programmed from the config, a library success maps to a
// success result, a 404/410 rejection keeps its status code so callers can
// prune the dead subscription, and a transport error is reported as a
// failure, never dressed up as a delivery.
// ============================================================================

import { describe, it, expect, beforeEach, vi } from 'vitest';

const webPushMocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: webPushMocks.setVapidDetails,
    sendNotification: webPushMocks.sendNotification,
  },
}));

import { WebPushService, createWebPushSendHandler } from '../services/web-push-service';
import type { VapidConfig } from '../services/web-push-service';
import type { WebPushSubscription } from '../types';

const TEST_VAPID: VapidConfig = {
  subject: 'mailto:push@quantmail.in',
  publicKey: 'BTestPublicKey',
  privateKey: 'test-private-key',
};

const SUBSCRIPTION: WebPushSubscription = {
  userId: 'user-1',
  endpoint: 'https://push.example.com/subscription/abc123',
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  deviceId: 'device-1',
  registeredAt: 1_700_000_000_000,
  isActive: true,
};

describe('createWebPushSendHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('programs the VAPID details from the config', async () => {
    webPushMocks.sendNotification.mockResolvedValue({ statusCode: 201, body: '' });
    createWebPushSendHandler(TEST_VAPID);
    expect(webPushMocks.setVapidDetails).toHaveBeenCalledWith(
      'mailto:push@quantmail.in',
      'BTestPublicKey',
      'test-private-key',
    );
  });

  it('delivers through web-push and reports the real status code', async () => {
    webPushMocks.sendNotification.mockResolvedValue({ statusCode: 201, body: '' });
    const handler = createWebPushSendHandler(TEST_VAPID);

    const result = await handler(SUBSCRIPTION, '{"title":"Hi"}', { ttl: 3600, urgency: 'high' });

    expect(result).toEqual({
      success: true,
      endpoint: SUBSCRIPTION.endpoint,
      statusCode: 201,
    });
    const [subArg, payloadArg, optionsArg] = webPushMocks.sendNotification.mock.calls[0]!;
    expect(subArg).toEqual({ endpoint: SUBSCRIPTION.endpoint, keys: SUBSCRIPTION.keys });
    expect(payloadArg).toBe('{"title":"Hi"}');
    expect(optionsArg).toEqual({ TTL: 3600, urgency: 'high' });
  });

  it('preserves a 410 status code so the caller can prune the dead subscription', async () => {
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 });
    webPushMocks.sendNotification.mockRejectedValue(gone);
    const handler = createWebPushSendHandler(TEST_VAPID);

    const result = await handler(SUBSCRIPTION, '{}', {});

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(410);
    expect(result.endpoint).toBe(SUBSCRIPTION.endpoint);
    expect(result.error).toContain('Gone');
  });

  it('reports a transport error as a failure with no invented status code', async () => {
    webPushMocks.sendNotification.mockRejectedValue(new Error('socket hang up'));
    const handler = createWebPushSendHandler(TEST_VAPID);

    const result = await handler(SUBSCRIPTION, '{}', {});

    expect(result.success).toBe(false);
    expect(result.statusCode).toBeUndefined();
    expect(result.error).toBe('socket hang up');
  });
});

describe('WebPushService without a transport (QM-UIUX-053 honesty fix)', () => {
  it('never fabricates a success when VAPID is set but no send handler is wired', async () => {
    // Regression: the no-handler branch used to return
    // `{ success: true, statusCode: 201 }` — a delivery that never happened.
    const service = new WebPushService(TEST_VAPID);
    service.subscribe(SUBSCRIPTION);

    const results = await service.send('user-1', { title: 'Test', body: 'Hello' });

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(false);
    expect(results[0]!.error).toContain('transport not configured');
  });

  it('marks a subscription inactive when the transport reports 410', async () => {
    const service = new WebPushService(TEST_VAPID);
    service.setSendHandler(
      vi.fn().mockResolvedValue({
        success: false,
        endpoint: SUBSCRIPTION.endpoint,
        statusCode: 410,
        error: 'Gone',
      }),
    );
    service.subscribe(SUBSCRIPTION);

    await service.send('user-1', { title: 'Test', body: 'Hello' });

    expect(service.getSubscriptions('user-1')[0]!.isActive).toBe(false);
  });
});
