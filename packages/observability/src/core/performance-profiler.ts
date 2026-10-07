// ============================================================================
// Performance Profiler - Function Timing, Memory Tracking, and Flame Graphs
// ============================================================================

import {
  ProfileSample,
  CallTreeNode,
  FlameGraphEntry,
  ProfilingSession,
  MemorySnapshot,
  PerformanceBudget,
} from '../types';

interface FunctionProfile {
  name: string;
  totalTime: number;
  selfTime: number;
  callCount: number;
  minTime: number;
  maxTime: number;
  children: Set<string>;
  parent: string | null;
}

export class PerformanceProfiler {
  private sessions: Map<string, ProfilingSession> = new Map();
  private activeSession: ProfilingSession | null = null;
  private functionProfiles: Map<string, FunctionProfile> = new Map();
  private callStack: string[] = [];
  private budgets: Map<string, PerformanceBudget> = new Map();
  private budgetViolations: Array<{
    functionName: string;
    duration: number;
    budget: number;
    timestamp: number;
  }> = [];
  private eventLoopSamples: number[] = [];
  private allocationTracking: Map<string, number> = new Map();
  private asyncOperations: Map<string, { startTime: number; operation: string }> = new Map();

  constructor() {}

  // Start a profiling session
  startSession(id?: string): string {
    const sessionId = id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const session: ProfilingSession = {
      id: sessionId,
      startTime: Date.now(),
      endTime: null,
      samples: [],
      memorySnapshots: [],
    };

    this.sessions.set(sessionId, session);
    this.activeSession = session;
    return sessionId;
  }

  // End a profiling session
  endSession(sessionId?: string): ProfilingSession | null {
    const id = sessionId || this.activeSession?.id;
    if (!id) return null;

    const session = this.sessions.get(id);
    if (!session) return null;

    session.endTime = Date.now();
    if (this.activeSession?.id === id) {
      this.activeSession = null;
    }
    return session;
  }

  // Time a function execution
  timeFunction<T>(name: string, fn: () => T): T {
    const startTime = Date.now();
    const startMemory = this.getHeapUsed();
    this.callStack.push(name);

    try {
      const result = fn();
      const duration = Date.now() - startTime;
      const memoryDelta = this.getHeapUsed() - startMemory;

      this.recordSample(name, duration, memoryDelta);
      this.updateFunctionProfile(name, duration);
      this.checkBudget(name, duration);

      return result;
    } finally {
      this.callStack.pop();
    }
  }

  // Time an async function execution
  async timeFunctionAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const startMemory = this.getHeapUsed();
    this.callStack.push(name);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const memoryDelta = this.getHeapUsed() - startMemory;

      this.recordSample(name, duration, memoryDelta);
      this.updateFunctionProfile(name, duration);
      this.checkBudget(name, duration);

