/**
 * EC-02 contract tests (doc 22 §16):
 * - Reference: valid app/type, unknown app/type, malformed ID, stale version.
 * - Envelope: required fields, unknown version, malformed, budget, tenant.
 * - Deep links: canonical routes round-trip, invalid links fail closed.
 * - Serialization: ref + envelope round-trips.
 * - Vocabulary: every canonical app has a bounded type list.
 */
import { describe, it, expect } from 'vitest';
import {
  RESOURCE_CONTRACT_VERSION,
  ENVELOPE_SCHEMA_VERSION,
  RESOURCE_VOCABULARY,
  QUANT_APP_IDS,
  HANDOFF_MODES,
  createResourceRef,
  tryCreateResourceRef,
  isResourceRef,
  parseResourceRef,
  serializeResourceRef,
  deserializeResourceRef,
  deepLinkFor,
  parseDeepLink,
  isStaleVersion,
  sameResource,
  createContextEnvelope,
  isContextEnvelope,
  parseContextEnvelope,
  serializeEnvelope,
  deserializeEnvelope,
  assertBudget,
  assertTenantMatch,
  isTierWithin,
  DEFAULT_ENVELOPE_BUDGET_BYTES,
  ResourceContractError,
  RESOURCE_ERROR_CODES,
} from '../index';

const actor = { type: 'user' as const, id: 'user-1' };

describe('QuantResourceRef — reference contract (doc 22 §2/§3)', () => {
  it('creates a valid ref with defaults', () => {
    const ref = createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-1' });
    expect(ref.version).toBe(RESOURCE_CONTRACT_VERSION);
    expect(ref.appId).toBe('quantmail');
    expect(ref.visibility).toBe('private');
    expect(ref.deepLink).toBe('quant://mail/thread/t-1');
    expect(ref.createdAt).toBeTruthy();
  });

  it('fails closed on unknown app id', () => {
    expect(() => createResourceRef({ appId: 'evilapp', resourceType: 'mail.thread', resourceId: 'x' }))
      .toThrowError(ResourceContractError);
    try {
      createResourceRef({ appId: 'evilapp', resourceType: 'mail.thread', resourceId: 'x' });
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.UNKNOWN_APP_ID);
    }
  });

  it('fails closed on unknown resource type for a known app', () => {
    try {
      createResourceRef({ appId: 'quantmail', resourceType: 'mail.nonexistent', resourceId: 'x' });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.UNKNOWN_RESOURCE_TYPE);
    }
  });

  it('fails closed on malformed resource id', () => {
    for (const bad of ['', '   ']) {
      try {
        createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: bad });
        expect.unreachable();
      } catch (e) {
        expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.MALFORMED_RESOURCE_ID);
      }
    }
  });

  it('tryCreateResourceRef returns null instead of throwing', () => {
    expect(tryCreateResourceRef({ appId: 'nope', resourceType: 'x', resourceId: 'y' })).toBeNull();
    expect(
      tryCreateResourceRef({ appId: 'quantchat', resourceType: 'chat.message', resourceId: 'm-1' }),
    ).not.toBeNull();
  });

  it('parseResourceRef fails closed on malformed input', () => {
    expect(() => parseResourceRef({ appId: 'quantmail' })).toThrowError(ResourceContractError);
    expect(() =>
      parseResourceRef({
        version: 1,
        appId: 'quantmail',
        resourceType: 'mail.thread',
        resourceId: 't-1',
        visibility: 'weird',
      }),
    ).toThrowError(ResourceContractError);
  });

  it('isResourceRef is a structural guard', () => {
    expect(isResourceRef(null)).toBe(false);
    expect(isResourceRef({})).toBe(false);
    expect(isResourceRef(createResourceRef({ appId: 'quantube', resourceType: 'tube.video', resourceId: 'v-1' }))).toBe(true);
  });

  it('serializes and deserializes round-trip', () => {
    const ref = createResourceRef({
      appId: 'quantchat',
      resourceType: 'chat.conversation',
      resourceId: 'c-9',
      resourceVersion: 'v3',
      visibility: 'shared',
      tenantId: 'tenant-a',
    });
    const back = deserializeResourceRef(serializeResourceRef(ref));
    expect(back.appId).toBe('quantchat');
    expect(back.resourceVersion).toBe('v3');
    expect(back.tenantId).toBe('tenant-a');
  });

  it('rejects invalid JSON on deserialize', () => {
    expect(() => deserializeResourceRef('not-json{{{')).toThrowError(ResourceContractError);
  });

  it('detects stale versions', () => {
    const ref = createResourceRef({
      appId: 'quantmail',
      resourceType: 'mail.thread',
      resourceId: 't-1',
      resourceVersion: 'v2',
    });
    expect(isStaleVersion('v3', ref)).toBe(true);
    expect(isStaleVersion('v2', ref)).toBe(false);
    expect(isStaleVersion(undefined, ref)).toBe(false);
  });

  it('sameResource compares identity coordinates', () => {
    const a = createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-1' });
    const b = createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-1' });
    const c = createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-2' });
    expect(sameResource(a, b)).toBe(true);
    expect(sameResource(a, c)).toBe(false);
  });

  it('every canonical app has a bounded vocabulary', () => {
    for (const appId of QUANT_APP_IDS) {
      const types = RESOURCE_VOCABULARY[appId];
      expect(types.length).toBeGreaterThan(0);
    }
    // Spot-check doc §3 vocabulary.
    expect(RESOURCE_VOCABULARY.quantmail).toContain('mail.thread');
    expect(RESOURCE_VOCABULARY.quantchat).toContain('chat.conversation');
    expect(RESOURCE_VOCABULARY.quantube).toContain('tube.video');
    expect(RESOURCE_VOCABULARY.quantads).toContain('ads.campaign');
  });

  it('handoff modes cover all six §6 modes', () => {
    expect(HANDOFF_MODES).toEqual(['OPEN', 'SHARE', 'ATTACH', 'IMPORT', 'COMMAND', 'NOTIFY']);
  });
});

