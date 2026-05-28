import { APIKeyManager } from '../auth/api-key-manager.js';
import { AgentMarketplace } from '../marketplace/agent-marketplace.js';
import { WebhookManager } from '../webhooks/webhook-manager.js';
import { DeveloperAppRegistry } from '../apps/developer-app-registry.js';
import { OAuthClientManager } from '../oauth/oauth-client-manager.js';
import { UsageAnalytics } from '../analytics/usage-analytics.js';
import { SDKTracker } from '../sdk/sdk-tracker.js';
import { createHmac } from 'node:crypto';

describe('APIKeyManager', () => {
  it('create, revoke, track usage, rate limit', () => {
    const m = new APIKeyManager();
    const k = m.create('test', 'free');
    expect(m.trackUsage(k.id)).toBe(true);
    expect(m.revoke(k.id)).toBe(true);
    expect(m.trackUsage(k.id)).toBe(false);
    const k2 = m.create('x', 'free');
    for (let i = 0; i < 10; i++) m.trackUsage(k2.id);
    expect(m.isRateLimited(k2.id)).toBe(true);
  });

  it('supports key scopes', () => {
    const m = new APIKeyManager();
    const k = m.create('scoped', 'pro', { scopes: ['/api/users', '/api/data'] });
    expect(m.trackUsage(k.id, '/api/users/list')).toBe(true);
    expect(m.trackUsage(k.id, '/api/data/export')).toBe(true);
    expect(m.trackUsage(k.id, '/api/admin/delete')).toBe(false);
  });

  it('wildcard scope allows all endpoints', () => {
    const m = new APIKeyManager();
    const k = m.create('admin', 'enterprise');
    expect(m.trackUsage(k.id, '/api/admin/anything')).toBe(true);
    expect(m.trackUsage(k.id, '/api/secret/path')).toBe(true);
  });

  it('key expiry auto-revokes on use', () => {
    const m = new APIKeyManager();
    const k = m.create('expiring', 'free', { ttlMs: -1 });
    expect(m.trackUsage(k.id)).toBe(false);
    expect(m.getKey(k.id)?.revokedAt).not.toBeNull();
  });

  it('rotates key with grace period', () => {
    const m = new APIKeyManager();
    const old = m.create('original', 'pro');
    const rotation = m.rotate(old.id, 'pro', 60000);
    expect(rotation).not.toBeNull();
    expect(rotation!.oldKeyId).toBe(old.id);
    expect(m.trackUsage(old.id)).toBe(true);
    expect(m.trackUsage(rotation!.newKeyId)).toBe(true);
    m.finalizeRotation(old.id);
    expect(m.trackUsage(old.id)).toBe(false);
    expect(m.trackUsage(rotation!.newKeyId)).toBe(true);
  });

  it('cannot rotate revoked key', () => {
    const m = new APIKeyManager();
    const k = m.create('dead', 'free');
    m.revoke(k.id);
    expect(m.rotate(k.id, 'free', 1000)).toBeNull();
  });
});

describe('AgentMarketplace', () => {
  it('publish, approve, list, revenue', () => {
    const mp = new AgentMarketplace();
    const ml = mp.publish({
      id: 'a1',
      name: 'Bot',
      rating: 4.5,
      downloads: 0,
      revenueSharePct: 80,
    });
    expect(ml.status).toBe('pending');
    expect(mp.getReviewQueue()).toHaveLength(1);
    mp.approve('a1');
    expect(mp.list()).toHaveLength(1);
    expect(mp.calculateRevenue('a1', 1000)).toEqual({ developer: 800, platform: 200 });
  });
});

