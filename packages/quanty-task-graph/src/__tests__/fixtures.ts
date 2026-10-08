/**
 * Shared test fixtures for @quant/quanty-task-graph.
 * All capabilities/hosts here are in-memory fakes with deterministic
 * behavior — no network, no fake product data, just controllable doubles.
 */
import type { Capability, InvocationContext } from '@quant/app-registry';
import type {
  CapabilityInvoker,
  ExecutorHost,
  ForegroundNavigator,
  TaskEvent,
  TaskGraph,
  TaskNode,
  VerificationAdapter,
} from '../types';

let capabilitySeq = 0;

export function makeCapability(overrides: Partial<Capability> = {}): Capability {
  capabilitySeq += 1;
  return {
    capabilityId: `test.capability.${capabilitySeq}`,
    version: 1,
    appId: 'quantmail',
    domain: 'test',
    kind: 'command',
    owner: { appId: 'quantmail', sourceOfTruth: 'test' },
    resourceTypes: [],
    inputSchema: 'test-input',
    outputSchema: 'test-output',
    requiredScopes: [],
    riskTier: 1,
    idempotency: { required: false },
    approval: { required: false },
    verification: { required: false, successEvents: [], timeoutState: 'unknown' },
    emits: [],
    degradedMode: { mode: 'fail_closed', userState: 'unavailable' },
    status: 'active',
    ...overrides,
  };
}

export interface FakeInvokerOptions {
  /** Per-capability behavior. */
  behaviors?: Record<
    string,
    (input: unknown, ctx: InvocationContext, signal: AbortSignal) => Promise<unknown> | unknown
  >;
  /** Artificial latency per invocation (ms). */
  latencyMs?: number;
  /** Per-capability latency override (ms); falls back to latencyMs. */
  latencyByCapability?: Record<string, number>;
  /** Capabilities that should hang forever (to trigger timeouts). */
  hang?: Set<string>;
  /** Capabilities that should throw. */
  failWith?: Record<string, string>;
}

export class FakeInvoker implements CapabilityInvoker {
  readonly calls: Array<{ capabilityId: string; input: unknown; idempotencyKey?: string }> = [];
  /** Max concurrent in-flight invocations observed (for parallelism asserts). */
  maxConcurrent = 0;
  private inFlight = 0;

  constructor(private readonly options: FakeInvokerOptions = {}) {}

  async invoke(
    capability: Capability,
    input: unknown,
    context: InvocationContext,
    signal: AbortSignal,
  ): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    this.calls.push({
      capabilityId: capability.capabilityId,
      input,
      idempotencyKey: context.idempotencyKey,
    });
    this.inFlight += 1;
    this.maxConcurrent = Math.max(this.maxConcurrent, this.inFlight);
    try {
      if (this.options.hang?.has(capability.capabilityId)) {
        await new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }
      const failure = this.options.failWith?.[capability.capabilityId];
      if (failure) return { ok: false, error: failure };
      const latency = this.options.latencyByCapability?.[capability.capabilityId] ?? this.options.latencyMs;
      if (latency) {
        await new Promise<void>((res, rej) => {
          const timer = setTimeout(res, latency);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            rej(new Error('aborted'));
          });
        });
      }
      if (signal.aborted) return { ok: false, error: 'aborted' };
      const behavior = this.options.behaviors?.[capability.capabilityId];
      const data = behavior ? await behavior(input, context, signal) : { invoked: capability.capabilityId };
      return { ok: true, data };
    } finally {
      this.inFlight -= 1;
    }
  }
}

export class FakeVerification implements VerificationAdapter {
  /** verdict per capability id */
  constructor(private readonly verdicts: Record<string, 'verified' | 'absent' | 'unknown'> = {}) {}
  readonly queries: Array<{ capabilityId: string; idempotencyKey: string }> = [];
  async verify(
    capability: Capability,
    idempotencyKey: string,
    _signal: AbortSignal,
  ): Promise<'verified' | 'absent' | 'unknown'> {
    this.queries.push({ capabilityId: capability.capabilityId, idempotencyKey });
    return this.verdicts[capability.capabilityId] ?? 'unknown';
  }
}

export class FakeNavigator implements ForegroundNavigator {
  readonly navigations: Array<{ appId: string; deepLink: string }> = [];
  async navigate(
    targetApp: 'quantmail' | 'quantchat' | 'quantai' | 'quantgram' | 'quantwave' | 'quantmax' | 'quantube' | 'quantcooks' | 'quantads',
    deepLink: string,
    _signal: AbortSignal,
  ): Promise<void> {
    this.navigations.push({ appId: targetApp, deepLink });
  }
}

export interface FakeHostOptions extends FakeInvokerOptions {
  verificationVerdicts?: Record<string, 'verified' | 'absent' | 'unknown'>;
  capabilities?: Capability[];
}

export function makeHost(options: FakeHostOptions = {}): {
  host: ExecutorHost;
  invoker: FakeInvoker;
  verification: FakeVerification;
  navigator: FakeNavigator;
  events: TaskEvent[];
  registry: Map<string, Capability>;
} {
  const invoker = new FakeInvoker(options);
  const verification = new FakeVerification(options.verificationVerdicts);
  const navigator = new FakeNavigator();
  const events: TaskEvent[] = [];
  const registry = new Map<string, Capability>();
  for (const capability of options.capabilities ?? []) {
    registry.set(capability.capabilityId, capability);
  }
  const host: ExecutorHost = {
    invoker,
    verification,
    navigator,
    capabilities: { get: (id: string) => registry.get(id) },
    emit: (event: TaskEvent) => {
      events.push(event);
    },
    now: () => new Date().toISOString(),
    buildContext: (node: TaskNode) => ({
      callerType: 'quanty',
      userId: 'user-1',
      scopes: [],
      correlationId: `test:${node.id}`,
    }),
  };
  return { host, invoker, verification, navigator, events, registry };
}

let nodeSeq = 0;
export function makeNode(overrides: Partial<TaskNode> = {}): TaskNode {
  nodeSeq += 1;
  return {
    id: `node-${nodeSeq}`,
    kind: 'read',
    label: `node ${nodeSeq}`,
    appId: 'quantmail',
    dependsOn: [],
    ...overrides,
  };
}

export function makeGraph(
  nodes: TaskNode[],
  overrides: Partial<TaskGraph> = {},
): TaskGraph {
  const map: Record<string, TaskNode> = {};
  for (const node of nodes) map[node.id] = node;
  return {
    taskId: 'task-test-1',
    sessionId: 'session-test-1',
    goal: 'test goal',
    priority: 0,
    nodes: map,
    capabilityGrants: [],
    provenance: {
      actorUserId: 'user-1',
      sourceApp: 'quantmail',
      correlationId: 'corr-1',
    },
    ...overrides,
  };
}

/** Wait until a predicate holds or timeout elapses. */
export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  stepMs = 10,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((res) => setTimeout(res, stepMs));
  }
}