describe('deep links (doc 22 §7)', () => {
  it('builds canonical quant:// links', () => {
    expect(deepLinkFor('quantmail', 'mail.thread', 'abc')).toBe('quant://mail/thread/abc');
    expect(deepLinkFor('quantchat', 'chat.conversation', 'c 1')).toBe('quant://chat/conversation/c%201');
  });

  it('parses canonical links back to coordinates', () => {
    const parsed = parseDeepLink('quant://mail/thread/abc123');
    expect(parsed).toEqual({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 'abc123' });
  });

  it('fails closed on invalid links', () => {
    expect(() => parseDeepLink('https://example.com/x')).toThrowError(ResourceContractError);
    expect(() => parseDeepLink('quant://nope/thing/x')).toThrowError(ResourceContractError);
    try {
      parseDeepLink('quant://nope/thing/x');
    } catch (e) {
      const code = (e as ResourceContractError).code;
      expect([RESOURCE_ERROR_CODES.DEEP_LINK_INVALID, RESOURCE_ERROR_CODES.UNKNOWN_APP_ID]).toContain(code);
    }
  });
});

describe('QuantContextEnvelope (doc 22 §4/§5)', () => {
  it('creates an envelope with defaults', () => {
    const env = createContextEnvelope({
      actor,
      sourceApp: 'quantmail',
      purpose: 'notification',
      payload: { title: 'New reply' },
    });
    expect(env.schemaVersion).toBe(ENVELOPE_SCHEMA_VERSION);
    expect(env.eventId).toBeTruthy();
    expect(env.correlationId).toBe(env.eventId);
    expect(env.occurredAt).toBeTruthy();
    expect(env.payload).toEqual({ title: 'New reply' });
  });

  it('preserves supplied correlation/causation ids', () => {
    const env = createContextEnvelope({
      actor,
      sourceApp: 'quantchat',
      targetApp: 'quantmail',
      correlationId: 'corr-1',
      causationId: 'cause-9',
      purpose: 'user_action',
      payload: {},
    });
    expect(env.correlationId).toBe('corr-1');
    expect(env.causationId).toBe('cause-9');
    expect(env.targetApp).toBe('quantmail');
  });

  it('fails closed on unknown source app', () => {
    try {
      createContextEnvelope({ actor, sourceApp: 'evilapp', purpose: 'search', payload: {} });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.UNKNOWN_APP_ID);
    }
  });

  it('fails closed on unknown purpose', () => {
    try {
      createContextEnvelope({ actor, sourceApp: 'quantai', purpose: 'exfiltrate' as never, payload: {} });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.PURPOSE_NOT_ALLOWED);
    }
  });

  it('fails closed on invalid actor', () => {
    try {
      createContextEnvelope({
        actor: { type: 'user', id: '  ' },
        sourceApp: 'quantai',
        purpose: 'memory',
        payload: {},
      });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.ACTOR_INVALID);
    }
  });

  it('fails closed on non-object payload', () => {
    try {
      createContextEnvelope({ actor, sourceApp: 'quantai', purpose: 'analytics', payload: 'dump' as never });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.PAYLOAD_INVALID);
    }
  });

  it('fails closed on unsupported schema version', () => {
    try {
      createContextEnvelope({ actor, sourceApp: 'quantai', purpose: 'search', payload: {}, schemaVersion: 999 });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.ENVELOPE_VERSION_UNSUPPORTED);
    }
  });

  it('re-validates nested resource refs', () => {
    const good = createResourceRef({ appId: 'quantube', resourceType: 'tube.video', resourceId: 'v-1' });
    const env = createContextEnvelope({
      actor,
      sourceApp: 'quantube',
      purpose: 'recommendation',
      payload: { score: 0.9 },
      resourceRef: good,
    });
    expect(env.resourceRef?.resourceId).toBe('v-1');
  });

  it('enforces the context budget (§5)', () => {
    const big = { blob: 'x'.repeat(DEFAULT_ENVELOPE_BUDGET_BYTES + 1) };
    try {
      createContextEnvelope({ actor, sourceApp: 'quantmail', purpose: 'search', payload: big });
      expect.unreachable();
    } catch (e) {
      expect((e as ResourceContractError).code).toBe(RESOURCE_ERROR_CODES.ENVELOPE_OVER_BUDGET);
    }
    // Explicit small budget also enforced via assertBudget.
    const env = createContextEnvelope({
      actor,
      sourceApp: 'quantmail',
      purpose: 'search',
      payload: { q: 'hi' },
      budget: { tier: 'reference-only', byteEstimate: 128 },
    });
    expect(() => assertBudget(env, 4)).toThrowError(ResourceContractError);
    expect(() => assertBudget(env)).not.toThrow();
  });

  it('assertTenantMatch fails closed on mismatch', () => {
    const env = createContextEnvelope({
      actor,
      sourceApp: 'quantmail',
      purpose: 'notification',
      payload: {},
      tenantId: 'tenant-a',
    });
    expect(() => assertTenantMatch(env, 'tenant-a')).not.toThrow();
    expect(() => assertTenantMatch(env, 'tenant-b')).toThrowError(ResourceContractError);
    expect(() => assertTenantMatch(env, undefined)).not.toThrow();
  });

  it('serializes and deserializes round-trip', () => {
    const env = createContextEnvelope({
      actor: { type: 'agent', id: 'agent-run-7' },
      sourceApp: 'quantai',
      targetApp: 'quantchat',
      purpose: 'agent_execution',
      payload: { action: 'summarize' },
      resourceRef: createResourceRef({ appId: 'quantmail', resourceType: 'mail.thread', resourceId: 't-5' }),
    });
    const back = deserializeEnvelope(serializeEnvelope(env));
    expect(back.eventId).toBe(env.eventId);
    expect(back.actor.type).toBe('agent');
    expect(back.resourceRef?.resourceId).toBe('t-5');
    expect(isContextEnvelope(back)).toBe(true);
  });

  it('parseContextEnvelope fails closed on malformed input', () => {
    expect(() => parseContextEnvelope({ eventId: 'x' })).toThrowError(ResourceContractError);
    expect(() => parseContextEnvelope('nope')).toThrowError(ResourceContractError);
    expect(() => deserializeEnvelope('{{{')).toThrowError(ResourceContractError);
  });

  it('isTierWithin orders budget tiers (§5)', () => {
    expect(isTierWithin('reference-only', 'display-metadata')).toBe(true);
    expect(isTierWithin('extended', 'reference-only')).toBe(false);
    expect(isTierWithin('user-selected', 'user-selected')).toBe(true);
  });
});
