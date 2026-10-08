import { describe, expect, it } from 'vitest';
import { runTask } from '../executor';
import type { TaskEvent } from '../types';
import {
  makeCapability,
  makeGraph,
  makeHost,
  makeNode,
  waitFor,
} from './fixtures';

function eventTypes(events: TaskEvent[]): string[] {
  return events.map((e) => e.type);
}

describe('runTask — canonical "Email Rahul and then open QuantMax"', () => {
  it('runs read -> draft -> approval -> mutate -> verify -> navigate end to end', async () => {
    const resolveCap = makeCapability({ capabilityId: 'quantmail.email.resolve', kind: 'query', riskTier: 0 });
    const draftCap = makeCapability({ capabilityId: 'quantmail.email.draft', kind: 'command', riskTier: 1 });
    const sendCap = makeCapability({
      capabilityId: 'quantmail.email.send',
      kind: 'command',
      riskTier: 3,
      approval: { required: true, reason: 'external send needs confirmation' },
      idempotency: { required: true },
      verification: { required: true, successEvents: ['email.sent'], timeoutState: 'unknown' },
    });
    const verifyCap = makeCapability({ capabilityId: 'quantmail.email.verify', kind: 'query', riskTier: 0 });

    const { host, events, navigator, invoker } = makeHost({
      capabilities: [resolveCap, draftCap, sendCap, verifyCap],
      behaviors: {
        'quantmail.email.resolve': () => ({ contacts: [{ name: 'Rahul', id: 'rahul-1' }] }),
        'quantmail.email.draft': () => ({ draftId: 'draft-9' }),
        'quantmail.email.send': () => ({ sent: true, messageId: 'm-1' }),
        'quantmail.email.verify': () => ({ sent: true }),
      },
    });

    const nodes = [
      makeNode({ id: 'resolve', kind: 'read', label: 'Resolve Rahul', capabilityId: resolveCap.capabilityId, outputs: ['contacts'] }),
      makeNode({ id: 'draft', kind: 'draft', label: 'Draft email', capabilityId: draftCap.capabilityId, dependsOn: ['resolve'], params: { to: { $output: 'resolve.contacts' } } }),
      makeNode({ id: 'send', kind: 'mutate', label: 'Send email', capabilityId: sendCap.capabilityId, dependsOn: ['draft'] }),
      makeNode({ id: 'verify', kind: 'verify', label: 'Verify send', capabilityId: verifyCap.capabilityId, dependsOn: ['send'], params: { expect: { sent: true } } }),
      makeNode({ id: 'openmax', kind: 'navigate', label: 'Open QuantMax', appId: 'quantmax', dependsOn: ['verify'], params: { deepLink: 'quantmax://home' } }),
    ];
    const graph = makeGraph(nodes, {
      goal: 'Email Rahul and then open QuantMax.',
      foregroundNodeId: 'openmax',
      capabilityGrants: [resolveCap.capabilityId, draftCap.capabilityId, sendCap.capabilityId, verifyCap.capabilityId],
    });

    const control = runTask(graph, host);

    // The tier-3 send must pause for approval — it must NOT execute first.
    await waitFor(() =>
      events.some((e) => e.type === 'approval_required' && (e as { nodeId: string }).nodeId === 'send'),
    );
    expect(invoker.calls.some((c) => c.capabilityId === sendCap.capabilityId)).toBe(false);
    expect(control.records().get('send')?.state).toBe('waiting_approval');

    control.grantApproval('send', true);

    const final = await control.done();
    expect(final.state).toBe('completed');
    expect(navigator.navigations).toEqual([{ appId: 'quantmax', deepLink: 'quantmax://home' }]);

    // $output placeholder flowed from resolve -> draft.
    const draftCall = invoker.calls.find((c) => c.capabilityId === draftCap.capabilityId);
    expect(draftCall?.input).toMatchObject({ to: [{ name: 'Rahul', id: 'rahul-1' }] });

    // Idempotency key was attached to the mutating send (operation-scoped).
    const sendCall = invoker.calls.find((c) => c.capabilityId === sendCap.capabilityId);
    expect(sendCall?.idempotencyKey).toBe('task-test-1:send');

    const types = eventTypes(events);
    expect(types[0]).toBe('task_started');
    expect(types).toContain('approval_required');
    expect(types[types.length - 1]).toBe('task_completed');
  });

  it('denied approval fails the node and marks the task partial', async () => {
    const sendCap = makeCapability({
      capabilityId: 'quantmail.email.send',
      kind: 'command',
      riskTier: 3,
      approval: { required: true, reason: 'confirm' },
    });
    const readCap = makeCapability({ capabilityId: 'quantmail.email.resolve', kind: 'query', riskTier: 0 });
    const { host, events, invoker } = makeHost({ capabilities: [sendCap, readCap] });

    const graph = makeGraph(
      [
        makeNode({ id: 'r', kind: 'read', capabilityId: readCap.capabilityId }),
        makeNode({ id: 's', kind: 'mutate', capabilityId: sendCap.capabilityId }),
      ],
      { capabilityGrants: [sendCap.capabilityId, readCap.capabilityId] },
    );
    const control = runTask(graph, host);
    await waitFor(() => events.some((e) => e.type === 'approval_required'));
    control.grantApproval('s', false);

    const final = await control.done();
    expect(final.state).toBe('partial');
    expect(final.records.get('s')?.state).toBe('failed');
    expect(final.records.get('r')?.state).toBe('completed');
    expect(invoker.calls.some((c) => c.capabilityId === sendCap.capabilityId)).toBe(false);
  });
});

