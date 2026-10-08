import { describe, expect, it } from 'vitest';
import {
  compileTaskGraph,
  isQuantAppId,
  scopeHandoffGrants,
  topologicalWaves,
} from '../compiler';
import type { CompileInput } from '../compiler';
import { makeCapability, makeGraph, makeHost, makeNode } from './fixtures';

function compileInput(nodes: ReturnType<typeof makeNode>[], grants: string[]): CompileInput {
  const { registry } = makeHost();
  const capabilities = [
    makeCapability({ capabilityId: 'quantmail.email.resolve', kind: 'query', riskTier: 0 }),
    makeCapability({ capabilityId: 'quantmail.email.draft', kind: 'command', riskTier: 1 }),
    makeCapability({ capabilityId: 'quantmail.email.send', kind: 'command', riskTier: 3, approval: { required: true, reason: 'sending email' } }),
    makeCapability({ capabilityId: 'quantmail.email.verify', kind: 'query', riskTier: 0 }),
    makeCapability({ capabilityId: 'quantmax.game.start', kind: 'command', riskTier: 1, appId: 'quantmax' }),
    makeCapability({ capabilityId: 'quantmax.game.resolve', kind: 'query', riskTier: 0, appId: 'quantmax' }),
  ];
  for (const capability of capabilities) registry.set(capability.capabilityId, capability);
  return {
    taskId: 'task-compile-1',
    sessionId: 'session-1',
    goal: 'Email Rahul and then open QuantMax.',
    nodes,
    capabilityGrants: grants,
    provenance: { actorUserId: 'user-1', sourceApp: 'quantmail', correlationId: 'c1' },
    capabilities: { get: (id: string) => registry.get(id) },
  };
}

