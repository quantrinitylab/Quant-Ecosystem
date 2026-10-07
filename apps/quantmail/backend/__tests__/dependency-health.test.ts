// @vitest-environment node
// ============================================================================
// K12 — Dependency health + SLO endpoint tests
// ============================================================================
// Covers: the 12 spec'd dependencies (health-dependencies.md) report honest
// states (real probes / not_configured / unknown — never fake healthy), each
// carries a degraded-mode declaration and a circuit-breaker state, and
// /api/health/detailed exposes `dependencies` + `slos` alongside the existing
// back-compat `services` map.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createQuantMailDependencyRegistry,
  QUANTMAIL_DEPENDENCY_NAMES,
  __resetRedisProbeClientForTests,
} from '../lib/dependency-health';
import { QUANTMAIL_SLOS } from '../lib/slos';
import { buildApp } from '../app';

process.env.SYNC_CURSOR_SECRET ??= 'test-secret-32-bytes-long-for-tests!';

const stubPrisma = {
  $queryRawUnsafe: async () => [{ '?column?': 1 }],
};

const HONEST_STATUSES = ['ok', 'degraded', 'unavailable', 'unknown', 'not_configured'] as const;

describe('QuantMail dependency registry (spec M16)', () => {
  afterEach(() => {
    __resetRedisProbeClientForTests();
  });

  it('declares exactly the 12 spec\'d dependencies', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    expect(registry.registeredNames().sort()).toEqual([...QUANTMAIL_DEPENDENCY_NAMES].sort());
    const all = await registry.checkAll();
    expect(Object.keys(all)).toHaveLength(12);
  });

  it('probes postgres for real and reports latency + closed circuit', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    const report = await registry.check('postgres');
    expect(report.status).toBe('ok');
    expect(typeof report.latencyMs).toBe('number');
    expect(report.circuitState).toBe('closed');
    expect(report.configured).toBe(true);
    expect(report.lastSuccessAt).not.toBeNull();
    expect(report.degradedMode.length).toBeGreaterThan(0);
  });

  it('reports postgres unavailable (not a 500) when the database is down', async () => {
    const registry = createQuantMailDependencyRegistry({
      prisma: { $queryRawUnsafe: async () => { throw new Error('connection refused'); } },
    });
    const report = await registry.check('postgres');
    expect(report.status).toBe('unavailable');
    expect(report.lastError).toContain('connection refused');
    expect(report.errorRate).toBe(1);
  });

  it('reports redis not_configured when REDIS_URL is absent', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    const report = await registry.check('redis');
    expect(report.status).toBe('not_configured');
    expect(report.configured).toBe(false);
    expect(report.circuitState).toBeNull();
  });

  it('pings redis for real when REDIS_URL is set and reports failure honestly', async () => {
    const registry = createQuantMailDependencyRegistry({
      prisma: stubPrisma,
      redisUrl: 'redis://127.0.0.1:6399',
    });
    const report = await registry.check('redis');
    expect(report.configured).toBe(true);
    // Nothing listens on 6399: the probe must fail honestly, never claim ok.
    expect(report.status).toBe('unavailable');
    expect(report.lastError).not.toBeNull();
  });

  it('reports not_configured for kafka, search-index, qdrant and imap', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    for (const name of ['kafka', 'search-index', 'qdrant', 'imap'] as const) {
      const report = await registry.check(name);
      expect(report.status).toBe('not_configured');
      expect(report.degradedMode.length).toBeGreaterThan(0);
    }
  });

  it('reports unknown (never fake-healthy) for configured deps without a live probe', async () => {
    const savedS3 = process.env['S3_BUCKET'];
    const savedKey = process.env['SES_ACCESS_KEY_ID'];
    const savedRegion = process.env['SES_REGION'];
    const savedSecret = process.env['SES_SECRET_ACCESS_KEY'];
    process.env['S3_BUCKET'] = 'test-bucket';
    process.env['SES_ACCESS_KEY_ID'] = 'test';
    process.env['SES_REGION'] = 'us-east-1';
    process.env['SES_SECRET_ACCESS_KEY'] = 'test';
    try {
      const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
      const objectStorage = await registry.check('object-storage');
      expect(objectStorage.configured).toBe(true);
      expect(objectStorage.status).toBe('unknown');
      const smtp = await registry.check('smtp');
      expect(smtp.configured).toBe(true);
      expect(smtp.status).toBe('unknown');
    } finally {
      if (savedS3 === undefined) delete process.env['S3_BUCKET']; else process.env['S3_BUCKET'] = savedS3;
      if (savedKey === undefined) delete process.env['SES_ACCESS_KEY_ID']; else process.env['SES_ACCESS_KEY_ID'] = savedKey;
      if (savedRegion === undefined) delete process.env['SES_REGION']; else process.env['SES_REGION'] = savedRegion;
      if (savedSecret === undefined) delete process.env['SES_SECRET_ACCESS_KEY']; else process.env['SES_SECRET_ACCESS_KEY'] = savedSecret;
    }
  });

  it('labels calendar/drive/contacts/quanty-runtime as in-process internal modules', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    for (const name of ['calendar', 'drive', 'contacts', 'quanty-runtime'] as const) {
      const report = await registry.check(name);
      expect(report.kind).toBe('internal');
      expect(report.status).toBe('ok');
      expect(report.degradedMode.length).toBeGreaterThan(0);
    }
  });

  it('every report only ever carries an honest status value', async () => {
    const registry = createQuantMailDependencyRegistry({ prisma: stubPrisma });
    const all = await registry.checkAll();
    for (const report of Object.values(all)) {
      expect(HONEST_STATUSES).toContain(report.status);
    }
  });
});

