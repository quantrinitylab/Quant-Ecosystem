// ============================================================================
// ML Pipeline - Training Pipeline
// ============================================================================

import {
  TrainingConfig,
  TrainingResult,
  EvaluationMetrics,
  EpochHistory,
  DataBatch,
  DataSplit,
  Checkpoint,
} from '../types';

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Simulated training loop in JS
 * Production path: Use PyTorch/TensorFlow with proper training infrastructure
 */
export class TrainingPipeline {
  private config: TrainingConfig;
  private weights: number[][] = [];
  private bias: number[] = [];
  private history: EpochHistory[] = [];
  private bestCheckpoint: Checkpoint | null = null;
  private patienceCounter: number = 0;
  private bestValLoss: number = Infinity;

  constructor(config: Partial<TrainingConfig> = {}) {
    this.config = {
      epochs: config.epochs ?? 100,
      batchSize: config.batchSize ?? 32,
      learningRate: config.learningRate ?? 0.01,
      optimizer: config.optimizer ?? 'sgd',
      lossFunction: config.lossFunction ?? 'mse',
      earlyStopPatience: config.earlyStopPatience ?? 10,
      lrSchedule: config.lrSchedule ?? 'constant',
      lrDecayRate: config.lrDecayRate ?? 0.95,
      lrDecaySteps: config.lrDecaySteps ?? 10,
      weightDecay: config.weightDecay ?? 0.0001,
      momentum: config.momentum ?? 0.9,
      validationSplit: config.validationSplit ?? 0.2,
      shuffle: config.shuffle ?? true,
    };
  }

  private initializeWeights(inputDim: number, outputDim: number): void {
    // Xavier initialization
    const scale = Math.sqrt(2.0 / (inputDim + outputDim));
    this.weights = [];
    for (let i = 0; i < outputDim; i++) {
      const row: number[] = [];
      for (let j = 0; j < inputDim; j++) {
        row.push((Math.random() * 2 - 1) * scale);
      }
      this.weights.push(row);
    }
    this.bias = new Array(outputDim).fill(0);
  }

  splitData(features: number[][], labels: number[], stratified: boolean = false): DataSplit {
    const n = features.length;
    const valSize = Math.floor(n * this.config.validationSplit);
    const testSize = Math.floor(n * 0.1);
    const trainSize = n - valSize - testSize;
    let indices = Array.from({ length: n }, (_, i) => i);
    if (stratified) {
      indices = this.stratifiedIndices(labels);
    } else if (this.config.shuffle) {
      indices = this.shuffleArray(indices);
    }
    const trainIdx = indices.slice(0, trainSize);
    const valIdx = indices.slice(trainSize, trainSize + valSize);
    const testIdx = indices.slice(trainSize + valSize);
    return {
      train: {
        features: trainIdx.map((i) => features[i]!),
        labels: trainIdx.map((i) => labels[i]!),
      },
      validation: {
        features: valIdx.map((i) => features[i]!),
        labels: valIdx.map((i) => labels[i]!),
      },
      test: {
        features: testIdx.map((i) => features[i]!),
        labels: testIdx.map((i) => labels[i]!),
      },
    };
  }

  private stratifiedIndices(labels: number[]): number[] {
    const classIndices: Map<number, number[]> = new Map();
    for (let i = 0; i < labels.length; i++) {
      const cls = Math.round(labels[i]!);
      if (!classIndices.has(cls)) classIndices.set(cls, []);
      classIndices.get(cls)!.push(i);
    }
    for (const [cls, indices] of classIndices.entries()) {
      classIndices.set(cls, this.shuffleArray(indices));
    }
    const result: number[] = [];
    const maxLen = Math.max(...Array.from(classIndices.values()).map((v) => v.length));
    for (let i = 0; i < maxLen; i++) {
      for (const [, indices] of classIndices.entries()) {
        if (i < indices.length) result.push(indices[i]!);
      }
    }
    return result;
  }