      return result;
    } finally {
      this.callStack.pop();
    }
  }

  // Record a profile sample
  private recordSample(name: string, duration: number, memory: number): void {
    const sample: ProfileSample = {
      functionName: name,
      duration,
      memory,
      callStack: [...this.callStack],
      timestamp: Date.now(),
    };

    if (this.activeSession) {
      this.activeSession.samples.push(sample);
    }
  }

  // Update function profile statistics
  private updateFunctionProfile(name: string, duration: number): void {
    const parent = this.callStack.length > 1 ? this.callStack[this.callStack.length - 2]! : null;

    if (!this.functionProfiles.has(name)) {
      this.functionProfiles.set(name, {
        name,
        totalTime: 0,
        selfTime: 0,
        callCount: 0,
        minTime: Infinity,
        maxTime: -Infinity,
        children: new Set(),
        parent,
      });
    }

    const profile = this.functionProfiles.get(name)!;
    profile.totalTime += duration;
    profile.selfTime += duration; // Will be adjusted when children are recorded
    profile.callCount++;
    profile.minTime = Math.min(profile.minTime, duration);
    profile.maxTime = Math.max(profile.maxTime, duration);

    // Track parent-child relationship
    if (parent) {
      const parentProfile = this.functionProfiles.get(parent);
      if (parentProfile) {
        parentProfile.children.add(name);
        // Subtract child time from parent self-time
        parentProfile.selfTime = Math.max(0, parentProfile.selfTime - duration);
      }
    }
  }

  // Check performance budget
  private checkBudget(name: string, duration: number): void {
    const budget = this.budgets.get(name);
    if (budget && duration > budget.maxDuration) {
      this.budgetViolations.push({
        functionName: name,
        duration,
        budget: budget.maxDuration,
        timestamp: Date.now(),
      });
    }
  }

  // Set performance budget for a function
  setBudget(functionName: string, maxDuration: number, maxMemory: number = Infinity): void {
    this.budgets.set(functionName, { functionName, maxDuration, maxMemory });
  }

  // Remove budget
  removeBudget(functionName: string): void {
    this.budgets.delete(functionName);
  }

  // Get budget violations
  getBudgetViolations(): Array<{
    functionName: string;
    duration: number;
    budget: number;
    timestamp: number;
  }> {
    return [...this.budgetViolations];
  }

  // Record memory snapshot
  recordMemorySnapshot(): MemorySnapshot {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      heapUsed: this.getHeapUsed(),
      heapTotal: this.getHeapTotal(),
      external: 0,
      allocations: this.getTotalAllocations(),
    };

    if (this.activeSession) {
      this.activeSession.memorySnapshots.push(snapshot);
    }

    return snapshot;
  }

  // Track memory allocations per function
  recordAllocation(functionName: string, count: number = 1): void {
    const current = this.allocationTracking.get(functionName) || 0;
    this.allocationTracking.set(functionName, current + count);
  }

  // Get allocation count per function
  getAllocations(): Map<string, number> {
    return new Map(this.allocationTracking);
  }

  // Measure event loop lag
  measureEventLoopLag(): Promise<number> {
    const expectedDelay = 1;
    const start = Date.now();
    return new Promise((resolve) => {
      setTimeout(() => {
        const actual = Date.now() - start;
        const lag = actual - expectedDelay;
        this.eventLoopSamples.push(lag);
        if (this.eventLoopSamples.length > 1000) {
          this.eventLoopSamples = this.eventLoopSamples.slice(-500);
        }
        resolve(lag);
      }, expectedDelay);
    });
  }

  // Get event loop lag statistics
  getEventLoopStats(): { avg: number; p50: number; p99: number; max: number; samples: number } {
    if (this.eventLoopSamples.length === 0) {
      return { avg: 0, p50: 0, p99: 0, max: 0, samples: 0 };
    }

    const sorted = [...this.eventLoopSamples].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      avg: sum / sorted.length,
      p50: sorted[Math.ceil(sorted.length * 0.5) - 1]!,
      p99: sorted[Math.ceil(sorted.length * 0.99) - 1]!,
      max: sorted[sorted.length - 1]!,
      samples: sorted.length,
    };
  }

  // Start tracking an async operation
  startAsyncOperation(id: string, operation: string): void {
    this.asyncOperations.set(id, { startTime: Date.now(), operation });
  }

  // End tracking an async operation
  endAsyncOperation(id: string): number | null {
    const op = this.asyncOperations.get(id);
    if (!op) return null;

    const duration = Date.now() - op.startTime;
    this.asyncOperations.delete(id);
    this.recordSample(`async:${op.operation}`, duration, 0);
    return duration;
  }

  // Find hot paths (functions with most total time)
  findHotPaths(topN: number = 10): FunctionProfile[] {
    return Array.from(this.functionProfiles.values())
      .sort((a, b) => b.totalTime - a.totalTime)
      .slice(0, topN);
  }

  // Find functions with most self-time (actual CPU usage)
  findCPUHotspots(topN: number = 10): FunctionProfile[] {
    return Array.from(this.functionProfiles.values())
      .sort((a, b) => b.selfTime - a.selfTime)
      .slice(0, topN);
  }

  // Build call tree
  buildCallTree(): CallTreeNode[] {
    const roots: CallTreeNode[] = [];
    const nodeMap = new Map<string, CallTreeNode>();

    for (const [name, profile] of this.functionProfiles) {
      const node: CallTreeNode = {
        functionName: name,
        totalTime: profile.totalTime,
        selfTime: profile.selfTime,
        callCount: profile.callCount,
        children: [],
        parent: profile.parent,
      };
      nodeMap.set(name, node);
    }

    // Build tree structure
    for (const [name, profile] of this.functionProfiles) {
      const node = nodeMap.get(name)!;
      if (profile.parent && nodeMap.has(profile.parent)) {
        nodeMap.get(profile.parent)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  // Generate flame graph data
  generateFlameGraph(): FlameGraphEntry[] {
    const roots: FlameGraphEntry[] = [];

    if (!this.activeSession && this.sessions.size === 0) {
      // Build from function profiles
      const callTree = this.buildCallTree();
      return this.convertToFlameGraph(callTree, 0);
    }

    // Build from samples
    const session = this.activeSession || Array.from(this.sessions.values()).pop();
    if (!session) return roots;

    // Aggregate samples by call stack
    const stackMap = new Map<string, number>();
    for (const sample of session.samples) {
      const stackKey = sample.callStack.join(';');
      stackMap.set(stackKey, (stackMap.get(stackKey) || 0) + sample.duration);
    }

    // Build flame graph from aggregated stacks
    for (const [stack, duration] of stackMap) {
      const frames = stack.split(';');
      this.insertFlameGraphPath(roots, frames, duration, 0);
    }

    return roots;
  }

  // Convert call tree to flame graph format
  private convertToFlameGraph(nodes: CallTreeNode[], depth: number): FlameGraphEntry[] {
    return nodes.map((node) => ({
      name: node.functionName,
      value: node.totalTime,
      children: this.convertToFlameGraph(node.children, depth + 1),
      depth,
    }));
  }

  // Insert a path into flame graph
  private insertFlameGraphPath(
    roots: FlameGraphEntry[],
    frames: string[],
    duration: number,
    depth: number,
  ): void {
    if (frames.length === 0) return;

    const name = frames[0]!;
    let existing = roots.find((r) => r.name === name);

    if (!existing) {
      existing = { name, value: 0, children: [], depth };
      roots.push(existing);
    }

    existing.value += duration;
    if (frames.length > 1) {
      this.insertFlameGraphPath(existing.children, frames.slice(1), duration, depth + 1);
    }
  }

  // Detect potential memory leaks
  detectMemoryLeaks(): { leaking: boolean; growthRate: number; snapshots: MemorySnapshot[] } {
    const session = this.activeSession || Array.from(this.sessions.values()).pop();
    if (!session || session.memorySnapshots.length < 3) {
      return { leaking: false, growthRate: 0, snapshots: [] };
    }

    const snapshots = session.memorySnapshots;
    const first = snapshots[0]!;
    const last = snapshots[snapshots.length - 1]!;
    const timeDelta = (last.timestamp - first.timestamp) / 1000;

    if (timeDelta === 0) return { leaking: false, growthRate: 0, snapshots };

    const memoryGrowth = last.heapUsed - first.heapUsed;
    const growthRate = memoryGrowth / timeDelta; // bytes per second

    // Consider leaking if consistent growth > 1KB/s
    const leaking = growthRate > 1024 && this.isConsistentGrowth(snapshots);

    return { leaking, growthRate, snapshots };
  }

  // Check if memory growth is consistent (not just GC fluctuations)
  private isConsistentGrowth(snapshots: MemorySnapshot[]): boolean {
    if (snapshots.length < 3) return false;

    let increasingCount = 0;
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i]!.heapUsed > snapshots[i - 1]!.heapUsed) {
        increasingCount++;
      }
    }

    // Consider consistent if > 70% of snapshots show increase
    return increasingCount / (snapshots.length - 1) > 0.7;
  }

  // Estimate CPU time (sum of measured function durations)
  estimateCPUTime(): number {
    let total = 0;
    for (const [, profile] of this.functionProfiles) {
      total += profile.selfTime;
    }
    return total;
  }

  // Get session by ID
  getSession(sessionId: string): ProfilingSession | null {
    return this.sessions.get(sessionId) || null;
  }

  // Get active session
  getActiveSession(): ProfilingSession | null {
    return this.activeSession;
  }

  // Get all sessions
  getSessions(): ProfilingSession[] {
    return Array.from(this.sessions.values());
  }

  // Get function profile
  getFunctionProfile(name: string): FunctionProfile | null {
    return this.functionProfiles.get(name) || null;
  }

  // Simulated heap usage (since we cannot access process.memoryUsage in all environments)
  private getHeapUsed(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapUsed;
    }
    return 0;
  }

  private getHeapTotal(): number {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      return process.memoryUsage().heapTotal;
    }
    return 0;
  }

  private getTotalAllocations(): number {
    let total = 0;
    for (const [, count] of this.allocationTracking) {
      total += count;
    }
    return total;
  }

  // Get stats
  getStats(): { sessions: number; functions: number; samples: number; budgetViolations: number } {
    const totalSamples = Array.from(this.sessions.values()).reduce(
      (sum, s) => sum + s.samples.length,
      0,
    );
    return {
      sessions: this.sessions.size,
      functions: this.functionProfiles.size,
      samples: totalSamples,
      budgetViolations: this.budgetViolations.length,
    };
  }

  // Reset
  reset(): void {
    this.sessions.clear();
    this.activeSession = null;
    this.functionProfiles.clear();
    this.callStack = [];
    this.budgetViolations = [];
    this.eventLoopSamples = [];
    this.allocationTracking.clear();
    this.asyncOperations.clear();
  }
}
