/**
 * In-process QuantyClient transport (QM intake wiring).
 *
 * Implements `@quant/quanty-client`'s QuantyClientTransport by delegating
 * directly to this service's own engines — no HTTP hop. This is the
 * bootstrap transport: same-process callers get a typed QuantyClient today;
 * a network transport can replace it later without changing call sites.
 */
import type { QuantyClientTransport } from '@quant/quanty-client';
import type {
  QuantyApprovalDecision,
  QuantySession,
  QuantyTask,
} from '@quant/quanty-contracts';
import { QuantyApprovalEngine } from './approval-engine';

export interface InProcessTransportDeps {
  approvals: QuantyApprovalEngine;
}

/**
 * Create a QuantyClientTransport bound to live orchestrator engines.
 * session.start / task.create / task.cancel are tracked in-memory;
 * approval.resolve delegates to the real approval engine (expiry + double-
 * resolve guards apply); navigation.request records the request for the
 * caller to route via the platform matrix.
 */
export function createInProcessTransport(
  deps: InProcessTransportDeps,
): QuantyClientTransport {
  const sessions = new Map<string, QuantySession>();
  const tasks = new Map<string, QuantyTask>();

  return {
    async send<T>(method: string, payload: unknown): Promise<T> {
      const p = payload as Record<string, unknown>;
      switch (method) {
        case 'session.start': {
          const now = new Date().toISOString();
          const session: QuantySession = {
            sessionId: crypto.randomUUID(),
            userId: String(p['userId'] ?? ''),
            tenantId: p['tenantId'] as string | undefined,
            mode: (p['mode'] as QuantySession['mode']) ?? 'chat',
            platform: (p['platform'] as QuantySession['platform']) ?? 'web',
            status: 'active',
            startedAt: now,
            lastActivityAt: now,
            voiceState: 'idle',
            contextScope: [],
            version: 1,
          };
          sessions.set(session.sessionId, session);
          return session as T;
        }
        case 'task.create': {
          const now = new Date().toISOString();
          const task: QuantyTask = {
            taskId: crypto.randomUUID(),
            sessionId: String(p['sessionId'] ?? ''),
            goal: String(p['goal'] ?? ''),
            status: 'planned',
            priority: Number(p['priority'] ?? 0),
            createdAt: now,
            updatedAt: now,
            verificationState: 'pending',
          };
          tasks.set(task.taskId, task);
          return task as T;
        }
        case 'task.cancel': {
          const task = tasks.get(String(p['taskId'] ?? ''));
          if (!task) throw new Error('TASK_NOT_FOUND');
          task.status = 'cancelled';
          task.cancellationRequestedAt = new Date().toISOString();
          task.updatedAt = task.cancellationRequestedAt;
          return task as T;
        }
        case 'approval.resolve': {
          const decision = String(
            p['decision'] ?? '',
          ) as QuantyApprovalDecision;
          if (decision !== 'approved' && decision !== 'rejected') {
            throw new Error('INVALID_DECISION');
          }
          return deps.approvals.resolve(
            String(p['approvalId'] ?? ''),
            decision,
          ) as T;
        }
        case 'navigation.request': {
          // Recorded for the caller; actual platform routing happens through
          // the platform CapabilityMatrix (see cross-app-task.ts).
          return {
            ok: true,
            recordedAt: new Date().toISOString(),
            request: p,
          } as T;
        }
        default:
          throw new Error(`UNKNOWN_METHOD:${method}`);
      }
    },
  };
}
