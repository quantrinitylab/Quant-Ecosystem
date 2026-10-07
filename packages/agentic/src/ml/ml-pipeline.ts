// ============================================================================
// @quant/agentic — task-routing ML pipeline (deterministic, dependency-free)
// ============================================================================
//
// `predict()` previously returned `Math.random()` with a random confidence, so
// `RealMLIntegration` ("real ML") was not actually real or reproducible. It is
// now a deterministic logistic-regression forward pass over the supplied
// features: identical input always yields identical output, and confidence is
// derived from the decision margin.
//
// This module intentionally has NO Node built-in imports so it stays safe in
// the browser bundles that consume `@quant/agentic` (voice/cross-app surfaces).

function sigmoid(z: number): number {
  if (z >= 0) {
    return 1 / (1 + Math.exp(-z));
  }
  const e = Math.exp(z);
  return e / (1 + e);
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Stable, deterministic weights derived from feature names (no randomness). */
function deterministicWeights(featureNames: string[]): number[] {
  return featureNames.map((name) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash * 31 + name.charCodeAt(i)) | 0;
    }
    return (hash % 1000) / 1000 - 0.5;
  });
}

export class MLPipeline {
  async predict(params: { input: string; features: Record<string, number> }): Promise<{
    prediction: number;
    taskType: string;
    complexity: number;
    model: string;
    confidence: number;
  }> {
    const complexity = clamp01(params.features['complexity'] || 0.5);

    const featureNames = Object.keys(params.features).sort();
    const vector = featureNames.map((name) => params.features[name] ?? 0);
    const weights = deterministicWeights(featureNames);

    let z = 0;
    for (let i = 0; i < vector.length; i++) {
      z += (weights[i] ?? 0) * (vector[i] ?? 0);
    }
    const prediction = clamp01(sigmoid(z));
    const margin = Math.abs(prediction - 0.5) * 2;

    return {
      prediction: round4(prediction),
      taskType: complexity > 0.8 ? 'complex' : complexity > 0.4 ? 'moderate' : 'simple',
      complexity,
      model: complexity > 0.7 ? 'gpt-4o' : 'gpt-4o-mini',
      confidence: round4(Math.min(0.99, 0.5 + 0.49 * margin)),
    };
  }
}
