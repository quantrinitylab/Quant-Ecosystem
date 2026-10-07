// ============================================================================
// QuantChat — K23 QuantMeet surface: meetings route auth + LiveKit serverUrl
// ============================================================================
//
// The K23 surface adds GET /meetings/rooms (lobby's recent-meetings list) and
// extends POST /meetings/rooms/:id/join with the public SFU `serverUrl` so the
// frontend can open a real LiveKit room. Both routes must stay behind auth
// (fail-closed), and the server URL must be the configured one — never a
// client-supplied value.

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, getConfig } from '../app';
import type { AppConfig } from '@quant/server-core';
import { LiveKitGateway } from '../services/livekit-gateway.service';

vi.mock('livekit-server-sdk', () => {
  const RoomServiceClient = vi.fn().mockImplementation(function () {
    return {};
  });
  const EgressClient = vi.fn().mockImplementation(function () {
    return {};
  });
  const AccessToken = vi.fn().mockImplementation(function () {
    return { addGrant: vi.fn(), toJwt: vi.fn().mockResolvedValue('test-jwt') };
  });
  const WebhookReceiver = vi.fn().mockImplementation(function () {
    return { receive: vi.fn() };
  });
  return { RoomServiceClient, EgressClient, AccessToken, WebhookReceiver };
});

const testConfig: AppConfig = {
  ...getConfig(),
  port: 3003,
  host: '0.0.0.0',
  logLevel: 'silent',
  jwtSecret: 'test-secret-key-that-is-long-enough-for-hs256',
  jwtIssuer: 'quant-test',
  jwtAudience: 'quant-test-audience',
  env: 'test',
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(testConfig);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('K23 — GET /meetings/rooms (lobby recent meetings)', () => {
  it('rejects unauthenticated requests 401 (fail closed)', async () => {
    const res = await app.inject({ method: 'GET', url: '/meetings/rooms' });
    expect(res.statusCode).toBe(401);
  });
});

describe('K23 — POST /meetings/rooms (start instant meeting)', () => {
  it('rejects unauthenticated requests 401 (fail closed)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/meetings/rooms',
      payload: { name: 'x', settings: {} },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('K23 — POST /meetings/rooms/:id/join', () => {
  it('rejects unauthenticated requests 401 before any room lookup', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/meetings/rooms/does-not-exist/join',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('K23 — LiveKitGateway.getServerUrl()', () => {
  it('returns the configured SFU websocket URL', () => {
    const gateway = new LiveKitGateway({
      apiKey: 'test-key',
      apiSecret: 'secret',
      wsUrl: 'wss://livekit.example.test',
    });
    expect(gateway.getServerUrl()).toBe('wss://livekit.example.test');
  });

  it('is a server-side value, not influenced by any client input', () => {
    const gateway = new LiveKitGateway({
      apiKey: 'test-key',
      apiSecret: 'secret',
      wsUrl: 'wss://livekit.example.test',
    });
    // No setter exists — the URL cannot be overridden per request.
    expect(
      (gateway as unknown as Record<string, unknown>)['setServerUrl'],
    ).toBeUndefined();
    expect(gateway.getServerUrl()).toBe('wss://livekit.example.test');
  });
});
