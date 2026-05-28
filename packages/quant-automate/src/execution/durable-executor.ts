import type { Automation, Checkpoint, DurableState } from '../types.js';

export class DurableExecutor {
  private states: Map<string, DurableState> = new Map();

  start(automation: Automation, _context: Record<string, unknown>): DurableState {
    const now = Date.now();
    const state: DurableState = {
      automationId: automation.id,
      currentStep: 0,
      checkpoints: [],
      resumable: true,
      startedAt: now,
      lastCheckpointAt: now,
    };

    this.states.set(automation.id, state);
    return state;
  }

  checkpoint(
    automationId: string,
    stepIndex: number,
    state: Record<string, unknown>,
    output: unknown,
  ): void {
    const durableState = this.states.get(automationId);
    if (!durableState) return;

    const now = Date.now();
    const cp: Checkpoint = {
      stepIndex,
      timestamp: now,
      state: { ...state },
      output,
    };

    durableState.checkpoints.push(cp);
    durableState.currentStep = stepIndex;
    durableState.lastCheckpointAt = now;
  }

  resume(automationId: string): DurableState | null {
    const state = this.states.get(automationId);
    if (!state || !state.resumable) return null;
    return { ...state };
  }

  getState(automationId: string): DurableState | null {
    return this.states.get(automationId) ?? null;
  }

  isResumable(automationId: string): boolean {
    const state = this.states.get(automationId);
    return state?.resumable ?? false;
  }

  clear(automationId: string): boolean {
    return this.states.delete(automationId);
  }
}
