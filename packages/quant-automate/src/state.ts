import type { AutomationCheckpoint, AutomationRunStatus, StepRunResult } from './types.js';

export class DurableStateManager {
  private checkpoints = new Map<string, AutomationCheckpoint>();
  private history = new Map<string, AutomationCheckpoint[]>();

  checkpoint(
    runId: string,
    automationId: string,
    currentStepIndex: number,
    stepResults: StepRunResult[],
    status: AutomationRunStatus,
  ): void {
    const now = Date.now();
    const existing = this.checkpoints.get(runId);

    const cp: AutomationCheckpoint = {
      runId,
      automationId,
      currentStepIndex,
      stepResults: [...stepResults],
      status,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    this.checkpoints.set(runId, cp);

    // Store in history
    const historyList = this.history.get(automationId) ?? [];
    const existingIdx = historyList.findIndex((h) => h.runId === runId);
    if (existingIdx >= 0) {
      historyList[existingIdx] = cp;
    } else {
      historyList.push(cp);
    }
    this.history.set(automationId, historyList);
  }

  getCheckpoint(runId: string): AutomationCheckpoint | undefined {
    return this.checkpoints.get(runId);
  }

  getLatestCheckpoint(automationId: string): AutomationCheckpoint | undefined {
    const historyList = this.history.get(automationId);
    if (!historyList || historyList.length === 0) return undefined;
    return historyList[historyList.length - 1];
  }

  getHistory(automationId: string): AutomationCheckpoint[] {
    return this.history.get(automationId) ?? [];
  }

  removeCheckpoint(runId: string): void {
    const cp = this.checkpoints.get(runId);
    if (cp) {
      this.checkpoints.delete(runId);
      const historyList = this.history.get(cp.automationId);
      if (historyList) {
        const idx = historyList.findIndex((h) => h.runId === runId);
        if (idx >= 0) {
          historyList.splice(idx, 1);
        }
      }
    }
  }

  clear(): void {
    this.checkpoints.clear();
    this.history.clear();
  }
}
