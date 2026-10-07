import type {
  BudgetConfig,
  SwarmGoal,
  SubGoal,
  AgentAssignment,
  GoalState,
  RetryConfig,
  ObservationHook,
} from '../types.js';

const uid = () => crypto.randomUUID();
const now = () => Date.now();

export class SwarmOrchestrator {
  private goals = new Map<string, SwarmGoal>();
  private subs = new Map<string, SubGoal>();
  private asgn = new Map<string, AgentAssignment>();
  private retryConfigs = new Map<string, RetryConfig>();
  private hooks: ObservationHook[] = [];

  addObserver(hook: ObservationHook): void {
    this.hooks.push(hook);
  }

  setRetryConfig(goalId: string, config: RetryConfig): void {
    this.retryConfigs.set(goalId, config);
  }

  createGoal(desc: string, budget: BudgetConfig, owner?: { userId?: string; tenantId?: string }): SwarmGoal {
    const g: SwarmGoal = {
      id: uid(),
      description: desc,
      state: 'pending',
      subGoals: [],
      budget,
      createdAt: now(),
      userId: owner?.userId,
      tenantId: owner?.tenantId,
    };
    this.goals.set(g.id, g);
    return g;
  }

  decompose(
    gid: string,
    descs: string[],
    options?: { priorities?: number[]; dependencies?: string[][] },
  ): SubGoal[] {
    const g = this.goals.get(gid);
    if (!g) return [];
    this.setState(g, 'decomposing');
    g.subGoals = descs.map((d, i) => {
      const s: SubGoal = {
        id: uid(),
        parentId: gid,
        description: d,
        assignedAgent: null,
        state: 'pending',
        priority: options?.priorities?.[i] ?? 0,
        dependsOn: options?.dependencies?.[i] ?? [],
        retryCount: 0,
      };
      this.subs.set(s.id, s);
      return s;
    });
    return g.subGoals;
  }

  assign(sid: string, agentId: string): AgentAssignment | null {
    const s = this.subs.get(sid);
    if (!s) return null;

    // Check dependencies
    for (const depId of s.dependsOn) {
      const dep = this.subs.get(depId);
      if (dep && dep.state !== 'completed') return null;
    }

    s.assignedAgent = agentId;
    this.setSubGoalState(s, 'running');
    const a: AgentAssignment = { agentId, subGoalId: sid, assignedAt: now(), completedAt: null };
    this.asgn.set(sid, a);
    return a;
  }

  completeSubGoal(sid: string): boolean {
    const s = this.subs.get(sid);
    if (!s) return false;
    this.setSubGoalState(s, 'completed');
    const a = this.asgn.get(sid);
    if (a) a.completedAt = now();
    this.notifyProgress(s.parentId);
    return true;
  }

  failSubGoal(sid: string): boolean {
    const s = this.subs.get(sid);
    if (!s) return false;
    const retryConfig = this.retryConfigs.get(s.parentId);
    if (retryConfig && s.retryCount < retryConfig.maxRetries) {
      s.retryCount++;
      this.setSubGoalState(s, 'retrying');
      return true;
    }
    this.setSubGoalState(s, 'failed');
    this.notifyProgress(s.parentId);
    return true;
  }

  cancelGoal(gid: string): boolean {
    const g = this.goals.get(gid);
    if (!g) return false;
    this.setState(g, 'cancelled');
    for (const s of g.subGoals) {
      if (s.state !== 'completed' && s.state !== 'failed') {
        this.setSubGoalState(s, 'cancelled');
      }
    }
    return true;
  }

  cancelSubGoal(sid: string): boolean {
    const s = this.subs.get(sid);
    if (!s) return false;
    this.setSubGoalState(s, 'cancelled');
    return true;
  }

  getNextByPriority(gid: string): SubGoal | null {
    const g = this.goals.get(gid);
    if (!g) return null;
    const pending = g.subGoals
      .filter((s) => s.state === 'pending')
      .filter((s) =>
        s.dependsOn.every((depId) => {
          const dep = this.subs.get(depId);
          return dep && dep.state === 'completed';
        }),
      )
      .sort((a, b) => b.priority - a.priority);
    return pending[0] ?? null;
  }

  getRetryDelay(sid: string): number {
    const s = this.subs.get(sid);
    if (!s) return 0;
    const cfg = this.retryConfigs.get(s.parentId);
    if (!cfg) return 0;
    return cfg.initialDelayMs * Math.pow(cfg.backoffFactor, s.retryCount - 1);
  }

  getProgress(gid: string) {
    const g = this.goals.get(gid);
    if (!g) return { total: 0, completed: 0, failed: 0 };
    const ss = g.subGoals;
    return {
      total: ss.length,
      completed: ss.filter((x) => x.state === 'completed').length,
      failed: ss.filter((x) => x.state === 'failed').length,
    };
  }

  getGoal(gid: string): SwarmGoal | null {
    return this.goals.get(gid) ?? null;
  }

  getSubGoal(sid: string): SubGoal | null {
    return this.subs.get(sid) ?? null;
  }

  checkTimeout(gid: string): boolean {
    const g = this.goals.get(gid);
    return g ? now() - g.createdAt >= g.budget.maxTimeMs : false;
  }

  private setState(g: SwarmGoal, state: GoalState): void {
    const from = g.state;
    g.state = state;
    for (const hook of this.hooks) {
      hook.onStateChange?.(g.id, from, state);
    }
  }

  private setSubGoalState(s: SubGoal, state: GoalState): void {
    const from = s.state;
    s.state = state;
    for (const hook of this.hooks) {
      hook.onStateChange?.(s.id, from, state);
    }
  }

  private notifyProgress(gid: string): void {
    const progress = this.getProgress(gid);
    for (const hook of this.hooks) {
      hook.onProgress?.(gid, progress.completed, progress.total);
    }
  }
}
