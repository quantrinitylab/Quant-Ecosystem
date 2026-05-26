import type { MutationGateConfig, MutationGateResult } from './types';

const DEFAULT_TARGET_PACKAGES = ['auth', 'payments', 'security'];
const DEFAULT_REPORTERS = ['html', 'json', 'clear-text', 'progress'];

interface StrykerConfig {
  mutate: string[];
  testRunner: string;
  reporters: string[];
  thresholds: { high: number; low: number; break: number };
  incremental: boolean;
  concurrency: number;
  timeoutMS: number;
}

export class MutationGate {
  private readonly config: MutationGateConfig;

  constructor(config: Partial<MutationGateConfig> = {}) {
    this.config = {
      threshold: config.threshold ?? 60,
      targetPackages: config.targetPackages ?? DEFAULT_TARGET_PACKAGES,
      reporters: config.reporters ?? DEFAULT_REPORTERS,
      incremental: config.incremental ?? true,
    };
  }

  generateStrykerConfig(): StrykerConfig {
    const mutate: string[] = [];

    for (const pkg of this.config.targetPackages) {
      mutate.push(`packages/${pkg}/src/**/*.ts`);
      mutate.push(`!packages/${pkg}/src/**/*.test.ts`);
    }

    return {
      mutate,
      testRunner: 'vitest',
      reporters: this.config.reporters,
      thresholds: {
        high: 80,
        low: this.config.threshold,
        break: this.config.threshold,
      },
      incremental: this.config.incremental,
      concurrency: 4,
      timeoutMS: 60000,
    };
  }

  checkResults(results: MutationGateResult): MutationGateResult {
    return {
      ...results,
      pass: results.mutationScore >= this.config.threshold,
      threshold: this.config.threshold,
    };
  }

  run(results: Omit<MutationGateResult, 'pass' | 'threshold'>): MutationGateResult {
    const fullResult: MutationGateResult = {
      ...results,
      pass: results.mutationScore >= this.config.threshold,
      threshold: this.config.threshold,
    };

    return this.checkResults(fullResult);
  }
}

export function generateStrykerConfig(config?: Partial<MutationGateConfig>): StrykerConfig {
  const gate = new MutationGate(config);
  return gate.generateStrykerConfig();
}

export function runMutationGate(
  results: Omit<MutationGateResult, 'pass' | 'threshold'>,
  config?: Partial<MutationGateConfig>,
): MutationGateResult {
  const gate = new MutationGate(config);
  return gate.run(results);
}
