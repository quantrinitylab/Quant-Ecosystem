export enum AgentState {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  WAITING_APPROVAL = 'waiting_approval',
  DONE = 'done',
  FAILED = 'failed',
}

type StateChangeListener = (from: AgentState, to: AgentState) => void;

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  [AgentState.IDLE]: [AgentState.PLANNING, AgentState.FAILED],
  [AgentState.PLANNING]: [AgentState.EXECUTING, AgentState.WAITING_APPROVAL, AgentState.FAILED],
  [AgentState.EXECUTING]: [
    AgentState.DONE,
    AgentState.FAILED,
    AgentState.WAITING_APPROVAL,
    AgentState.IDLE,
  ],
  [AgentState.WAITING_APPROVAL]: [AgentState.EXECUTING, AgentState.FAILED, AgentState.IDLE],
  [AgentState.DONE]: [AgentState.IDLE],
  [AgentState.FAILED]: [AgentState.IDLE],
};

export class AgentStateMachine {
  private currentState: AgentState = AgentState.IDLE;
  private listeners: StateChangeListener[] = [];

  getState(): AgentState {
    return this.currentState;
  }

  getValidTransitions(): AgentState[] {
    return VALID_TRANSITIONS[this.currentState] ?? [];
  }

  canTransition(to: AgentState): boolean {
    return this.getValidTransitions().includes(to);
  }

  transition(to: AgentState): void {
    if (!this.canTransition(to)) {
      throw new Error(
        `Invalid transition from ${this.currentState} to ${to}. Valid transitions: ${this.getValidTransitions().join(', ')}`,
      );
    }
    const from = this.currentState;
    this.currentState = to;
    for (const listener of this.listeners) {
      listener(from, to);
    }
  }

  on(_event: 'stateChange', listener: StateChangeListener): void {
    this.listeners.push(listener);
  }

  off(_event: 'stateChange', listener: StateChangeListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  reset(): void {
    this.currentState = AgentState.IDLE;
  }
}