describe('runTask — parallel execution', () => {
  it('runs independent nodes in the same wave concurrently', async () => {
    const aCap = makeCapability({ capabilityId: 'q.a', kind: 'query', riskTier: 0 });
    const bCap = makeCapability({ capabilityId: 'q.b', kind: 'query', riskTier: 0 });
    const { host, invoker } = makeHost({ capabilities: [aCap, bCap], latencyMs: 60 });
    const graph = makeGraph(
      [
        makeNode({ id: 'a', kind: 'read', capabilityId: aCap.capabilityId }),
        makeNode({ id: 'b', kind: 'read', capabilityId: bCap.capabilityId }),
        makeNode({ id: 'c', kind: 'read', capabilityId: aCap.capabilityId, dependsOn: ['a', 'b'] }),
      ],
      { capabilityGrants: [aCap.capabilityId, bCap.capabilityId] },
    );
    const control = runTask(graph, host);
    const final = await control.done();
    expect(final.state).toBe('completed');
    expect(invoker.maxConcurrent).toBe(2);
  });
});

describe('runTask — clarification node', () => {
  it('pauses on clarify, resumes with the answer filed under the question key', async () => {
    const { host, events } = makeHost({});
    const graph = makeGraph([
      makeNode({
        id: 'who',
        kind: 'clarify',
        label: 'Which Rahul?',
        question: { key: 'rahul', prompt: 'Which Rahul did you mean?', options: ['Rahul Sharma', 'Rahul Verma'] },
      }),
    ]);
    const control = runTask(graph, host);
    await waitFor(() => events.some((e) => e.type === 'clarification_requested'));
    const requested = events.find((e) => e.type === 'clarification_requested') as {
      question: { prompt: string; options: string[] };
    };
    expect(requested.question.prompt).toBe('Which Rahul did you mean?');
    expect(control.records().get('who')?.waitingFor).toBe('clarification');

    control.resumeClarification('who', 'Rahul Sharma');
    const final = await control.done();
    expect(final.state).toBe('completed');
    expect(final.records.get('who')?.output).toEqual({ rahul: 'Rahul Sharma' });
  });

  it('uses the default value when a skippable clarification times out', async () => {
    const { host } = makeHost({});
    const graph = makeGraph([
      makeNode({
        id: 'who',
        kind: 'clarify',
        label: 'Which Rahul?',
        timeoutMs: 80,
        question: { key: 'rahul', prompt: 'Which?', skippable: true, defaultValue: 'first' },
      }),
    ]);
    const control = runTask(graph, host);
    const final = await control.done();
    expect(final.state).toBe('completed');
    expect(final.records.get('who')?.output).toEqual({ rahul: 'first' });
  });

  it('fails a non-skippable clarification on timeout', async () => {
    const { host } = makeHost({});
    const graph = makeGraph([
      makeNode({
        id: 'who',
        kind: 'clarify',
        label: 'Which Rahul?',
        timeoutMs: 80,
        question: { key: 'rahul', prompt: 'Which?' },
      }),
    ]);
    const control = runTask(graph, host);
    const final = await control.done();
    expect(final.state).toBe('failed');
    expect(final.records.get('who')?.state).toBe('failed');
  });
});

