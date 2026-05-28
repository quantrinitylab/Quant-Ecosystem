import { describe, it, expect } from 'vitest';
import { CommandExecutor } from '../voice/command-executor.js';
import { CapabilityRegistry } from '../registry.js';

describe('CommandExecutor', () => {
  function setup() {
    const registry = new CapabilityRegistry();
    registry.register('location', {
      capability: 'location',
      isAvailable: async () => true,
      initialize: async () => {},
      dispose: () => {},
    });
    registry.register('phone', {
      capability: 'phone',
      isAvailable: async () => true,
      initialize: async () => {},
      dispose: () => {},
    });
    return new CommandExecutor(registry);
  }

  it('executes a single intent successfully', async () => {
    const exec = setup();
    const r = await exec.execute(
      { capability: 'location', action: 'navigate', params: { destination: 'home' } },
      true,
    );
    expect(r.success).toBe(true);
    expect(r.results[0]!.success).toBe(true);
  });

  it('returns error when capability is not yet supported', async () => {
    const exec = setup();
    const r = await exec.execute({ capability: 'media', action: 'play', params: {} }, true);
    expect(r.success).toBe(false);
    expect(r.results[0]!.error).toContain('is not yet supported');
  });

  it('executes a multi-step sequence', async () => {
    const exec = setup();
    const r = await exec.executeSequence([
      { capability: 'location', action: 'navigate', params: {} },
      { capability: 'location', action: 'navigate', params: {} },
    ]);
    expect(r.success).toBe(true);
    expect(r.results).toHaveLength(2);
  });

  it('stops on failure when stopOnFailure is true', async () => {
    const exec = setup();
    const r = await exec.executeSequence(
      [
        { capability: 'media', action: 'play', params: {} },
        { capability: 'location', action: 'navigate', params: {} },
      ],
      { stopOnFailure: true },
    );
    expect(r.success).toBe(false);
    expect(r.results).toHaveLength(1);
  });

  it('requires confirmation for tier 3 capabilities', async () => {
    const exec = setup();
    const r = await exec.execute({
      capability: 'phone',
      action: 'place',
      params: { target: 'john' },
    });
    expect(r.success).toBe(false);
    expect(r.requiresConfirmation).toBe(true);
  });
});
