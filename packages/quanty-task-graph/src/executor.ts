/**
 * QM-QUANTY-004 — Task graph executor.
 *
 * Executes a compiled TaskGraph in dependency waves; nodes inside one wave
 * run in parallel. Implements every required behavior:
 *
 * - parallel/background work  (waves + background-job durability)
 * - foreground navigation     (navigate nodes via host.navigator)
 * - clarification node        (clarify pauses; host resumes with an answer)
 * - cancellation              (propagates to cancellable descendants;
 *                              in-flight background jobs are durable and
 *                              survive task cancellation)
 * - unknown outcome           (mutate timeout -> 'unknown' -> authoritative
 *                              verification before any retry)
 * - verification              (verify nodes check authoritative state)
 * - scoped handoff            (handoff nodes emit envelopes carrying ONLY
 *                              their declared grants)
 *
 * The executor never calls product backends directly and never invents
 * capabilities: invocation goes through host.invoker, policy through
 * evaluatePolicy, idempotency through the registry's idempotency helpers.
 */

import {
  checkIdempotency,
  evaluatePolicy,
  recordIdempotency,
  MemoryIdempotencyStore,
} from '@quant/app-registry';
import type { Capability, InvocationContext } from '@quant/app-registry';
import { scopeHandoffGrants, topologicalWaves } from './compiler';
import { mayRetry, resolveUnknownOutcome } from './verification';
import {
  MUTATING_NODE_KINDS,
  type ClarificationQuestion,
  type ExecutorHost,
  type NodeExecutionState,
  type NodeRunRecord,
  type ScopedHandoff,
  type TaskEvent,
  type TaskGraph,
  type TaskNode,
} from './types';

export interface TaskFinalState {
  state: 'completed' | 'partial' | 'failed' | 'cancelled';
  records: ReadonlyMap<string, NodeRunRecord>;
}

export interface TaskControl {
  readonly taskId: string;
  cancel(reason: string): void;
  resumeClarification(nodeId: string, answer: unknown): void;
  grantApproval(nodeId: string, granted: boolean): void;
  resolveEvent(nodeId: string, payload: unknown): void;
  reportBackgroundResult(nodeId: string, result: unknown): void;
  records(): ReadonlyMap<string, NodeRunRecord>;
  done(): Promise<TaskFinalState>;
}

const DEFAULT_TIMEOUT_MS: Record<string, number> = {
  'background-job': 10 * 60 * 1000,
  'wait-for-user': 15 * 60 * 1000,
  'wait-for-event': 15 * 60 * 1000,
  clarify: 15 * 60 * 1000,
};
const DEFAULT_TIMEOUT_FALLBACK_MS = 30 * 1000;

interface PauseGate {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

function createGate(): PauseGate {
  let resolve!: (value: unknown) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // Never let an unobserved rejection crash the host.
  promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** Resolve `{ $output: '<nodeId>.<key>' }` placeholders against completed deps. */
function resolveParams(
  params: Record<string, unknown> | undefined,
  outputs: Map<string, Record<string, unknown>>,
): Record<string, unknown> {
  const resolveValue = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(resolveValue);
    if (value !== null && typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      if (typeof obj.$output === 'string') {
        const [nodeId, ...rest] = (obj.$output as string).split('.');
        const key = rest.join('.');
        const out = nodeId ? outputs.get(nodeId) : undefined;
        if (!out || !(key in out)) {
          throw new Error(`unresolvable $output reference "${obj.$output}"`);
        }
        return out[key];
      }
      const resolved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) resolved[k] = resolveValue(v);
      return resolved;
    }
    return value;
  };
  if (!params) return {};
  return resolveValue(params) as Record<string, unknown>;
}

function isSubset(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === (actual as unknown[]).length &&
      expected.every((e, i) => isSubset((actual as unknown[])[i], e))
    );
  }
  return Object.entries(expected as Record<string, unknown>).every(([k, v]) =>
    isSubset((actual as Record<string, unknown>)[k], v),
  );
}