describe('runTask — cancellation', () => {
  it('propagates cancellation: executing aborted, planned cancelled, completed untouched', async () => {
    const slowCap = makeCapability({ capabilityId: 'q.slow', kind: 'query', riskTier: 0 });
    const fastCap = makeCapability({ capabilityId: 'q.fast', kind: 'query', riskTier: 0 });
    const { host, events } = makeHost({
      capabilities: [slowCap, fastCap],
      latencyByCapability: { 'q.fast': 40, 'q.slow': 800 },
    });
    const graph = makeGraph(
      [
        makeNode({ id: 'fast', kind: 'read', capabilityId: fastCap.capabilityId }),
        makeNode({ id: 'slow', kind: 'read', capabilityId: slowCap.capabilityId }),
        makeNode({ id: 'later', kind: 'read', capabilityId: fastCap.capabilityId, dependsOn: ['slow'] }),
      ],
      { capabilityGrants: [slowCap.capabilityId, fastCap.capabilityId] },
    );
    const control = runTask(graph, host);
    await waitFor(() => control.records().get('fast')?.state === 'completed');
    // slow is still executing; later is planned.
    control.cancel('user stopped the task');
    const final = await control.done();

    expect(final.state).toBe('cancelled');
    expect(final.records.get('fast')?.state).toBe('completed');
    expect(final.records.get('slow')?.state).toBe('cancelled');
    expect(final.records.get('later')?.state).toBe('cancelled');
    expect(events.some((e) => e.type === 'node_cancelled')).toBe(true);
  });

  it('does not abort in-flight background jobs on task cancellation', async () => {
    const bgCap = makeCapability({ capabilityId: 'q.bg', kind: 'command', riskTier: 1 });
    const { host, invoker } = makeHost({ capabilities: [bgCap], latencyMs: 200 });
    const graph = makeGraph(
      [makeNode({ id: 'bg', kind: 'background-job', capabilityId: bgCap.capabilityId })],
      { capabilityGrants: [bgCap.capabilityId] },
    );
    const control = runTask(graph, host);
    await waitFor(() => invoker.calls.length === 1);
    control.cancel('user stopped');
    // Background job is durable: let it finish on its own.
    await waitFor(() => control.records().get('bg')?.state === 'completed', 3000);
    expect(control.records().get('bg')?.state).toBe('completed');
  });
});

describe('runTask — unknown outcomes', () => {
  function unknownSetup(verdict: 'verified' | 'absent' | 'unknown') {
    const sendCap = makeCapability({
      capabilityId: 'quantmail.email.send',
      kind: 'command',
      riskTier: 1,
      idempotency: { required: true },
      verification: { required: true, successEvents: ['email.sent'], timeoutState: 'unknown' },
    });
    const setup = makeHost({
      capabilities: [sendCap],
      hang: new Set([sendCap.capabilityId]),
      verificationVerdicts: { [sendCap.capabilityId]: verdict },
    });
    const graph = makeGraph(
      [
        makeNode({
          id: 'send',
          kind: 'mutate',
          capabilityId: sendCap.capabilityId,
          timeoutMs: 100,
          maxRetries: 1,
        }),
      ],
      { capabilityGrants: [sendCap.capabilityId] },
    );
    return { ...setup, sendCap, graph };
  }

  it('timeout on mutate -> unknown -> verified: completes WITHOUT retry (no duplicate send)', async () => {
    const { host, events, invoker, verification, graph } = unknownSetup('verified');
    const control = runTask(graph, host);
    const final = await control.done();

    expect(final.records.get('send')?.state).toBe('completed');
    expect(final.records.get('send')?.output).toMatchObject({ verified: true });
    expect(invoker.calls.filter((c) => c.capabilityId === 'quantmail.email.send')).toHaveLength(1);
    expect(verification.queries).toHaveLength(1);
    expect(verification.queries[0]?.idempotencyKey).toBe('task-test-1:send');
    expect(events.some((e) => e.type === 'node_unknown')).toBe(true);
  });

  it('timeout on mutate -> unknown -> absent: retries once with the SAME idempotency key', async () => {
    const setup = unknownSetup('absent');
    // Second attempt succeeds: un-hang after the first attempt started.
    const { host, invoker, graph } = setup;
    const control = runTask(graph, host);
    // This needs the invoker to succeed on retry — replace hang after first call.
    await waitFor(() => invoker.calls.length >= 1);
    (host.invoker as unknown as { options: { hang: Set<string> } }).options.hang.clear();
    const final = await control.done();

    expect(final.records.get('send')?.state).toBe('completed');
    const sends = invoker.calls.filter((c) => c.capabilityId === 'quantmail.email.send');
    expect(sends.length).toBe(2);
    expect(sends[0]?.idempotencyKey).toBe(sends[1]?.idempotencyKey);
  });

  it('timeout on mutate -> unknown -> still unknown: stays unknown, task is partial, no blind retry', async () => {
    const { host, invoker, graph } = unknownSetup('unknown');
    const control = runTask(graph, host);
    const final = await control.done();

    expect(final.records.get('send')?.state).toBe('unknown');
    expect(final.state).toBe('partial');
    expect(invoker.calls.filter((c) => c.capabilityId === 'quantmail.email.send')).toHaveLength(1);
  });
});

