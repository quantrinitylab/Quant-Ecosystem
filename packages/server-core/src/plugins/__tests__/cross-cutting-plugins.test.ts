import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { FeatureFlagService } from '@quant/feature-flags';
import { AuditLogger } from '@quant/audit';
import { OrgService, MemberService } from '@quant/organizations';

import featureFlagsPlugin from '../feature-flags';
import auditPlugin from '../audit';
import organizationsPlugin from '../organizations';

// ---------------------------------------------------------------------------
// OpenTelemetry is mocked so the OTel exporter path can be observed without a
// real collector / network. The observability plugin only ever reaches this
// module via `await import('@quant/observability')` WHEN
// OTEL_EXPORTER_OTLP_ENDPOINT is set — so the call-counts on these spies are a
// direct, behavioral proxy for "was the OTel path imported/initialized?".
// ---------------------------------------------------------------------------
const otelShutdownTracing = vi.fn(async () => {});
const otelShutdownMetrics = vi.fn(async () => {});
// NOTE: each spy declares a `(...args: unknown[])` rest parameter so the
// `vi.mock` factory below can forward its variadic args (`fn(...args)`) without
// tripping TS2556 ("a spread argument must be passed to a rest parameter").
// The spies still record every call/argument, so all `toHaveBeenCalled*`
// assertions remain exact.
const initTracing = vi.fn((..._args: unknown[]) => otelShutdownTracing);
const initMetrics = vi.fn((..._args: unknown[]) => otelShutdownMetrics);
const getMeter = vi.fn((..._args: unknown[]) => ({}) as unknown);
// Stable metric instrument spies so the onResponse OTel path can be observed.
const httpRequestCountAdd = vi.fn();
const httpRequestDurationRecord = vi.fn();
const httpErrorCountAdd = vi.fn();
const createHttpMetrics = vi.fn((..._args: unknown[]) => ({
  requestCount: { add: httpRequestCountAdd },
  requestDuration: { record: httpRequestDurationRecord },
  errorCount: { add: httpErrorCountAdd },
}));
const getActiveTraceContext = vi.fn((..._args: unknown[]) => ({
  traceId: 'trace-abc',
  spanId: 'span-xyz',
}));

vi.mock('@quant/observability', () => ({
  initTracing: (...args: unknown[]) => initTracing(...args),
  initMetrics: (...args: unknown[]) => initMetrics(...args),
  getMeter: (...args: unknown[]) => getMeter(...args),
  createHttpMetrics: (...args: unknown[]) => createHttpMetrics(...args),
  getActiveTraceContext: (...args: unknown[]) => getActiveTraceContext(...args),
}));

/** Build a bare Fastify instance (no createApp → no @quant/database dependency). */
function bareApp(): FastifyInstance {
  return Fastify({ logger: false });
}

/** Returns the list of hook names registered via `addHook` on the given instance. */
function spyHooks(app: FastifyInstance) {
  return vi.spyOn(app, 'addHook');
}

function hookNames(spy: ReturnType<typeof spyHooks>): string[] {
  return spy.mock.calls.map((c) => c[0] as string);
}