export function runTask(graph: TaskGraph, host: ExecutorHost): TaskControl {
  const records = new Map<string, NodeRunRecord>();
  const gates = new Map<string, PauseGate>();
  const controllers = new Map<string, AbortController>();
  const outputs = new Map<string, Record<string, unknown>>();
  const idempotency = host.idempotency ?? new MemoryIdempotencyStore();

  for (const id of Object.keys(graph.nodes)) {
    records.set(id, { nodeId: id, state: 'planned', attempt: 0 });
  }

  let cancelRequested: string | null = null;
  let doneResolve!: (state: TaskFinalState) => void;
  const donePromise = new Promise<TaskFinalState>((res) => {
    doneResolve = res;
  });

  const emit = (event: TaskEvent): void => {
    try {
      host.emit(event);
    } catch {
      // Event sinks must never break execution.
    }
  };

  const setState = (
    nodeId: string,
    state: NodeExecutionState,
    extra?: Partial<NodeRunRecord>,
  ): void => {
    const record = records.get(nodeId);
    if (!record) return;
    Object.assign(record, extra ?? {}, { state });
    if (state === 'executing' && !record.startedAt) record.startedAt = host.now();
    if (
      state === 'completed' ||
      state === 'failed' ||
      state === 'cancelled' ||
      state === 'unknown'
    ) {
      record.finishedAt = host.now();
    }
  };

  const failNode = (nodeId: string, error: string, terminal = true): void => {
    setState(nodeId, 'failed', { error });
    emit({ type: 'node_failed', taskId: graph.taskId, nodeId, at: host.now(), error, terminal });
  };

  const cancelNode = (nodeId: string, reason: string): void => {
    const record = records.get(nodeId);
    if (!record) return;
    if (
      record.state === 'completed' ||
      record.state === 'failed' ||
      record.state === 'cancelled'
    ) {
      return;
    }
    controllers.get(nodeId)?.abort();
    gates.get(nodeId)?.reject(new Error(`cancelled: ${reason}`));
    setState(nodeId, 'cancelled', { error: reason });
    emit({ type: 'node_cancelled', taskId: graph.taskId, nodeId, at: host.now(), reason });
  };

  const awaitPause = async (
    nodeId: string,
    waitingFor: 'approval' | 'clarification' | 'event',
  ): Promise<unknown> => {
    const gate = createGate();
    gates.set(nodeId, gate);
    setState(nodeId, waitingFor === 'approval' ? 'waiting_approval' : 'executing', {
      waitingFor,
    });
    try {
      return await gate.promise;
    } finally {
      gates.delete(nodeId);
    }
  };

  const invokeCapability = async (
    node: TaskNode,
    capability: Capability,
  ): Promise<Record<string, unknown>> => {
    const record = records.get(node.id);
    const controller = new AbortController();
    controllers.set(node.id, controller);
    try {
      const context: InvocationContext = host.buildContext(node, graph);
      if (MUTATING_NODE_KINDS.has(node.kind)) {
        // Operation-scoped key (no attempt suffix): retries of the same
        // logical operation MUST share the key so the product can dedupe.
        context.idempotencyKey = `${graph.taskId}:${node.id}`;
        if (record) record.idempotencyKey = context.idempotencyKey;
      }

      const decision = evaluatePolicy(capability, context);
      if (!decision.allowed) {
        throw new Error(`denied by policy: ${decision.error}${decision.detail ? ` — ${decision.detail}` : ''}`);
      }
      if (decision.requiresApproval && !context.approvalGranted) {
        setState(node.id, 'waiting_approval', {
          waitingFor: 'approval',
          approvalReason: decision.approvalReason,
        });
        emit({
          type: 'approval_required',
          taskId: graph.taskId,
          nodeId: node.id,
          at: host.now(),
          reason: decision.approvalReason,
          capabilityId: capability.capabilityId,
        });
        const granted = await awaitPause(node.id, 'approval');
        if (granted !== true) {
          throw new Error('approval denied by user');
        }
        setState(node.id, 'executing', { waitingFor: undefined });
      }

      const idem = await checkIdempotency(capability, context, idempotency);
      if (idem.replay) {
        return (idem.result as Record<string, unknown>) ?? {};
      }

      const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_FALLBACK_MS;
      const invocation = host.invoker.invoke(
        capability,
        resolveParams(node.params, outputs),
        context,
        controller.signal,
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(`node timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      });
      try {
        const result = await Promise.race([invocation, timeout]);
        if (timer) clearTimeout(timer);
        if (!result.ok) {
          throw new Error(result.error ?? 'capability invocation failed');
        }
        const output = (result.data as Record<string, unknown>) ?? {};
        await recordIdempotency(capability, context, idempotency, output);
        return output;
      } catch (err) {
        if (timer) clearTimeout(timer);
        throw err;
      }
    } finally {
      controllers.delete(node.id);
    }
  };

  const executeNode = async (node: TaskNode): Promise<void> => {
    const record = records.get(node.id);
    if (!record || cancelRequested) return;
    if (record.state !== 'planned') return;

    record.attempt += 1;
    const attempt = record.attempt;
    setState(node.id, 'executing');
    emit({ type: 'node_started', taskId: graph.taskId, nodeId: node.id, at: host.now() });

    const complete = (output?: Record<string, unknown>): void => {
      const out = output ?? {};
      outputs.set(node.id, out);
      setState(node.id, 'completed', { output: out, waitingFor: undefined });
      emit({ type: 'node_completed', taskId: graph.taskId, nodeId: node.id, at: host.now(), output: out });
    };

    try {
      switch (node.kind) {
        case 'read':
        case 'draft':
        case 'mutate':
        case 'compensate': {
          const capability = host.capabilities.get(node.capabilityId ?? '');
          if (!capability) throw new Error(`unknown capability "${node.capabilityId}"`);
          try {
            const output = await invokeCapability(node, capability);
            complete(output);
          } catch (err) {
            // Cancellation wins over every failure classification: the node
            // was already recorded as 'cancelled' by cancelNode().
            if (cancelRequested) return;
            const message = err instanceof Error ? err.message : String(err);
            const isTimeout = message.includes('timed out');
            if (isTimeout && MUTATING_NODE_KINDS.has(node.kind)) {
              // Doc 28: timeout after a mutation is unknown_outcome, not failure.
              const key = record?.idempotencyKey ?? `${graph.taskId}:${node.id}`;
              setState(node.id, 'unknown', { error: message });
              emit({
                type: 'node_unknown',
                taskId: graph.taskId,
                nodeId: node.id,
                at: host.now(),
                reason: message,
              });
              const resolution = await resolveUnknownOutcome(
                capability,
                key,
                host.verification,
                controllers.get(node.id)?.signal ?? new AbortController().signal,
              );
              if (resolution.outcome === 'verified') {
                complete({ verified: true, note: resolution.detail });
              } else if (resolution.outcome === 'absent') {
                const retry = mayRetry({
                  attempt,
                  maxRetries: node.maxRetries ?? 0,
                  idempotencyRequired: capability.idempotency.required,
                  idempotencyKeyPresent: true,
                });
                if (retry.allowed) {
                  record.attempt += 1;
                  const output = await invokeCapability(node, capability);
                  complete(output);
                } else {
                  failNode(node.id, `unknown outcome could not be resolved: ${resolution.detail}`);
                }
              } else {
                failNode(node.id, `unknown outcome: ${resolution.detail}`, false);
                setState(node.id, 'unknown', { error: resolution.detail });
              }
            } else {
              const retry = mayRetry({
                attempt,
                maxRetries: node.maxRetries ?? 0,
                idempotencyRequired: capability.idempotency.required,
                idempotencyKeyPresent: !!record?.idempotencyKey,
              });
              if (retry.allowed && !isTimeout) {
                record.attempt += 1;
                const output = await invokeCapability(node, capability);
                complete(output);
              } else {
                failNode(node.id, message);
              }
            }
          }
          break;
        }

        case 'verify': {
          const capability = host.capabilities.get(node.capabilityId ?? '');
          if (!capability) throw new Error(`unknown capability "${node.capabilityId}"`);
          const output = await invokeCapability(node, capability);
          const expected = node.params?.expect;
          if (expected !== undefined && !isSubset(output, expected)) {
            failNode(
              node.id,
              `verification mismatch: authoritative state does not match expected ${JSON.stringify(expected)}`,
            );
          } else {
            complete({ ...output, verified: true });
          }
          break;
        }

        case 'background-job': {
          const capability = host.capabilities.get(node.capabilityId ?? '');
          // Durable: once started, task cancellation does not abort it.
          const bgController = new AbortController();
          const invocation = (async () => {
            try {
              // No capability bound: the job is a lifecycle marker the host
              // tracks externally (e.g. via reportBackgroundResult).
              if (!capability) {
                const out = { background: true, note: 'no capability bound; tracked externally' };
                outputs.set(node.id, out);
                setState(node.id, 'completed', { output: out });
                emit({
                  type: 'node_completed',
                  taskId: graph.taskId,
                  nodeId: node.id,
                  at: host.now(),
                  output: out,
                });
                return;
              }
              const context = host.buildContext(node, graph);
              context.idempotencyKey = `${graph.taskId}:${node.id}`;
              const result = await host.invoker.invoke(
                capability,
                resolveParams(node.params, outputs),
                context,
                bgController.signal,
              );
              const out = (result.data as Record<string, unknown>) ?? {};
              outputs.set(node.id, out);
              setState(node.id, 'completed', { output: out });
              emit({
                type: 'node_completed',
                taskId: graph.taskId,
                nodeId: node.id,
                at: host.now(),
                output: out,
              });
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              failNode(node.id, message);
            }
          })();
          // Track but do not await: the wave proceeds; dependents gate on completion.
          backgroundPromises.set(node.id, invocation);
          break;
        }

        case 'navigate': {
          const deepLink = (node.params?.deepLink as string) ?? '';
          const controller = new AbortController();
          controllers.set(node.id, controller);
          try {
            const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_FALLBACK_MS;
            await Promise.race([
              host.navigator.navigate(node.appId, deepLink, controller.signal),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error(`navigate timed out after ${timeoutMs}ms`)), timeoutMs),
              ),
            ]);
            complete({ deepLink, foregrounded: node.id === graph.foregroundNodeId });
          } finally {
            controllers.delete(node.id);
          }
          break;
        }

        case 'clarify':
        case 'wait-for-user': {
          const question: ClarificationQuestion =
            node.question ?? { key: node.id, prompt: node.label, skippable: false };
          const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS[node.kind] ?? DEFAULT_TIMEOUT_FALLBACK_MS;
          emit({
            type: 'clarification_requested',
            taskId: graph.taskId,
            nodeId: node.id,
            at: host.now(),
            question: {
              key: question.key,
              prompt: question.prompt,
              options: question.options,
              skippable: question.skippable,
              defaultValue: question.defaultValue,
            },
          });
          const answer = await Promise.race([
            awaitPause(node.id, 'clarification'),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('clarification timed out')), timeoutMs),
            ),
          ]).catch((err: Error) => {
            // Cancellation must never be swallowed by the skippable fallback.
            if (cancelRequested || err.message.startsWith('cancelled:')) throw err;
            if (question.skippable) return question.defaultValue;
            throw err;
          });
          complete({ [question.key]: answer });
          break;
        }

        case 'wait-for-event': {
          const timeoutMs = node.timeoutMs ?? DEFAULT_TIMEOUT_MS[node.kind] ?? DEFAULT_TIMEOUT_FALLBACK_MS;
          const payload = await Promise.race([
            awaitPause(node.id, 'event'),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('wait-for-event timed out')), timeoutMs),
            ),
          ]);
          complete({ event: payload });
          break;
        }

        case 'handoff': {
          if (!node.handoff) throw new Error('handoff node declares no handoff payload');
          const grants = scopeHandoffGrants(graph.capabilityGrants, node.handoff.grants);
          const handoff: ScopedHandoff = {
            targetApp: node.handoff.targetApp,
            mode: node.handoff.mode,
            grants,
            payload: resolveParams(node.handoff.payload, outputs),
            correlationId: `${graph.taskId}:${node.id}`,
          };
          emit({ type: 'handoff_emitted', taskId: graph.taskId, nodeId: node.id, at: host.now(), handoff });
          complete({ handoff });
          break;
        }

        default: {
          const exhaustive: never = node.kind;
          throw new Error(`unhandled node kind "${String(exhaustive)}"`);
        }
      }
    } catch (err) {
      if (cancelRequested) {
        // Cancellation already recorded the state; don't overwrite.
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      failNode(node.id, message);
    }
  };

  /** Promises for detached background jobs, keyed by node id. */
  const backgroundPromises = new Map<string, Promise<void>>();

  const nodeGate = async (nodeId: string): Promise<void> => {
    // Wait until the node leaves planned/executing/waiting states.
    for (;;) {
      const record = records.get(nodeId);
      if (!record) return;
      if (
        record.state === 'completed' ||
        record.state === 'failed' ||
        record.state === 'cancelled' ||
        record.state === 'unknown'
      ) {
        return;
      }
      await new Promise((res) => setTimeout(res, 25));
    }
  };

  const run = async (): Promise<void> => {
    emit({ type: 'task_started', taskId: graph.taskId, at: host.now() });
    const waves = topologicalWaves(graph);

    for (const wave of waves) {
      if (cancelRequested) break;
      if (graph.deadlineAt && host.now() > graph.deadlineAt) {
        control.cancel('deadline exceeded');
        break;
      }
      // A node may run only when every dependency completed successfully.
      const runnable = wave.filter((id) => {
        const node = graph.nodes[id];
        return (node?.dependsOn ?? []).every((dep) => records.get(dep)?.state === 'completed');
      });
      const skipped = wave.filter((id) => !runnable.includes(id));
      for (const id of skipped) {
        cancelNode(id, 'upstream dependency did not complete');
      }
      await Promise.allSettled(runnable.map((id) => executeNode(graph.nodes[id] as TaskNode)));
      // Dependents of background jobs wait for their completion via nodeGate.
      for (const id of runnable) {
        const node = graph.nodes[id];
        if (node?.kind === 'background-job') {
          await nodeGate(id);
        }
      }
      if (cancelRequested) break;
    }

    // Anything never reached is not silently left 'planned'.
    // In-flight background jobs are durable: they are NOT cancelled here;
    // their detached promise completes them and emits the terminal event.
    for (const [id, record] of records) {
      const node = graph.nodes[id];
      const isDurableBg = node?.kind === 'background-job' && record.state === 'executing';
      if (record.state === 'planned') {
        cancelNode(id, cancelRequested ?? 'not reached: task finished');
      } else if (
        (record.state === 'executing' || record.state === 'waiting_approval') &&
        cancelRequested &&
        !isDurableBg
      ) {
        cancelNode(id, cancelRequested);
      }
    }

    // Best-effort compensation for cancelled mutating nodes that declared it.
    if (cancelRequested) {
      for (const [id, record] of records) {
        const node = graph.nodes[id];
        if (
          record.state === 'cancelled' &&
          node?.compensateWith &&
          records.get(node.compensateWith)?.state === 'planned'
        ) {
          const compNode = graph.nodes[node.compensateWith];
          if (compNode) {
            try {
              await executeNode({ ...compNode, dependsOn: [] });
            } catch {
              // Compensation is best-effort; the failure is already recorded.
            }
          }
        }
      }
    }

    let finalState: TaskFinalState['state'] = 'completed';
    if (cancelRequested) {
      finalState = 'cancelled';
    } else {
      let failed = 0;
      let unknown = 0;
      let completed = 0;
      for (const record of records.values()) {
        if (record.state === 'failed') failed += 1;
        else if (record.state === 'unknown') unknown += 1;
        else if (record.state === 'completed') completed += 1;
      }
      if (unknown > 0 || (failed > 0 && completed > 0)) finalState = 'partial';
      else if (failed > 0) finalState = 'failed';
    }

    emit({ type: 'task_completed', taskId: graph.taskId, at: host.now(), state: finalState });
    doneResolve({ state: finalState, records });
  };

  const control: TaskControl = {
    taskId: graph.taskId,

    cancel(reason: string): void {
      if (cancelRequested) return;
      cancelRequested = reason;
      // Propagate to every cancellable node. In-flight background jobs are
      // durable: they are NOT aborted.
      for (const [id, record] of records) {
        const node = graph.nodes[id];
        if (node?.kind === 'background-job' && record.state === 'executing') continue;
        if (
          record.state === 'planned' ||
          record.state === 'executing' ||
          record.state === 'waiting_approval'
        ) {
          cancelNode(id, reason);
        }
      }
    },

    resumeClarification(nodeId: string, answer: unknown): void {
      const gate = gates.get(nodeId);
      const record = records.get(nodeId);
      if (!gate || !record || record.waitingFor !== 'clarification') {
        throw new Error(`node "${nodeId}" is not awaiting clarification`);
      }
      gate.resolve(answer);
    },

    grantApproval(nodeId: string, granted: boolean): void {
      const gate = gates.get(nodeId);
      const record = records.get(nodeId);
      if (!gate || !record || record.waitingFor !== 'approval') {
        throw new Error(`node "${nodeId}" is not awaiting approval`);
      }
      gate.resolve(granted);
    },

    resolveEvent(nodeId: string, payload: unknown): void {
      const gate = gates.get(nodeId);
      const record = records.get(nodeId);
      if (!gate || !record || record.waitingFor !== 'event') {
        throw new Error(`node "${nodeId}" is not awaiting an event`);
      }
      gate.resolve(payload);
    },

    reportBackgroundResult(nodeId: string, result: unknown): void {
      const record = records.get(nodeId);
      if (!record) throw new Error(`unknown node "${nodeId}"`);
      const out = (result as Record<string, unknown>) ?? {};
      outputs.set(nodeId, out);
      setState(nodeId, 'completed', { output: out });
      emit({ type: 'node_completed', taskId: graph.taskId, nodeId, at: host.now(), output: out });
    },

    records: () => records,

    done: () => donePromise,
  };

  // Kick off asynchronously; control is returned synchronously.
  void run();
  return control;
}
