import { describe, it, expect, vi } from 'vitest';
import { AgentState, AgentStateMachine } from '../state-machine.js';

describe('AgentStateMachine', () => {
  it('starts in idle state', () => {
    const sm = new AgentStateMachine();
    expect(sm.getState()).toBe(AgentState.IDLE);
  });

  it('allows valid transitions', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentState.PLANNING);
    expect(sm.getState()).toBe(AgentState.PLANNING);

    sm.transition(AgentState.EXECUTING);
    expect(sm.getState()).toBe(AgentState.EXECUTING);

    sm.transition(AgentState.DONE);
    expect(sm.getState()).toBe(AgentState.DONE);
  });

  it('throws on invalid transitions', () => {
    const sm = new AgentStateMachine();
    expect(() => sm.transition(AgentState.DONE)).toThrow(/Invalid transition/);
    expect(() => sm.transition(AgentState.EXECUTING)).toThrow(/Invalid transition/);
  });

  it('reports valid transitions from current state', () => {
    const sm = new AgentStateMachine();
    const transitions = sm.getValidTransitions();
    expect(transitions).toContain(AgentState.PLANNING);
    expect(transitions).toContain(AgentState.FAILED);
    expect(transitions).not.toContain(AgentState.DONE);
  });

  it('emits state change events', () => {
    const sm = new AgentStateMachine();
    const listener = vi.fn();
    sm.on('stateChange', listener);

    sm.transition(AgentState.PLANNING);
    expect(listener).toHaveBeenCalledWith(AgentState.IDLE, AgentState.PLANNING);

    sm.transition(AgentState.EXECUTING);
    expect(listener).toHaveBeenCalledWith(AgentState.PLANNING, AgentState.EXECUTING);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('can remove listeners', () => {
    const sm = new AgentStateMachine();
    const listener = vi.fn();
    sm.on('stateChange', listener);
    sm.off('stateChange', listener);

    sm.transition(AgentState.PLANNING);
    expect(listener).not.toHaveBeenCalled();
  });

  it('can reset to idle', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentState.PLANNING);
    sm.reset();
    expect(sm.getState()).toBe(AgentState.IDLE);
  });

  it('canTransition checks without throwing', () => {
    const sm = new AgentStateMachine();
    expect(sm.canTransition(AgentState.PLANNING)).toBe(true);
    expect(sm.canTransition(AgentState.DONE)).toBe(false);
  });

  it('supports waiting_approval from planning', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentState.PLANNING);
    sm.transition(AgentState.WAITING_APPROVAL);
    expect(sm.getState()).toBe(AgentState.WAITING_APPROVAL);
  });

  it('can transition from failed back to idle', () => {
    const sm = new AgentStateMachine();
    sm.transition(AgentState.FAILED);
    sm.transition(AgentState.IDLE);
    expect(sm.getState()).toBe(AgentState.IDLE);
  });
});