describe('compileTaskGraph', () => {
  it('compiles the canonical "Email Rahul and then open QuantMax" graph', () => {
    const resolve = makeNode({ id: 'resolve-rahul', kind: 'read', label: 'Resolve Rahul', capabilityId: 'quantmail.email.resolve' });
    const draft = makeNode({ id: 'draft-email', kind: 'draft', label: 'Draft email', capabilityId: 'quantmail.email.draft', dependsOn: ['resolve-rahul'] });
    const send = makeNode({ id: 'send-email', kind: 'mutate', label: 'Send email', capabilityId: 'quantmail.email.send', dependsOn: ['draft-email'] });
    const verify = makeNode({ id: 'verify-send', kind: 'verify', label: 'Verify send', capabilityId: 'quantmail.email.verify', dependsOn: ['send-email'], params: { expect: { sent: true } } });
    const openMax = makeNode({ id: 'open-quantmax', kind: 'navigate', label: 'Open QuantMax', appId: 'quantmax', dependsOn: ['verify-send'], params: { deepLink: 'quantmax://home' } });

    const result = compileTaskGraph(
      compileInput([resolve, draft, send, verify, openMax], [
        'quantmail.email.resolve',
        'quantmail.email.draft',
        'quantmail.email.send',
        'quantmail.email.verify',
      ]),
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.graph?.foregroundNodeId).toBeUndefined();
    // Tier-3 send requires approval at runtime.
    expect(result.approvalsRequired).toContain('send-email');
    expect(result.warnings.some((w) => w.includes('send-email') && w.includes('approval'))).toBe(true);
  });

  it('fails closed on duplicate node ids', () => {
    const a = makeNode({ id: 'duplicate-node' });
    const b = makeNode({ id: 'duplicate-node' });
    const result = compileTaskGraph(compileInput([a, b], []));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate node id'))).toBe(true);
  });

  it('fails closed on dangling dependencies', () => {
    const a = makeNode({ id: 'node-alpha', dependsOn: ['ghost-node'] });
    const result = compileTaskGraph(compileInput([a], []));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown node "ghost-node"'))).toBe(true);
  });

  it('fails closed on dependency cycles', () => {
    const a = makeNode({ id: 'node-alpha', dependsOn: ['node-beta'] });
    const b = makeNode({ id: 'node-beta', dependsOn: ['node-alpha'] });
    const result = compileTaskGraph(compileInput([a, b], []));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('fails closed on unknown capabilities', () => {
    const a = makeNode({ id: 'node-alpha', kind: 'mutate', capabilityId: 'quantmail.nope.missing' });
    const result = compileTaskGraph(compileInput([a], ['quantmail.nope.missing']));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown capability'))).toBe(true);
  });

  it('fails closed on preview capabilities (honest availability)', () => {
    const { registry } = makeHost();
    const preview = makeCapability({ capabilityId: 'quantmail.future.thing', status: 'preview' });
    registry.set(preview.capabilityId, preview);
    const a = makeNode({ id: 'node-alpha', kind: 'read', capabilityId: preview.capabilityId });
    const input = compileInput([a], [preview.capabilityId]);
    input.capabilities = { get: (id: string) => registry.get(id) };
    const result = compileTaskGraph(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('"preview"'))).toBe(true);
  });

  it('fails closed when a node invokes a capability outside task grants', () => {
    const a = makeNode({ id: 'node-alpha', kind: 'read', capabilityId: 'quantmail.email.resolve' });
    const result = compileTaskGraph(compileInput([a], ['quantmail.email.draft']));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('outside the task\'s capabilityGrants'))).toBe(true);
  });

  it('fails closed when a handoff widens grants beyond the task', () => {
    const handoff = makeNode({
      id: 'handoff-1',
      kind: 'handoff',
      appId: 'quantmail',
      handoff: { targetApp: 'quantmax', mode: 'command', grants: ['quantmax.game.start', 'quantmax.admin.wipe'], payload: {} },
    });
    const result = compileTaskGraph(compileInput([handoff], ['quantmax.game.start']));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('quantmax.admin.wipe') && e.includes('narrow'))).toBe(true);
  });

  it('requires a question on clarify nodes', () => {
    const c = makeNode({ id: 'clarify-1', kind: 'clarify', label: 'Which Rahul?' });
    const result = compileTaskGraph(compileInput([c], []));
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('must declare a question'))).toBe(true);
  });

  it('requires the foreground node to be a navigate node', () => {
    const a = makeNode({ id: 'node-alpha', kind: 'read' });
    const input = compileInput([a], []);
    input.foregroundNodeId = 'node-alpha';
    const result = compileTaskGraph(input);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("must be kind 'navigate'"))).toBe(true);
  });

  it('rejects empty goals and empty node lists', () => {
    const input = compileInput([], []);
    input.goal = '   ';
    const result = compileTaskGraph(input);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe('topologicalWaves', () => {
  it('orders waves so dependencies come first and independents share a wave', () => {
    const a = makeNode({ id: 'a' });
    const b = makeNode({ id: 'b' });
    const c = makeNode({ id: 'c', dependsOn: ['a', 'b'] });
    const d = makeNode({ id: 'd', dependsOn: ['c'] });
    const waves = topologicalWaves(makeGraph([a, b, c, d]));
    expect(waves).toEqual([['a', 'b'], ['c'], ['d']]);
  });

  it('throws on cycles', () => {
    const a = makeNode({ id: 'node-alpha', dependsOn: ['node-beta'] });
    const b = makeNode({ id: 'node-beta', dependsOn: ['node-alpha'] });
    expect(() => topologicalWaves(makeGraph([a, b]))).toThrow(/cycle/);
  });
});

describe('scopeHandoffGrants', () => {
  it('narrows to the requested subset', () => {
    expect(scopeHandoffGrants(['a', 'b', 'c'], ['a', 'c'])).toEqual(['a', 'c']);
  });

  it('dedupes', () => {
    expect(scopeHandoffGrants(['a', 'b'], ['a', 'a'])).toEqual(['a']);
  });

  it('throws when widening beyond ambient grants', () => {
    expect(() => scopeHandoffGrants(['a'], ['a', 'evil'])).toThrow(/outside the task's capability grants/);
  });
});

describe('isQuantAppId', () => {
  it('accepts the nine canonical apps and rejects the rest', () => {
    expect(isQuantAppId('quantmail')).toBe(true);
    expect(isQuantAppId('quantmax')).toBe(true);
    expect(isQuantAppId('gmail')).toBe(false);
    expect(isQuantAppId(undefined)).toBe(false);
  });
});
