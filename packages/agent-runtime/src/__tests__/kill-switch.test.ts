import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KillSwitch } from '../kill-switch.js';

describe('KillSwitch', () => {
  beforeEach(() => {
    KillSwitch.resetInstance();
  });

  it('is a singleton', () => {
    const a = KillSwitch.getInstance();
    const b = KillSwitch.getInstance();
    expect(a).toBe(b);
  });

  it('registers agents', () => {
    const ks = KillSwitch.getInstance();
    ks.register('agent-1', vi.fn().mockResolvedValue(undefined));
    ks.register('agent-2', vi.fn().mockResolvedValue(undefined));
    expect(ks.getRegisteredAgentCount()).toBe(2);
  });

  it('deregisters agents', () => {
    const ks = KillSwitch.getInstance();
    ks.register('agent-1', vi.fn().mockResolvedValue(undefined));
    ks.deregister('agent-1');
    expect(ks.getRegisteredAgentCount()).toBe(0);
  });

  it('activates and halts all agents', async () => {
    const ks = KillSwitch.getInstance();
    const halt1 = vi.fn().mockResolvedValue(undefined);
    const halt2 = vi.fn().mockResolvedValue(undefined);
    const halt3 = vi.fn().mockResolvedValue(undefined);

    ks.register('agent-1', halt1);
    ks.register('agent-2', halt2);
    ks.register('agent-3', halt3);

    await ks.activate();

    expect(halt1).toHaveBeenCalledOnce();
    expect(halt2).toHaveBeenCalledOnce();
    expect(halt3).toHaveBeenCalledOnce();
    expect(ks.isActive()).toBe(true);
  });

  it('halts all agents in less than 500ms', async () => {
    const ks = KillSwitch.getInstance();

    // Simulate agents that take some time to halt
    for (let i = 0; i < 10; i++) {
      ks.register(`agent-${i}`, () => new Promise((resolve) => setTimeout(resolve, 100)));
    }

    const start = Date.now();
    await ks.activate();
    const elapsed = Date.now() - start;

    // Because Promise.all runs them concurrently, 10 agents each taking 100ms
    // should complete well under 500ms
    expect(elapsed).toBeLessThan(500);
  });

  it('voice activate triggers halt', async () => {
    const ks = KillSwitch.getInstance();
    const halt = vi.fn().mockResolvedValue(undefined);
    ks.register('agent-1', halt);

    await ks.voiceActivate();

    expect(halt).toHaveBeenCalledOnce();
    expect(ks.isActive()).toBe(true);
  });

  it('resets the kill switch', async () => {
    const ks = KillSwitch.getInstance();
    ks.register('agent-1', vi.fn().mockResolvedValue(undefined));
    await ks.activate();
    expect(ks.isActive()).toBe(true);

    ks.reset();
    expect(ks.isActive()).toBe(false);
  });

  it('clears agents map after activation', async () => {
    const ks = KillSwitch.getInstance();
    ks.register('agent-1', vi.fn().mockResolvedValue(undefined));
    ks.register('agent-2', vi.fn().mockResolvedValue(undefined));

    await ks.activate();

    expect(ks.getRegisteredAgentCount()).toBe(0);
  });

  it('resolves within 500ms even if a callback hangs', async () => {
    const ks = KillSwitch.getInstance();
    // Register a callback that never resolves
    ks.register('hanging-agent', () => new Promise<void>(() => {}));
    ks.register('fast-agent', vi.fn().mockResolvedValue(undefined));

    const start = Date.now();
    await ks.activate();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(600);
    expect(ks.isActive()).toBe(true);
    expect(ks.getRegisteredAgentCount()).toBe(0);
  });

  it('reset clears registered agents', () => {
    const ks = KillSwitch.getInstance();
    ks.register('agent-1', vi.fn().mockResolvedValue(undefined));
    ks.register('agent-2', vi.fn().mockResolvedValue(undefined));

    ks.reset();

    expect(ks.getRegisteredAgentCount()).toBe(0);
    expect(ks.isActive()).toBe(false);
  });
});
