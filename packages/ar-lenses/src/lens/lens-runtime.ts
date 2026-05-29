import type { LensDefinition, LensRuntimeConfig, PipelineData, LensTrigger } from '../types.js';
import { EffectPipeline } from './effect-pipeline.js';

export interface RuntimeMetrics {
  frameTimeMs: number;
  withinBudget: boolean;
  effectsExecuted: number;
  skippedEffects: string[];
}

export interface EthicsPolicyHook {
  check(data: PipelineData, lens: LensDefinition): { allowed: boolean; reason?: string };
}

const DEFAULT_CONFIG: LensRuntimeConfig = {
  frameBudgetMs: 16,
  maxMemoryMb: 64,
  sandboxRestrictions: ['no_network', 'no_filesystem', 'no_eval'],
};

export class LensRuntime {
  private config: LensRuntimeConfig;
  private pipeline: EffectPipeline;
  private activeLens: LensDefinition | null = null;
  private ethicsPolicy: EthicsPolicyHook | null = null;

  constructor(config?: Partial<LensRuntimeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.pipeline = new EffectPipeline();
  }

  setEthicsPolicy(hook: EthicsPolicyHook): void {
    this.ethicsPolicy = hook;
  }

  getEthicsPolicy(): EthicsPolicyHook | null {
    return this.ethicsPolicy;
  }

  loadLens(lens: LensDefinition): void {
    this.activeLens = lens;
    this.pipeline.clear();

    const sortedEffects = [...lens.effects].sort((a, b) => a.order - b.order);
    for (const effect of sortedEffects) {
      this.pipeline.addStage({
        name: effect.effectType,
        execute: (input: PipelineData) => {
          return {
            ...input,
            metadata: { ...input.metadata, [effect.effectType]: effect.parameters },
          };
        },
      });
    }
  }

  executeFrame(data: PipelineData): { result: PipelineData; metrics: RuntimeMetrics } {
    if (!this.activeLens) {
      return {
        result: data,
        metrics: { frameTimeMs: 0, withinBudget: true, effectsExecuted: 0, skippedEffects: [] },
      };
    }

    // Ethics policy check before execution
    if (this.ethicsPolicy) {
      const ethicsResult = this.ethicsPolicy.check(data, this.activeLens);
      if (!ethicsResult.allowed) {
        return {
          result: data,
          metrics: {
            frameTimeMs: 0,
            withinBudget: true,
            effectsExecuted: 0,
            skippedEffects: [],
          },
        };
      }
    }

    const triggered = this.checkTriggers(data);
    if (!triggered) {
      return {
        result: data,
        metrics: { frameTimeMs: 0, withinBudget: true, effectsExecuted: 0, skippedEffects: [] },
      };
    }

    const start = performance.now();
    const budgetResult = this.pipeline.executeWithBudget(data, this.config.frameBudgetMs, start);
    const frameTimeMs = performance.now() - start;

    return {
      result: budgetResult.result,
      metrics: {
        frameTimeMs,
        withinBudget: frameTimeMs <= this.config.frameBudgetMs,
        effectsExecuted: budgetResult.executedCount,
        skippedEffects: budgetResult.skippedStages,
      },
    };
  }

  private checkTriggers(data: PipelineData): boolean {
    if (!this.activeLens) return false;

    for (const trigger of this.activeLens.triggers) {
      if (this.evaluateTrigger(trigger, data)) return true;
    }
    return false;
  }

  private evaluateTrigger(trigger: LensTrigger, data: PipelineData): boolean {
    switch (trigger) {
      case 'always':
        return true;
      case 'face_detect':
        return data.tracking.faces.length > 0;
      case 'smile':
        return data.tracking.faces.some((f) =>
          f.expressions.some((e) => e.type === 'smile' && e.intensity > 0.5),
        );
      case 'blink':
        return data.tracking.faces.some((f) =>
          f.expressions.some((e) => e.type === 'blink' && e.intensity > 0.5),
        );
      case 'mouth_open':
        return data.tracking.faces.some((f) =>
          f.expressions.some((e) => e.type === 'mouth_open' && e.intensity > 0.5),
        );
      case 'hand_raise':
        return data.tracking.hands.length > 0;
    }
  }

  getConfig(): LensRuntimeConfig {
    return { ...this.config };
  }

  getActiveLens(): LensDefinition | null {
    return this.activeLens;
  }

  unloadLens(): void {
    this.activeLens = null;
    this.pipeline.clear();
  }
}