  private shuffleArray<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j]!, result[i]!];
    }
    return result;
  }

  *generateBatches(features: number[][], labels: number[]): Generator<DataBatch> {
    const n = features.length;
    const batchSize = this.config.batchSize;
    let indices = Array.from({ length: n }, (_, i) => i);
    if (this.config.shuffle) {
      indices = this.shuffleArray(indices);
    }
    const numBatches = Math.ceil(n / batchSize);
    for (let b = 0; b < numBatches; b++) {
      const start = b * batchSize;
      const end = Math.min(start + batchSize, n);
      const batchIndices = indices.slice(start, end);
      yield {
        features: batchIndices.map((i) => features[i]!),
        labels: batchIndices.map((i) => labels[i]!),
        batchIndex: b,
        batchSize: end - start,
        isLast: b === numBatches - 1,
      };
    }
  }

  train(features: number[][], labels: number[]): TrainingResult {
    const startTime = Date.now();
    const split = this.splitData(features, labels, true);
    const inputDim = features[0]?.length ?? 1;
    const outputDim = 1;
    this.initializeWeights(inputDim, outputDim);
    this.history = [];
    this.bestValLoss = Infinity;
    this.patienceCounter = 0;
    let velocityW: number[][] = this.weights.map((r) => r.map(() => 0));
    let velocityB: number[] = this.bias.map(() => 0);
    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      const epochStart = Date.now();
      const lr = this.getLearningRate(epoch);
      let epochLoss = 0;
      let batchCount = 0;
      for (const batch of this.generateBatches(split.train.features, split.train.labels)) {
        const { loss, gradW, gradB } = this.computeGradients(batch.features, batch.labels);
        epochLoss += loss;
        batchCount++;
        // Weight update with momentum
        for (let i = 0; i < this.weights.length; i++) {
          for (let j = 0; j < this.weights[i]!.length; j++) {
            velocityW[i]![j]! =
              (this.config.momentum ?? 0.9) * velocityW[i]![j]! - lr * gradW[i]![j]!;
            this.weights[i]![j]! += velocityW[i]![j]!;
            // Weight decay
            this.weights[i]![j]! *= 1 - lr * (this.config.weightDecay ?? 0);
          }
        }
        for (let i = 0; i < this.bias.length; i++) {
          velocityB[i]! = (this.config.momentum ?? 0.9) * velocityB[i]! - lr * gradB[i]!;
          this.bias[i]! += velocityB[i]!;
        }
      }
      const trainLoss = epochLoss / Math.max(batchCount, 1);
      const valLoss = this.computeLoss(split.validation.features, split.validation.labels);
      const trainMetrics = this.evaluate(split.train.features, split.train.labels);
      const valMetrics = this.evaluate(split.validation.features, split.validation.labels);
      const epochHistory: EpochHistory = {
        epoch,
        trainLoss,
        valLoss,
        trainMetrics: { accuracy: trainMetrics.accuracy, f1: trainMetrics.f1 },
        valMetrics: { accuracy: valMetrics.accuracy, f1: valMetrics.f1 },
        learningRate: lr,
        duration: Date.now() - epochStart,
      };
      this.history.push(epochHistory);
      // Early stopping check
      if (valLoss < this.bestValLoss) {
        this.bestValLoss = valLoss;
        this.patienceCounter = 0;
        this.bestCheckpoint = {
          epoch,
          weights: this.weights.map((r) => [...r]),
          bias: [...this.bias],
          valLoss,
          metrics: valMetrics,
          timestamp: Date.now(),
        };
      } else {
        this.patienceCounter++;
        if (this.patienceCounter >= this.config.earlyStopPatience) {
          break;
        }
      }
    }
    // Restore best checkpoint
    if (this.bestCheckpoint) {
      this.weights = this.bestCheckpoint.weights;
      this.bias = this.bestCheckpoint.bias;
    }
    const finalMetrics = this.evaluate(split.test.features, split.test.labels);
    return {
      finalLoss: this.bestValLoss,
      finalMetrics,
      epochsCompleted: this.history.length,
      trainingTime: Date.now() - startTime,
      history: this.history,
      bestEpoch: this.bestCheckpoint?.epoch ?? 0,
      converged: this.patienceCounter >= this.config.earlyStopPatience,
    };
  }

  private computeGradients(
    features: number[][],
    labels: number[],
  ): { loss: number; gradW: number[][]; gradB: number[] } {
    const n = features.length;
    const outputDim = this.weights.length;
    const inputDim = this.weights[0]?.length ?? 0;
    const gradW: number[][] = Array.from({ length: outputDim }, () => new Array(inputDim).fill(0));
    const gradB: number[] = new Array(outputDim).fill(0);
    let totalLoss = 0;
    for (let i = 0; i < n; i++) {
      const x = features[i]!;
      const y = labels[i]!;
      // Forward pass
      const outputs: number[] = [];
      for (let o = 0; o < outputDim; o++) {
        let sum = this.bias[o]!;
        for (let j = 0; j < inputDim; j++) {
          sum += this.weights[o]![j]! * (x[j] ?? 0);
        }
        outputs.push(this.activationForward(sum));
      }
      const pred = outputs[0] ?? 0;
      const { loss, dLoss } = this.computeLossAndGradient(pred, y);
      totalLoss += loss;
      // Backward pass
      for (let o = 0; o < outputDim; o++) {
        const dAct = this.activationBackward(outputs[o]!);
        const delta = dLoss * dAct;
        gradB[o]! += delta;
        for (let j = 0; j < inputDim; j++) {
          gradW[o]![j]! += delta * (x[j] ?? 0);
        }
      }
    }
    // Average gradients
    for (let o = 0; o < outputDim; o++) {
      gradB[o]! /= n;
      for (let j = 0; j < inputDim; j++) {
        gradW[o]![j]! /= n;
      }
    }
    return { loss: totalLoss / n, gradW, gradB };
  }

  private activationForward(x: number): number {
    if (this.config.lossFunction === 'cross_entropy') {
      return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x)))); // sigmoid
    }
    return x; // linear
  }

  private activationBackward(output: number): number {
    if (this.config.lossFunction === 'cross_entropy') {
      return output * (1 - output); // sigmoid derivative
    }
    return 1; // linear derivative
  }

  private computeLossAndGradient(pred: number, target: number): { loss: number; dLoss: number } {
    switch (this.config.lossFunction) {
      case 'mse': {
        const diff = pred - target;
        return { loss: 0.5 * diff * diff, dLoss: diff };
      }
      case 'cross_entropy': {
        const eps = 1e-15;
        const p = Math.max(eps, Math.min(1 - eps, pred));
        const loss = -(target * Math.log(p) + (1 - target) * Math.log(1 - p));
        const dLoss = (p - target) / (p * (1 - p));
        return { loss, dLoss };
      }
      case 'mae': {
        const diff = pred - target;
        return { loss: Math.abs(diff), dLoss: diff > 0 ? 1 : -1 };
      }
      case 'huber': {
        const delta = 1.0;
        const diff = pred - target;
        if (Math.abs(diff) <= delta) {
          return { loss: 0.5 * diff * diff, dLoss: diff };
        }
        return { loss: delta * (Math.abs(diff) - 0.5 * delta), dLoss: diff > 0 ? delta : -delta };
      }
      default:
        return { loss: 0.5 * (pred - target) ** 2, dLoss: pred - target };
    }
  }

  private computeLoss(features: number[][], labels: number[]): number {
    let totalLoss = 0;
    for (let i = 0; i < features.length; i++) {
      const pred = this.predict(features[i]!);
      const { loss } = this.computeLossAndGradient(pred, labels[i]!);
      totalLoss += loss;
    }
    return totalLoss / Math.max(features.length, 1);
  }

  predict(input: number[]): number {
    let sum = this.bias[0] ?? 0;
    for (let j = 0; j < (this.weights[0]?.length ?? 0); j++) {
      sum += (this.weights[0]?.[j] ?? 0) * (input[j] ?? 0);
    }
    return this.activationForward(sum);
  }

  evaluate(features: number[][], labels: number[]): EvaluationMetrics {
    const predictions = features.map((f) => this.predict(f));
    const binaryPreds = predictions.map((p) => (p >= 0.5 ? 1 : 0));
    const binaryLabels = labels.map((l) => (l >= 0.5 ? 1 : 0));
    let tp = 0,
      fp = 0,
      fn = 0,
      tn = 0;
    for (let i = 0; i < binaryPreds.length; i++) {
      if (binaryPreds[i] === 1 && binaryLabels[i] === 1) tp++;
      else if (binaryPreds[i] === 1 && binaryLabels[i] === 0) fp++;
      else if (binaryPreds[i] === 0 && binaryLabels[i] === 1) fn++;
      else tn++;
    }
    const accuracy = (tp + tn) / Math.max(tp + fp + fn + tn, 1);
    const precision = tp / Math.max(tp + fp, 1);
    const recall = tp / Math.max(tp + fn, 1);
    const f1 = (2 * precision * recall) / Math.max(precision + recall, 1e-10);
    const auc = this.computeAUC(predictions, binaryLabels);
    let mse = 0,
      mae = 0;
    for (let i = 0; i < predictions.length; i++) {
      const diff = predictions[i]! - labels[i]!;
      mse += diff * diff;
      mae += Math.abs(diff);
    }
    mse /= Math.max(predictions.length, 1);
    mae /= Math.max(predictions.length, 1);
    return {
      accuracy,
      precision,
      recall,
      f1,
      auc,
      mse,
      mae,
      confusionMatrix: [
        [tn, fp],
        [fn, tp],
      ],
    };
  }

  private computeAUC(scores: number[], labels: number[]): number {
    // Trapezoidal rule for ROC AUC
    const pairs = scores.map((s, i) => ({ score: s, label: labels[i]! }));
    pairs.sort((a, b) => b.score - a.score);
    let tp = 0,
      fp = 0;
    const totalPos = labels.filter((l) => l === 1).length;
    const totalNeg = labels.length - totalPos;
    if (totalPos === 0 || totalNeg === 0) return 0.5;
    const points: { fpr: number; tpr: number }[] = [{ fpr: 0, tpr: 0 }];
    for (const pair of pairs) {
      if (pair.label === 1) tp++;
      else fp++;
      points.push({ fpr: fp / totalNeg, tpr: tp / totalPos });
    }
    let auc = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i]!.fpr - points[i - 1]!.fpr;
      const avgY = (points[i]!.tpr + points[i - 1]!.tpr) / 2;
      auc += dx * avgY;
    }
    return auc;
  }

  private getLearningRate(epoch: number): number {
    const baseLR = this.config.learningRate;
    switch (this.config.lrSchedule) {
      case 'step_decay': {
        const steps = this.config.lrDecaySteps ?? 10;
        const rate = this.config.lrDecayRate ?? 0.5;
        return baseLR * Math.pow(rate, Math.floor(epoch / steps));
      }
      case 'cosine_annealing': {
        const tMax = this.config.epochs;
        return baseLR * 0.5 * (1 + Math.cos((Math.PI * epoch) / tMax));
      }
      case 'exponential_decay': {
        const rate = this.config.lrDecayRate ?? 0.95;
        return baseLR * Math.pow(rate, epoch);
      }
      default:
        return baseLR;
    }
  }

  getHistory(): EpochHistory[] {
    return this.history;
  }

  getCheckpoint(): Checkpoint | null {
    return this.bestCheckpoint;
  }

  getWeights(): { weights: number[][]; bias: number[] } {
    return { weights: this.weights.map((r) => [...r]), bias: [...this.bias] };
  }

  setWeights(weights: number[][], bias: number[]): void {
    this.weights = weights.map((r) => [...r]);
    this.bias = [...bias];
  }
}
