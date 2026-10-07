import { TaskDecomposer, SubTask, AIInferenceAdapter } from './task-decomposer.js';
import { WorkerAgent, AgentTask } from './worker-agent.js';
import { PermissionLevel, canAct } from './permissions.js';
import { ApprovalQueue } from './approval-queue.js';
import { ConflictResolver } from './conflict-resolver.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface OrchestratorTask {
  id: string;
  description: string;
  status: TaskStatus;
  subtasks: SubTask[];
  startedAt: number;
  completedAt?: number;
}

export class Orchestrator {
  private readonly decomposer: TaskDecomposer;
  private workers: Map<string, WorkerAgent> = new Map();
  private tasks: Map<string, OrchestratorTask> = new Map();
  readonly approvalQueue: ApprovalQueue;
  readonly conflictResolver: ConflictResolver;

  constructor(ai: AIInferenceAdapter) {
    this.decomposer = new TaskDecomposer(ai);
    this.approvalQueue = new ApprovalQueue();
    this.conflictResolver = new ConflictResolver();
  }

  registerWorker(worker: WorkerAgent): void {
    this.workers.set(worker.id, worker);
  }

  deregisterWorker(workerId: string): void {
    this.workers.delete(workerId);
  }

  async executeTask(taskDescription: string): Promise<OrchestratorTask> {
    const subtasks = await this.decomposer.decompose(taskDescription);
    const prioritized = this.decomposer.prioritize(subtasks);

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const orchestratorTask: OrchestratorTask = {
      id: taskId,
      description: taskDescription,
      status: 'running',
      subtasks: prioritized,
      startedAt: Date.now(),
    };
    this.tasks.set(taskId, orchestratorTask);

    try {
      // Group subtasks by dependency level for parallel execution
      const groups = this.groupByDependencyLevel(prioritized);

      for (const group of groups) {
        // Acquire resource locks for parallel subtasks
        for (const subtask of group) {
          const resourceId = subtask.id;
          const worker = this.findSuitableWorker(subtask.requiredPermission);
          if (worker) {
            this.conflictResolver.acquireLock(resourceId, worker.id);
          }
        }

        await Promise.all(group.map((subtask) => this.dispatchSubtask(subtask)));

        // Release locks after group completes
        for (const subtask of group) {
          const lock = this.conflictResolver.getLockHolder(subtask.id);
          if (lock) {
            this.conflictResolver.releaseLock(subtask.id, lock);
          }
        }
      }

      orchestratorTask.status = 'completed';
      orchestratorTask.completedAt = Date.now();
    } catch (error) {
      orchestratorTask.status = 'failed';
      orchestratorTask.completedAt = Date.now();
      throw error;
    }

    return orchestratorTask;
  }

  getRunningAgents(): WorkerAgent[] {
    return Array.from(this.workers.values());
  }

  getTaskStatus(taskId: string): OrchestratorTask | undefined {
    return this.tasks.get(taskId);
  }

  private async dispatchSubtask(subtask: SubTask): Promise<void> {
    const worker = this.findSuitableWorker(subtask.requiredPermission);
    if (!worker) {
      throw new Error(
        `No suitable worker found for permission level: ${subtask.requiredPermission}`,
      );
    }

    // Approval gate for high-risk subtasks
    if (
      subtask.requiredPermission === PermissionLevel.ACT_HIGH ||
      subtask.requiredPermission === PermissionLevel.FULL_AUTO
    ) {
      const approvalId = `approval-${subtask.id}`;
      this.approvalQueue.submit({
        id: approvalId,
        agentId: worker.id,
        action: subtask.description,
        riskLevel: subtask.requiredPermission === PermissionLevel.FULL_AUTO ? 'critical' : 'high',
      });
    }

    const agentTask: AgentTask = {
      id: subtask.id,
      description: subtask.description,
    };

    // Reset state machine if worker finished a previous task
    worker.stateMachine.reset();
    worker.start();
    await worker.run(agentTask);
    await worker.stop();
  }

  private findSuitableWorker(requiredPermission: PermissionLevel): WorkerAgent | undefined {
    for (const worker of this.workers.values()) {
      const effectivePermission = this.getEffectivePermission(worker);
      if (canAct(effectivePermission, requiredPermission)) {
        return worker;
      }
    }
    return undefined;
  }

  private getEffectivePermission(worker: WorkerAgent): PermissionLevel {
    const trustDerived = worker.trustScore.getPermissionLevel();
    const defaultPerm = worker.defaultPermission;
    // Use defaultPermission as a floor for dispatch eligibility
    const trustRank = this.permissionRank(trustDerived);
    const defaultRank = this.permissionRank(defaultPerm);
    return trustRank >= defaultRank ? trustDerived : defaultPerm;
  }

  private permissionRank(level: PermissionLevel): number {
    const ranks: Record<PermissionLevel, number> = {
      [PermissionLevel.OBSERVE]: 0,
      [PermissionLevel.SUGGEST]: 1,
      [PermissionLevel.ACT_LOW]: 2,
      [PermissionLevel.ACT_HIGH]: 3,
      [PermissionLevel.FULL_AUTO]: 4,
    };
    return ranks[level];
  }

  private groupByDependencyLevel(subtasks: SubTask[]): SubTask[][] {
    const groups: SubTask[][] = [];
    const completed = new Set<string>();

    let remaining = [...subtasks];
    while (remaining.length > 0) {
      const currentGroup: SubTask[] = [];
      const nextRemaining: SubTask[] = [];

      for (const task of remaining) {
        const depsComplete = task.dependencies.every((d) => completed.has(d));
        if (depsComplete) {
          currentGroup.push(task);
        } else {
          nextRemaining.push(task);
        }
      }

      if (currentGroup.length === 0) {
        // Circular dependency or missing deps - just add remaining
        groups.push(nextRemaining);
        break;
      }

      groups.push(currentGroup);
      for (const task of currentGroup) {
        completed.add(task.id);
      }
      remaining = nextRemaining;
    }

    return groups;
  }
}
