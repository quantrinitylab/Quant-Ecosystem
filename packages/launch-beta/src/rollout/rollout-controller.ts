import type { RolloutState } from '../types.js';

export class RolloutController {
  private states = new Map<string, RolloutState>();
  private defaultStages = [1, 5, 25, 50, 100];

  createRollout(featureId: string, stages?: number[]): RolloutState {
    const s: RolloutState = {
      featureId,
      currentPercentage: 0,
      currentStage: -1,
      stages: stages ?? [...this.defaultStages],
      errorCount: 0,
      requestCount: 0,
      rolledBack: false,
    };
    this.states.set(featureId, s);
    return s;
  }

  advanceStage(featureId: string): boolean {
    const s = this.states.get(featureId);
    if (!s || s.rolledBack) return false;
    const nextStage = s.currentStage + 1;
    if (nextStage >= s.stages.length) return false;
    const pct = s.stages[nextStage];
    if (pct === undefined) return false;
    s.currentStage = nextStage;
    s.currentPercentage = pct;
    return true;
  }

  rollback(featureId: string): boolean {
    const s = this.states.get(featureId);
    if (!s) return false;
    s.currentPercentage = 0;
    s.currentStage = -1;
    s.rolledBack = true;
    return true;
  }

  isUserInRollout(featureId: string, userId: string): boolean {
    const s = this.states.get(featureId);
    if (!s || s.rolledBack || s.currentPercentage === 0) return false;
    const hash = this.hashUser(userId, featureId);
    return hash % 100 < s.currentPercentage;
  }

  recordRequest(featureId: string, isError: boolean): void {
    const s = this.states.get(featureId);
    if (!s) return;
    s.requestCount++;
    if (isError) s.errorCount++;
  }

  checkCanary(featureId: string, threshold: number): boolean {
    const s = this.states.get(featureId);
    if (!s || s.requestCount === 0) return true;
    const errorRate = s.errorCount / s.requestCount;
    if (errorRate > threshold) {
      this.rollback(featureId);
      return false;
    }
    return true;
  }

  getState(featureId: string): RolloutState | null {
    return this.states.get(featureId) ?? null;
  }

  getErrorRate(featureId: string): number {
    const s = this.states.get(featureId);
    if (!s || s.requestCount === 0) return 0;
    return s.errorCount / s.requestCount;
  }

  private hashUser(userId: string, featureId: string): number {
    const key = `${featureId}:${userId}`;
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
}
