import { describe, it, expect } from 'vitest';
import { LensSchema } from '../lens/lens-schema.js';
import { LensRuntime } from '../lens/lens-runtime.js';
import type { EthicsPolicyHook } from '../lens/lens-runtime.js';
import { EffectPipeline } from '../lens/effect-pipeline.js';
import type { LensDefinition, PipelineData, TrackingFrame } from '../types.js';

function validLens(): LensDefinition {
  return {
    id: 'test-lens',
    name: 'Test Lens',
    version: '1.0.0',
    triggers: ['face_detect'],
    effects: [
      { effectType: 'color_grade', parameters: { warmth: 0.5 }, order: 0 },
      { effectType: 'particles', parameters: { count: 100 }, order: 1 },
    ],
    parameters: {
      intensity: { min: 0, max: 1, default: 0.7 },
    },
  };
}

function createPipelineData(hasFaces = true): PipelineData {
  const frame: TrackingFrame = {
    timestamp: Date.now(),
    width: 1920,
    height: 1080,
    data: new Uint8Array(100),
  };
  return {
    frame,
    tracking: {
      faces: hasFaces
        ? [
            {
              id: 'f1',
              confidence: 0.9,
              landmarks: Array.from({ length: 468 }, (_, i) => ({
                index: i,
                position: { x: 0, y: 0, z: 0 },
                confidence: 0.9,
              })),
              expressions: [{ type: 'smile', intensity: 0.8 }],
              boundingBox: { x: 0, y: 0, width: 200, height: 200 },
            },
          ]
        : [],
      hands: [],
      bodies: [],
    },
    overlays: [],
    metadata: {},
  };
}

describe('LensSchema', () => {
  const schema = new LensSchema();

  it('validates a correct lens definition', () => {
    const result = schema.validate(validLens());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects lens with no ID', () => {
    const lens = { ...validLens(), id: '' };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Lens ID is required');
  });

  it('rejects lens with invalid version', () => {
    const lens = { ...validLens(), version: 'bad' };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Version must be semver format (x.y.z)');
  });

  it('rejects lens with no triggers', () => {
    const lens = { ...validLens(), triggers: [] as LensDefinition['triggers'] };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one trigger is required');
  });

  it('rejects lens with no effects', () => {
    const lens = { ...validLens(), effects: [] };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('At least one effect is required');
  });

  it('rejects parameter with min > max', () => {
    const lens = {
      ...validLens(),
      parameters: { bad: { min: 10, max: 5, default: 7 } },
    };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
  });

  it('rejects parameter with default outside range', () => {
    const lens = {
      ...validLens(),
      parameters: { bad: { min: 0, max: 1, default: 2 } },
    };
    const result = schema.validate(lens);
    expect(result.valid).toBe(false);
  });

  it('serializes and deserializes valid lens', () => {
    const lens = validLens();
    const serialized = schema.serialize(lens);
    const deserialized = schema.deserialize(serialized);
    expect(deserialized).not.toBeNull();
    expect(deserialized!.id).toBe(lens.id);
  });

  it('deserialize returns null for invalid JSON', () => {
    const result = schema.deserialize('not json');
    expect(result).toBeNull();
  });
});