describe('DeveloperAppRegistry', () => {
  it('registers and activates apps', () => {
    const reg = new DeveloperAppRegistry();
    const app = reg.register('MyApp', 'A cool app', 'owner1', ['http://localhost:3000/callback']);
    expect(app.status).toBe('under_review');
    reg.activate(app.id);
    expect(reg.getApp(app.id)?.status).toBe('active');
  });

  it('suspends apps', () => {
    const reg = new DeveloperAppRegistry();
    const app = reg.register('Bad App', 'Violator', 'owner1', []);
    reg.activate(app.id);
    reg.suspend(app.id);
    expect(reg.getApp(app.id)?.status).toBe('suspended');
  });

  it('transfers ownership but not for suspended apps', () => {
    const reg = new DeveloperAppRegistry();
    const app = reg.register('App', 'desc', 'owner1', []);
    reg.activate(app.id);
    expect(reg.transferOwnership(app.id, 'owner2')).toBe(true);
    expect(reg.getApp(app.id)?.ownerId).toBe('owner2');
    reg.suspend(app.id);
    expect(reg.transferOwnership(app.id, 'owner3')).toBe(false);
  });

  it('lists apps by owner', () => {
    const reg = new DeveloperAppRegistry();
    reg.register('A1', 'd', 'u1', []);
    reg.register('A2', 'd', 'u1', []);
    reg.register('A3', 'd', 'u2', []);
    expect(reg.getAppsByOwner('u1')).toHaveLength(2);
    expect(reg.getAppsByOwner('u2')).toHaveLength(1);
  });
});

describe('OAuthClientManager', () => {
  it('creates client with ID and secret', () => {
    const m = new OAuthClientManager();
    const client = m.createClient('TestApp', ['http://localhost/cb'], ['read', 'write']);
    expect(client.clientId).toContain('client_');
    expect(client.clientSecret).toContain('secret_');
    expect(client.scopes).toEqual(['read', 'write']);
  });

  it('validates redirect URIs', () => {
    const m = new OAuthClientManager();
    const client = m.createClient('App', ['http://good.com/cb'], ['read']);
    expect(m.validateRedirectUri(client.clientId, 'http://good.com/cb')).toBe(true);
    expect(m.validateRedirectUri(client.clientId, 'http://evil.com/cb')).toBe(false);
  });

  it('validates scopes', () => {
    const m = new OAuthClientManager();
    const client = m.createClient('App', [], ['read', 'write']);
    expect(m.validateScopes(client.clientId, ['read'])).toBe(true);
    expect(m.validateScopes(client.clientId, ['admin'])).toBe(false);
  });

  it('generates and revokes tokens', () => {
    const m = new OAuthClientManager();
    const client = m.createClient('App', [], ['read', 'write']);
    const token = m.generateToken(client.clientId, ['read'], 60000);
    expect(token).not.toBeNull();
    expect(token!.accessToken).toContain('at_');
    expect(m.isTokenValid(token!.id)).toBe(true);
    m.revokeToken(token!.id);
    expect(m.isTokenValid(token!.id)).toBe(false);
  });

  it('rejects token with invalid scopes', () => {
    const m = new OAuthClientManager();
    const client = m.createClient('App', [], ['read']);
    const token = m.generateToken(client.clientId, ['admin'], 60000);
    expect(token).toBeNull();
  });
});

describe('WebhookManager', () => {
  it('register, deliver, validate, retry', () => {
    const wm = new WebhookManager();
    wm.register({
      id: 'w1',
      url: 'http://x',
      events: ['push'],
      secret: 's',
      retryCount: 2,
      lastDelivery: null,
    });
    expect(wm.deliver('w1', 'push', {})).toBe(true);
    const sig = createHmac('sha256', 's').update('body').digest('hex');
    expect(wm.validateSignature('body', sig, 's')).toBe(true);
  });

  it('tracks delivery log and health score', () => {
    const wm = new WebhookManager();
    wm.register({
      id: 'w1',
      url: 'http://x',
      events: ['push'],
      secret: 's',
      retryCount: 0,
      lastDelivery: null,
    });
    wm.deliver('w1', 'push', {}, 200);
    wm.deliver('w1', 'push', {}, 200);
    wm.deliver('w1', 'push', {}, 500);
    expect(wm.getDeliveryLog('w1')).toHaveLength(3);
    expect(wm.getHealthScore('w1')).toBe(67);
  });

  it('calculates exponential backoff', () => {
    const wm = new WebhookManager();
    expect(wm.getBackoffMs(0)).toBe(1000);
    expect(wm.getBackoffMs(1)).toBe(2000);
    expect(wm.getBackoffMs(2)).toBe(4000);
    expect(wm.getBackoffMs(10)).toBe(60000);
  });

  it('handles dead letters after max retries', () => {
    const wm = new WebhookManager();
    wm.register({
      id: 'w1',
      url: 'http://x',
      events: ['push'],
      secret: 's',
      retryCount: 1,
      lastDelivery: null,
    });
    wm.retry('w1', 5, 500);
    expect(wm.getDeadLetters('w1')).toHaveLength(1);
  });
});