describe('detailed health endpoint: dependencies + SLOs', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health/detailed exposes per-dependency health and SLO budgets', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health/detailed' });
    expect(res.statusCode).toBe(200);
    const json = res.json();

    // Existing contract preserved.
    expect(json.status).toBe('healthy');
    expect(json.services.api).toBe('ok');
    expect(['connected', 'disconnected']).toContain(json.services.postgres);
    expect(['configured', 'not_configured']).toContain(json.services.redis);

    // K12: per-dependency health for all 12 spec'd dependencies.
    expect(json.dependencies).toBeDefined();
    expect(Object.keys(json.dependencies).sort()).toEqual([...QUANTMAIL_DEPENDENCY_NAMES].sort());
    for (const name of QUANTMAIL_DEPENDENCY_NAMES) {
      const dep = json.dependencies[name];
      expect(HONEST_STATUSES).toContain(dep.status);
      expect(dep).toHaveProperty('latencyMs');
      expect(dep).toHaveProperty('errorRate');
      expect(dep).toHaveProperty('timeoutRate');
      expect(dep).toHaveProperty('circuitState');
      expect(dep).toHaveProperty('lastError');
      expect(dep).toHaveProperty('lastSuccessAt');
      expect(dep).toHaveProperty('degradedMode');
      expect(typeof dep.degradedMode).toBe('string');
    }

    // K12: SLO error-budget summary for the critical mail journeys.
    expect(json.slos).toBeDefined();
    for (const slo of QUANTMAIL_SLOS) {
      const entry = json.slos[slo.id];
      expect(entry).toBeDefined();
      expect(entry.journey).toBe(slo.journey);
      expect(['healthy', 'warning', 'critical', 'no_data']).toContain(entry.status);
      expect(entry.availability.target).toBe(slo.availabilityTarget);
      expect(entry.latency.targetMs).toBe(slo.latencyTargetMs);
    }
  });

  it('GET /health/detailed (non-/api alias) exposes the same shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/detailed' });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(Object.keys(json.dependencies)).toHaveLength(12);
    expect(Object.keys(json.slos)).toHaveLength(QUANTMAIL_SLOS.length);
  });
});
