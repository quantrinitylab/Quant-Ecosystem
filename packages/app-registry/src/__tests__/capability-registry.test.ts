/**
 * EC-01 contract tests (doc 21 §16 / EC-01.5):
 * - every command has a scope
 * - every side effect has verification
 * - every Tier 3/4 action has approval semantics
 * - every capability has degraded behavior
 * - no product exposes another product's source tables (owner === appId)
 * - registry validation: duplicates, unknown ids/versions, fail-closed
 * - enforcement: scopes, approval, step-up, idempotency, verification
 * - Quanty projection: policy-filtered, never raw
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_CAPABILITIES,
  buildCapabilityRegistry,
  activeCapabilities,
  CapabilityRegistry,
  validateDescriptor,
  CapabilityError,
  evaluatePolicy,
  projectForQuanty,
  MemoryIdempotencyStore,
} from '../index';
import type { Capability, InvocationContext } from '../index';

const ctx = (overrides: Partial<InvocationContext> = {}): InvocationContext => ({
  callerType: 'user',
  userId: 'user-1',
  scopes: [],
  ...overrides,
});

describe('canonical catalog (doc 21 §4/§5)', () => {
  it('registers the full catalog without contract violations', () => {
    const registry = buildCapabilityRegistry();
    expect(registry.ids().length).toBeGreaterThan(100);
  });

  it('every command declares requiredScopes', () => {
    for (const c of ALL_CAPABILITIES) {
      if (c.kind === 'command') {
        expect(c.requiredScopes.length, `${c.capabilityId} scopes`).toBeGreaterThan(0);
      }
    }
  });

  it('every side effect declares verification success events', () => {
    for (const c of ALL_CAPABILITIES) {
      if (c.kind === 'command' && c.verification.required) {
        expect(
          c.verification.successEvents.length,
          `${c.capabilityId} successEvents`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('every Tier 3/4 action declares approval semantics', () => {
    for (const c of ALL_CAPABILITIES) {
      if (c.riskTier === 3 || c.riskTier === 4) {
        expect(c.approval.required, `${c.capabilityId} approval`).toBe(true);
      }
    }
  });

  it('every capability declares degraded behavior with a user-facing state', () => {
    for (const c of ALL_CAPABILITIES) {
      expect(c.degradedMode.userState, `${c.capabilityId} userState`).toBeTruthy();
    }
  });

  it('no product exposes another product as owner', () => {
    for (const c of ALL_CAPABILITIES) {
      if (c.owner.appId !== 'platform') {
        expect(c.owner.appId, `${c.capabilityId} owner`).toBe(c.appId);
      }
    }
  });

  it('every active capability proves a real routeRef', () => {
    const active = activeCapabilities();
    expect(active.length).toBeGreaterThan(0);
    for (const c of active) {
      expect(c.routeRef, `${c.capabilityId} routeRef`).toBeDefined();
      expect(c.routeRef!.routeFile, `${c.capabilityId} routeFile`).toMatch(
        new RegExp(`apps/${c.appId}/backend/routes/`),
      );
    }
  });

  it('QuantMail + QuantChat proof set is fully active', () => {
    const byId = new Map(ALL_CAPABILITIES.map((c) => [c.capabilityId, c]));
    const proof = [
      'mail.thread.get',
      'mail.thread.search',
      'mail.draft.create',
      'mail.draft.update',
      'mail.send.execute',
      'mail.thread.archive',
      'mail.thread.restore',
      'mail.attachment.reference',
      'chat.conversation.get',
      'chat.conversation.create',
      'chat.message.get',
      'chat.message.send',
      'chat.message.edit',
      'chat.message.delete',
      'chat.call.prepare',
      'chat.call.start',
      'chat.notification.deliver',
    ];
    for (const id of proof) {
      expect(byId.get(id)?.status, id).toBe('active');
    }
  });

  it('cross-capability event references are all declared', () => {
    const registry = buildCapabilityRegistry();
    expect(registry.validate()).toEqual([]);
  });
});

describe('registration validation (EC-01.3)', () => {
  it('rejects duplicate capabilityId + version', () => {
    const registry = buildCapabilityRegistry();
    const existing = registry.resolve('mail.thread.get');
    expect(() => registry.register({ ...existing })).toThrowError(CapabilityError);
  });

  it('rejects unknown owner apps', () => {
    const bad = {
      ...buildCapabilityRegistry().resolve('mail.thread.get'),
      capabilityId: 'mail.thread.get',
      version: 99,
      owner: { appId: 'quantnarnia', sourceOfTruth: 'x' },
    } as unknown as Capability;
    expect(() => validateDescriptor(bad)).toThrowError(/unknown owner/);
  });

  it('rejects wrong id namespaces', () => {
    const bad = {
      ...buildCapabilityRegistry().resolve('mail.thread.get'),
      capabilityId: 'chat.thread.get',
      version: 99,
    };
    expect(() => validateDescriptor(bad)).toThrowError(/namespace/);
  });

  it('rejects active capabilities without routeRef', () => {
    const bad = {
      ...buildCapabilityRegistry().resolve('mail.draft.prepare'),
      version: 99,
      status: 'active' as const,
      routeRef: undefined,
    };
    expect(() => validateDescriptor(bad)).toThrowError(/routeRef/);
  });

  it('rejects Tier 3 without approval semantics', () => {
    const bad = {
      ...buildCapabilityRegistry().resolve('mail.send.execute'),
      version: 99,
      approval: { required: false },
    };
    expect(() => validateDescriptor(bad)).toThrowError(/approval/);
  });
});

describe('fail-closed resolution (§2 law 10)', () => {
  it('unknown capability id throws CAPABILITY_NOT_FOUND', () => {
    const registry = buildCapabilityRegistry();
    expect(() => registry.resolve('mail.nope.missing')).toThrowError(
      expect.objectContaining({ code: 'CAPABILITY_NOT_FOUND' }),
    );
  });

  it('unknown version throws CAPABILITY_VERSION_UNSUPPORTED', () => {
    const registry = buildCapabilityRegistry();
    expect(() => registry.resolve('mail.thread.get', 99)).toThrowError(
      expect.objectContaining({ code: 'CAPABILITY_VERSION_UNSUPPORTED' }),
    );
  });
});

describe('enforcement pipeline (§6)', () => {
  let registry: CapabilityRegistry;
  const audits: unknown[] = [];

  beforeEach(() => {
    audits.length = 0;
    registry = new CapabilityRegistry({
      hooks: {
        checkOwnership: async () => true,
        execute: async (capability) => ({ executed: capability.capabilityId }),
        verifyEvent: async () => 'verified',
        recordAudit: async (entry) => {
          audits.push(entry);
        },
      },
    });
    for (const c of ALL_CAPABILITIES) registry.register(c);
  });

  it('denies without required scopes (SCOPE_DENIED)', async () => {
    const result = await registry.invoke('mail.send.execute', ctx({ scopes: [] }));
    expect(result.ok).toBe(false);
    expect(result.error).toBe('SCOPE_DENIED');
  });

  it('requires auth for user callers without userId', async () => {
    const result = await registry.invoke(
      'mail.thread.get',
      ctx({ userId: undefined, scopes: ['mail:read'] }),
    );
    expect(result.error).toBe('AUTH_REQUIRED');
  });

  it('fails closed without an ownership checker', async () => {
    const bare = new CapabilityRegistry();
    for (const c of ALL_CAPABILITIES) bare.register(c);
    const result = await bare.invoke('mail.thread.get', ctx({ scopes: ['mail:read'] }));
    expect(result.error).toBe('RESOURCE_FORBIDDEN');
  });

  it('denies when ownership check fails', async () => {
    const strict = new CapabilityRegistry({
      hooks: {
        checkOwnership: async () => false,
        execute: async () => ({}),
      },
    });
    for (const c of ALL_CAPABILITIES) strict.register(c);
    const result = await strict.invoke('mail.thread.get', ctx({ scopes: ['mail:read'] }));
    expect(result.error).toBe('RESOURCE_FORBIDDEN');
  });

  it('pauses Tier 3 for approval when not granted', async () => {
    const result = await registry.invoke(
      'mail.send.execute',
      ctx({ scopes: ['mail:send'] }),
    );
    expect(result.ok).toBe(false);
    expect(result.state).toBe('approval_required');
    expect(result.error).toBe('APPROVAL_REQUIRED');
  });

  it('executes Tier 3 after approval + verifies the success event', async () => {
    const result = await registry.invoke(
      'mail.send.execute',
      ctx({ scopes: ['mail:send'], approvalGranted: true, idempotencyKey: 'k-1' }),
    );
    expect(result.ok).toBe(true);
    expect(result.state).toBe('executed');
    expect(result.verificationState).toBe('verified');
    expect(audits.length).toBeGreaterThan(0);
  });

  it('demands STEP_UP_REQUIRED for Tier 4 after approval', async () => {
    const result = await registry.invoke(
      'ads.boost.commit',
      ctx({ scopes: ['ads:spend'], approvalGranted: true }),
    );
    expect(result.error).toBe('STEP_UP_REQUIRED');
  });

  it('executes Tier 4 after approval + step-up', async () => {
    const result = await registry.invoke(
      'ads.boost.commit',
      ctx({ scopes: ['ads:spend'], approvalGranted: true, stepUpCompleted: true, idempotencyKey: 'k-2' }),
    );
    expect(result.ok).toBe(true);
  });

  it('replays idempotent invocations instead of executing twice', async () => {
    const store = new MemoryIdempotencyStore();
    const r2 = new CapabilityRegistry({
      idempotencyStore: store,
      hooks: {
        checkOwnership: async () => true,
        execute: async () => ({ n: 1 }),
        verifyEvent: async () => 'verified',
      },
    });
    for (const c of ALL_CAPABILITIES) r2.register(c);
    const base = ctx({ scopes: ['mail:send'], approvalGranted: true, idempotencyKey: 'dup-1' });
    const first = await r2.invoke('mail.send.execute', base);
    const second = await r2.invoke('mail.send.execute', base);
    expect(first.state).toBe('executed');
    expect(second.state).toBe('replayed');
    expect(second.data).toEqual(first.data);
  });

  it('fails VERIFICATION_FAILED when the success event is not observed', async () => {
    const unverified = new CapabilityRegistry({
      hooks: {
        checkOwnership: async () => true,
        execute: async () => ({}),
        verifyEvent: async () => 'failed',
      },
    });
    for (const c of ALL_CAPABILITIES) unverified.register(c);
    const result = await unverified.invoke(
      'mail.send.execute',
      ctx({ scopes: ['mail:send'], approvalGranted: true, idempotencyKey: 'k-3' }),
    );
    expect(result.error).toBe('VERIFICATION_FAILED');
  });

  it('returns OPERATION_TIMEOUT_UNKNOWN when verification times out', async () => {
    const timeout = new CapabilityRegistry({
      hooks: {
        checkOwnership: async () => true,
        execute: async () => ({}),
        verifyEvent: async () => 'unknown',
      },
    });
    for (const c of ALL_CAPABILITIES) timeout.register(c);
    const result = await timeout.invoke(
      'mail.send.execute',
      ctx({ scopes: ['mail:send'], approvalGranted: true, idempotencyKey: 'k-4' }),
    );
    expect(result.error).toBe('OPERATION_TIMEOUT_UNKNOWN');
  });

  it('audit entries never carry bodies or secrets', async () => {
    await registry.invoke(
      'mail.send.execute',
      ctx({ scopes: ['mail:send'], approvalGranted: true, idempotencyKey: 'k-5', input: { body: 'secret-body' } }),
    );
    const entry = audits[audits.length - 1] as Record<string, unknown>;
    expect(JSON.stringify(entry)).not.toContain('secret-body');
    expect(entry.capabilityId).toBe('mail.send.execute');
  });
});

describe('policy evaluation', () => {
  const registry = buildCapabilityRegistry();

  it('Tier 3 honors a durable user policy grant', () => {
    const cap = registry.resolve('chat.message.send');
    const decision = evaluatePolicy(cap, ctx({ policyGrants: { 'chat.message.send': true } }));
    expect(decision).toEqual({ allowed: true, requiresApproval: false });
  });

  it('Tier 0 proceeds without approval', () => {
    const cap = registry.resolve('mail.thread.get');
    expect(evaluatePolicy(cap, ctx())).toEqual({ allowed: true, requiresApproval: false });
  });
});

describe('Quanty projection (§7)', () => {
  const registry = buildCapabilityRegistry();

  it('never exposes disabled capabilities or raw database access', () => {
    const tools = projectForQuanty(registry);
    for (const t of tools) {
      const cap = registry.resolve(t.capabilityId, t.version);
      expect(cap.status).not.toBe('disabled');
      expect(t.toolId).not.toMatch(/prisma|database|sql/i);
    }
  });

  it('excludes preview capabilities by default', () => {
    const tools = projectForQuanty(registry);
    const ids = tools.map((t) => t.capabilityId);
    expect(ids).not.toContain('ai.run.execute');
    expect(ids).toContain('mail.thread.get');
  });

  it('marks Tier 3+ as requiresApproval', () => {
    const tools = projectForQuanty(registry, { maxRiskTier: 4, allowPreview: true });
    const send = tools.find((t) => t.capabilityId === 'mail.send.execute');
    expect(send?.requiresApproval).toBe(true);
  });

  it('respects allowedApps and blockedCapabilities', () => {
    const tools = projectForQuanty(registry, {
      allowedApps: ['quantchat'],
      blockedCapabilities: ['chat.message.delete'],
    });
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) {
      expect(registry.resolve(t.capabilityId).appId).toBe('quantchat');
      expect(t.capabilityId).not.toBe('chat.message.delete');
    }
  });
});