describe('UsageAnalytics', () => {
  it('tracks requests per endpoint', () => {
    const ua = new UsageAnalytics();
    ua.track('key1', '/api/users', 50, false);
    ua.track('key1', '/api/users', 60, false);
    ua.track('key1', '/api/data', 100, true);
    const records = ua.getRecords('key1');
    expect(records).toHaveLength(2);
    const usersRecord = records.find((r) => r.endpoint === '/api/users');
    expect(usersRecord?.count).toBe(2);
  });

  it('generates usage reports with latency percentiles', () => {
    const ua = new UsageAnalytics();
    for (let i = 1; i <= 100; i++) {
      ua.track('key1', '/api/test', i * 10, i > 90);
    }
    const report = ua.generateReport('key1');
    expect(report.totalRequests).toBe(100);
    expect(report.totalErrors).toBe(10);
    expect(report.errorRate).toBeCloseTo(0.1);
    expect(report.p95Latency).toBe(950);
  });

  it('returns zero error rate for no data', () => {
    const ua = new UsageAnalytics();
    const report = ua.generateReport('nonexistent');
    expect(report.errorRate).toBe(0);
    expect(report.totalRequests).toBe(0);
  });
});

describe('SDKTracker', () => {
  it('tracks downloads by version and platform', () => {
    const sdk = new SDKTracker();
    sdk.registerVersion('1.0.0', ['linux', 'macos', 'windows']);
    sdk.trackDownload('1.0.0', 'linux');
    sdk.trackDownload('1.0.0', 'macos');
    sdk.trackDownload('1.0.0', 'linux');
    expect(sdk.getDownloadCount('1.0.0')).toBe(3);
    expect(sdk.getDownloadsByPlatform('linux')).toHaveLength(2);
  });

  it('deprecates versions with warnings', () => {
    const sdk = new SDKTracker();
    sdk.registerVersion('1.0.0', ['linux']);
    sdk.registerVersion('2.0.0', ['linux', 'macos']);
    sdk.deprecateVersion('1.0.0', 'Use v2.0.0 instead');
    expect(sdk.isDeprecated('1.0.0')).toBe(true);
    expect(sdk.getDeprecationWarning('1.0.0')).toBe('Use v2.0.0 instead');
    expect(sdk.isDeprecated('2.0.0')).toBe(false);
  });

  it('returns compatible platforms and latest version', () => {
    const sdk = new SDKTracker();
    sdk.registerVersion('1.0.0', ['linux']);
    sdk.registerVersion('2.0.0', ['linux', 'macos', 'windows']);
    expect(sdk.getCompatiblePlatforms('2.0.0')).toEqual(['linux', 'macos', 'windows']);
    expect(sdk.getLatestVersion()?.version).toBe('2.0.0');
    sdk.deprecateVersion('2.0.0', 'gone');
    expect(sdk.getLatestVersion()?.version).toBe('1.0.0');
  });

  it('rejects download for unregistered version', () => {
    const sdk = new SDKTracker();
    expect(sdk.trackDownload('9.9.9', 'linux')).toBeNull();
  });
});