describe('runTask — idempotency replay', () => {
  it('replays the stored result instead of re-executing', async () => {
    const cap = makeCapability({
      capabilityId: 'q.idem',
      kind: 'command',
      riskTier: 1,
      idempotency: { required: true },
    });
    const setup = makeHost({ capabilities: [cap], behaviors: { 'q.idem': () => ({ n: 1 }) } });
    // The host owns the store; both runs share it (e.g. Redis in production).
    const { MemoryIdempotencyStore } = await import('@quant/app-registry');
    const sharedStore = new MemoryIdempotencyStore();
    setup.host.idempotency = sharedStore;
    const graph = makeGraph([makeNode({ id: 'a', kind: 'mutate', capabilityId: cap.capabilityId })], {
      capabilityGrants: [cap.capabilityId],
    });

    const first = runTask(graph, setup.host);
    await first.done();
    expect(setup.invoker.calls).toHaveLength(1);

    // Same task id + node id => same idempotency key => replay, no second call.
    const second = runTask(graph, setup.host);
    const final = await second.done();
    expect(final.state).toBe('completed');
    expect(setup.invoker.calls).toHaveLength(1);
    expect(final.records.get('a')?.output).toEqual({ n: 1 });
  });
});

describe('runTask — scoped handoff', () => {
  it('emits a handoff envelope carrying only the declared grants', async () => {
    const { host, events } = makeHost({});
    const graph = makeGraph(
      [
        makeNode({
          id: 'h1',
          kind: 'handoff',
          appId: 'quantmail',
          handoff: {
            targetApp: 'quantmax',
            mode: 'command',
            grants: ['quantmax.game.start'],
            payload: { game: 'chess' },
          },
        }),
      ],
      { capabilityGrants: ['quantmax.game.start', 'quantmail.email.send'] },
    );
    const control = runTask(graph, host);
    const final = await control.done();

    expect(final.state).toBe('completed');
    const emitted = events.find((e) => e.type === 'handoff_emitted') as {
      handoff: { targetApp: string; mode: string; grants: string[]; correlationId: string; payload: object };
    };
    expect(emitted.handoff.targetApp).toBe('quantmax');
    expect(emitted.handoff.mode).toBe('command');
    // Scoped: only the declared grant crosses, never the ambient set.
    expect(emitted.handoff.grants).toEqual(['quantmax.game.start']);
    expect(emitted.handoff.correlationId).toBe('task-test-1:h1');
    expect(emitted.handoff.payload).toEqual({ game: 'chess' });
  });
});

describe('runTask — wait-for-event and verify', () => {
  it('pauses on wait-for-event and resumes with the payload', async () => {
    const { host, events } = makeHost({});
    const graph = makeGraph([makeNode({ id: 'w', kind: 'wait-for-event', label: 'Wait for push', timeoutMs: 2000 })]);
    const control = runTask(graph, host);
    await waitFor(() => control.records().get('w')?.waitingFor === 'event');
    expect(events.some((e) => e.type === 'node_started')).toBe(true);

    control.resolveEvent('w', { pushId: 'p-1' });
    const final = await control.done();
    expect(final.state).toBe('completed');
    expect(final.records.get('w')?.output).toEqual({ event: { pushId: 'p-1' } });
  });

  it('fails a verify node when authoritative state mismatches', async () => {
    const verifyCap = makeCapability({ capabilityId: 'q.verify', kind: 'query', riskTier: 0 });
    const { host } = makeHost({
      capabilities: [verifyCap],
      behaviors: { 'q.verify': () => ({ sent: false }) },
    });
    const graph = makeGraph(
      [
        makeNode({
          id: 'v',
          kind: 'verify',
          capabilityId: verifyCap.capabilityId,
          params: { expect: { sent: true } },
        }),
      ],
      { capabilityGrants: [verifyCap.capabilityId] },
    );
    const control = runTask(graph, host);
    const final = await control.done();
    expect(final.state).toBe('failed');
    expect(final.records.get('v')?.error).toMatch(/verification mismatch/);
  });
});

describe('runTask — control guards', () => {
  it('throws when resuming a node that is not paused', async () => {
    const { host } = makeHost({});
    const graph = makeGraph([makeNode({ id: 'a', kind: 'read' })]);
    const control = runTask(graph, host);
    await control.done();
    expect(() => control.resumeClarification('a', 'x')).toThrow(/not awaiting clarification/);
    expect(() => control.grantApproval('a', true)).toThrow(/not awaiting approval/);
    expect(() => control.resolveEvent('a', {})).toThrow(/not awaiting an event/);
  });
});