describe('cross-cutting plugins (Task 4.1 registrations)', () => {
  // -------------------------------------------------------------------------
  // feature-flags: decorates `fastify.flags` and OWNS a refresh interval → it
  // MUST register an onClose hook that clears that interval.
  // -------------------------------------------------------------------------
  describe('feature-flags plugin', () => {
    let app: FastifyInstance;
    afterEach(async () => {
      await app.close();
    });

    it('decorates the instance with a usable FeatureFlagService', async () => {
      app = bareApp();
      await app.register(featureFlagsPlugin);
      await app.ready();

      expect(app.hasDecorator('flags')).toBe(true);
      expect(app.flags).toBeInstanceOf(FeatureFlagService);
      // usable: a flag that does not exist resolves to a boolean (false)
      expect(app.flags.isEnabled('does-not-exist')).toBe(false);
      expect(typeof app.flags.isEnabled('does-not-exist')).toBe('boolean');
    });

    it('registers an onClose hook (owns a refresh interval)', async () => {
      app = bareApp();
      const spy = spyHooks(app);
      await app.register(featureFlagsPlugin);
      await app.ready();

      expect(hookNames(spy)).toContain('onClose');
    });
  });

  // -------------------------------------------------------------------------
  // audit: decorates `fastify.audit` with an in-memory AuditLogger. It owns no
  // external resource, so it registers an onResponse hook but (correctly) no
  // onClose. We assert the decoration is usable and the response hook exists.
  // -------------------------------------------------------------------------
  describe('audit plugin', () => {
    let app: FastifyInstance;
    afterEach(async () => {
      await app.close();
    });

    it('decorates the instance with a usable AuditLogger', async () => {
      app = bareApp();
      await app.register(auditPlugin);
      await app.ready();

      expect(app.hasDecorator('audit')).toBe(true);
      expect(app.audit).toBeInstanceOf(AuditLogger);
      // usable: querying an empty logger returns an array, count is 0
      expect(Array.isArray(app.audit.query({}))).toBe(true);
      expect(app.audit.count()).toBe(0);
    });

    it('registers an onResponse hook and owns no resource needing onClose', async () => {
      app = bareApp();
      const spy = spyHooks(app);
      await app.register(auditPlugin);
      await app.ready();

      const names = hookNames(spy);
      expect(names).toContain('onResponse');
      // AuditLogger is in-memory: no onClose is required (nothing to release).
      expect(names).not.toContain('onClose');
    });
  });

  // -------------------------------------------------------------------------
  // organizations: decorates `fastify.org` = { service, members } and registers
  // the org-context middleware. Services are in-memory → no onClose required.
  // -------------------------------------------------------------------------
  describe('organizations plugin', () => {
    let app: FastifyInstance;
    afterEach(async () => {
      await app.close();
    });

    it('decorates the instance with usable org services', async () => {
      app = bareApp();
      await app.register(organizationsPlugin);
      await app.ready();

      expect(app.hasDecorator('org')).toBe(true);
      expect(app.org.service).toBeInstanceOf(OrgService);
      expect(app.org.members).toBeInstanceOf(MemberService);
      // usable: empty registry lists, and a created org is retrievable
      expect(app.org.service.listOrgs()).toEqual([]);
      const org = app.org.service.createOrg({ name: 'Acme', slug: 'acme' });
      expect(app.org.service.getOrg(org.id)).toMatchObject({ slug: 'acme' });
      expect(Array.isArray(app.org.members.listMembers(org.id))).toBe(true);
    });

    it('wires org-context middleware (decorates request.orgContext)', async () => {
      app = bareApp();
      await app.register(organizationsPlugin);
      app.get('/org-ctx', async (request) => ({ ctx: request.orgContext ?? null }));
      await app.ready();

      const res = await app.inject({ method: 'GET', url: '/org-ctx' });
      expect(res.statusCode).toBe(200);
      // no x-organization-id header → context resolves to null (not undefined/throw)
      expect(res.json()).toEqual({ ctx: null });
    });
  });

  // -------------------------------------------------------------------------
  // observability: OTel MUST stay import-gated behind OTEL_EXPORTER_OTLP_ENDPOINT.
  // - unset  → exporter path is NOT imported/initialized; effectively a no-op
  //            (no decoration owned, no onClose, no trace header).
  // - set    → OTel is initialized once and an onClose shutdown hook is wired.
  // observabilityPlugin is imported dynamically per-test so vi.resetModules()
  // re-reads process.env at registration time.
  // -------------------------------------------------------------------------
  describe('observability plugin (OTel gating)', () => {
    const ENDPOINT_KEY = 'OTEL_EXPORTER_OTLP_ENDPOINT';
    let app: FastifyInstance;
    const original = process.env[ENDPOINT_KEY];

    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env[ENDPOINT_KEY];
    });

    afterEach(async () => {
      if (original === undefined) delete process.env[ENDPOINT_KEY];
      else process.env[ENDPOINT_KEY] = original;
      await app.close();
    });

    it('does NOT import/initialize the OTel exporter path when the env var is unset', async () => {
      delete process.env[ENDPOINT_KEY];
      const { default: observabilityPlugin } = await import('../observability');

      app = bareApp();
      const spy = spyHooks(app);
      await app.register(observabilityPlugin);
      app.get('/ping', async () => ({ ok: true }));
      await app.ready();

      // gate held: the dynamic @quant/observability path was never reached
      expect(initTracing).not.toHaveBeenCalled();
      expect(initMetrics).not.toHaveBeenCalled();
      // no OTel hooks registered → no onClose, and no trace header emitted
      expect(hookNames(spy)).not.toContain('onClose');
      const res = await app.inject({ method: 'GET', url: '/ping' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-trace-id']).toBeUndefined();
    });

    it('initializes OTel once and registers an onClose shutdown hook when the env var is set', async () => {
      process.env[ENDPOINT_KEY] = 'http://localhost:4318';
      const { default: observabilityPlugin } = await import('../observability');

      app = bareApp();
      const spy = spyHooks(app);
      await app.register(observabilityPlugin);
      app.get('/ping', async () => ({ ok: true }));
      await app.ready();

      // gate opened: OTel tracing + metrics initialized exactly once with the endpoint
      expect(initTracing).toHaveBeenCalledTimes(1);
      expect(initMetrics).toHaveBeenCalledTimes(1);
      expect(initTracing).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'http://localhost:4318' }),
      );

      // owns OTel resources → MUST register an onClose hook
      expect(hookNames(spy)).toContain('onClose');

      // request hooks active: the OTel onResponse path runs and records metrics
      // + reads the active trace context (the plugin sets x-trace-id in
      // onResponse, which fires after the response is flushed, so we assert the
      // wired behavior via the instrument/trace spies rather than the header).
      const res = await app.inject({ method: 'GET', url: '/ping' });
      expect(res.statusCode).toBe(200);
      expect(httpRequestCountAdd).toHaveBeenCalled();
      expect(httpRequestDurationRecord).toHaveBeenCalled();
      expect(getActiveTraceContext).toHaveBeenCalled();

      // onClose shutdown actually flushes the OTel providers
      await app.close();
      expect(otelShutdownTracing).toHaveBeenCalledTimes(1);
      expect(otelShutdownMetrics).toHaveBeenCalledTimes(1);
    });
  });
});