describe('LensRuntime', () => {
  it('executes lens within frame budget', () => {
    const runtime = new LensRuntime({ frameBudgetMs: 16 });
    runtime.loadLens(validLens());
    const data = createPipelineData();
    const { metrics } = runtime.executeFrame(data);
    expect(metrics.withinBudget).toBe(true);
    expect(metrics.effectsExecuted).toBe(2);
    expect(metrics.skippedEffects).toHaveLength(0);
  });

  it('does not execute when no lens loaded', () => {
    const runtime = new LensRuntime();
    const { metrics } = runtime.executeFrame(createPipelineData());
    expect(metrics.effectsExecuted).toBe(0);
  });

  it('respects trigger conditions', () => {
    const runtime = new LensRuntime();
    runtime.loadLens(validLens());
    const noFaces = createPipelineData(false);
    const { metrics } = runtime.executeFrame(noFaces);
    expect(metrics.effectsExecuted).toBe(0);
  });

  it('enforces sandbox config', () => {
    const runtime = new LensRuntime();
    const config = runtime.getConfig();
    expect(config.sandboxRestrictions).toContain('no_network');
    expect(config.sandboxRestrictions).toContain('no_filesystem');
    expect(config.sandboxRestrictions).toContain('no_eval');
  });

  it('unloads lens', () => {
    const runtime = new LensRuntime();
    runtime.loadLens(validLens());
    expect(runtime.getActiveLens()).not.toBeNull();
    runtime.unloadLens();
    expect(runtime.getActiveLens()).toBeNull();
  });

  it('skips effects when budget is exceeded mid-pipeline', () => {
    // Use a very small budget to force skipping
    const runtime = new LensRuntime({ frameBudgetMs: 0 });
    const lens: LensDefinition = {
      id: 'expensive',
      name: 'Expensive Lens',
      version: '1.0.0',
      triggers: ['always'],
      effects: [
        { effectType: 'effect_a', parameters: {}, order: 0 },
        { effectType: 'effect_b', parameters: {}, order: 1 },
        { effectType: 'effect_c', parameters: {}, order: 2 },
      ],
      parameters: {},
    };
    runtime.loadLens(lens);
    const data = createPipelineData();
    const { metrics } = runtime.executeFrame(data);
    // With 0ms budget, some or all effects should be skipped
    expect(metrics.skippedEffects.length).toBeGreaterThan(0);
    expect(metrics.effectsExecuted + metrics.skippedEffects.length).toBe(3);
  });

  it('reports skipped effect names in metrics', () => {
    const runtime = new LensRuntime({ frameBudgetMs: 0 });
    const lens: LensDefinition = {
      id: 'named-effects',
      name: 'Named',
      version: '1.0.0',
      triggers: ['always'],
      effects: [
        { effectType: 'alpha', parameters: {}, order: 0 },
        { effectType: 'beta', parameters: {}, order: 1 },
      ],
      parameters: {},
    };
    runtime.loadLens(lens);
    const { metrics } = runtime.executeFrame(createPipelineData());
    // All skipped effect names should be valid effect type strings
    for (const name of metrics.skippedEffects) {
      expect(['alpha', 'beta']).toContain(name);
    }
  });

  it('blocks execution when ethics policy rejects', () => {
    const runtime = new LensRuntime();
    const blockingPolicy: EthicsPolicyHook = {
      check: () => ({ allowed: false, reason: 'body_filter_blocked' }),
    };
    runtime.setEthicsPolicy(blockingPolicy);
    runtime.loadLens(validLens());
    const { metrics } = runtime.executeFrame(createPipelineData());
    expect(metrics.effectsExecuted).toBe(0);
  });

  it('allows execution when ethics policy permits', () => {
    const runtime = new LensRuntime();
    const allowPolicy: EthicsPolicyHook = {
      check: () => ({ allowed: true }),
    };
    runtime.setEthicsPolicy(allowPolicy);
    runtime.loadLens(validLens());
    const { metrics } = runtime.executeFrame(createPipelineData());
    expect(metrics.effectsExecuted).toBe(2);
  });

  it('can retrieve the ethics policy hook', () => {
    const runtime = new LensRuntime();
    expect(runtime.getEthicsPolicy()).toBeNull();
    const hook: EthicsPolicyHook = { check: () => ({ allowed: true }) };
    runtime.setEthicsPolicy(hook);
    expect(runtime.getEthicsPolicy()).toBe(hook);
  });
});

describe('EffectPipeline', () => {
  it('chains effects in order', () => {
    const pipeline = new EffectPipeline();
    const order: string[] = [];
    pipeline.addStage({
      name: 'first',
      execute: (input) => {
        order.push('first');
        return input;
      },
    });
    pipeline.addStage({
      name: 'second',
      execute: (input) => {
        order.push('second');
        return input;
      },
    });
    pipeline.execute(createPipelineData());
    expect(order).toEqual(['first', 'second']);
  });

  it('short-circuits on tracking loss', () => {
    const pipeline = new EffectPipeline();
    let executed = false;
    pipeline.addStage({
      name: 'effect',
      execute: (input) => {
        executed = true;
        return input;
      },
    });
    const noTracking = createPipelineData(false);
    pipeline.execute(noTracking);
    expect(executed).toBe(false);
  });

  it('tracks execution time', () => {
    const pipeline = new EffectPipeline();
    pipeline.addStage({ name: 'noop', execute: (input) => input });
    pipeline.execute(createPipelineData());
    expect(pipeline.getLastExecutionTimeMs()).toBeGreaterThanOrEqual(0);
  });

  it('removes stages by name', () => {
    const pipeline = new EffectPipeline();
    pipeline.addStage({ name: 'a', execute: (input) => input });
    pipeline.addStage({ name: 'b', execute: (input) => input });
    pipeline.removeStage('a');
    expect(pipeline.getStageCount()).toBe(1);
    expect(pipeline.getStageNames()).toEqual(['b']);
  });

  it('executeWithBudget skips stages when budget exceeded', () => {
    const pipeline = new EffectPipeline();
    pipeline.addStage({ name: 'stage_a', execute: (input) => input });
    pipeline.addStage({ name: 'stage_b', execute: (input) => input });
    pipeline.addStage({ name: 'stage_c', execute: (input) => input });

    const data = createPipelineData();
    // Use a startTime far enough in the past that budget is immediately exceeded
    const startTime = performance.now() - 100;
    const result = pipeline.executeWithBudget(data, 0.001, startTime);
    expect(result.skippedStages.length).toBeGreaterThan(0);
    expect(result.executedCount + result.skippedStages.length).toBe(3);
  });

  it('executeWithBudget short-circuits on tracking loss', () => {
    const pipeline = new EffectPipeline();
    pipeline.addStage({ name: 'x', execute: (input) => input });
    const noTracking = createPipelineData(false);
    const result = pipeline.executeWithBudget(noTracking, 16, performance.now());
    expect(result.executedCount).toBe(0);
    expect(result.skippedStages).toHaveLength(0);
  });
});
