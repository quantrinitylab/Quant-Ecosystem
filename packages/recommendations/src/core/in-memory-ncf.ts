// ============================================================================
// In-Memory Neural Collaborative Filtering (test fixture / local dev fallback)
// ============================================================================

import type { NCFConfig, NCFLayer, ActivationType } from '../types';

/** Training sample for neural CF */
interface TrainingSample {
  userId: string;
  itemId: string;
  label: number;
}

/** Neural Collaborative Filtering with embedding layers and MLP */
export class InMemoryNeuralCF {
  private config: NCFConfig;
  private userEmbeddings: Map<string, number[]>;
  private itemEmbeddings: Map<string, number[]>;
  private layers: NCFLayer[];
  private outputWeights: number[];
  private outputBias: number;
  private trainingLoss: number[];
  private userIndex: Map<string, number>;
  private itemIndex: Map<string, number>;

  constructor(config: NCFConfig) {
    this.config = config;
    this.userEmbeddings = new Map();
    this.itemEmbeddings = new Map();
    this.layers = [];
    this.outputWeights = [];
    this.outputBias = 0;
    this.trainingLoss = [];
    this.userIndex = new Map();
    this.itemIndex = new Map();
  }

  /** Initialize embedding tables for users and items */
  initializeEmbeddings(userIds: string[], itemIds: string[]): void {
    const embSize = this.config.embeddingSize;
    const scale = 1 / Math.sqrt(embSize);

    for (let i = 0; i < userIds.length; i++) {
      const embedding = this.randomVector(embSize, scale);
      this.userEmbeddings.set(userIds[i]!, embedding);
      this.userIndex.set(userIds[i]!, i);
    }

    for (let i = 0; i < itemIds.length; i++) {
      const embedding = this.randomVector(embSize, scale);
      this.itemEmbeddings.set(itemIds[i]!, embedding);
      this.itemIndex.set(itemIds[i]!, i);
    }

    this.initializeLayers();
  }

  /** Initialize MLP layers */
  private initializeLayers(): void {
    this.layers = [];
    const inputSize = this.config.embeddingSize * 2; // Concatenated user + item embeddings
    let prevSize = inputSize;

    for (const hiddenSize of this.config.hiddenLayers) {
      const weights: number[][] = [];
      const scale = Math.sqrt(2 / prevSize); // He initialization

      for (let i = 0; i < hiddenSize; i++) {
        weights.push(this.randomVector(prevSize, scale));
      }

      const biases = new Array(hiddenSize).fill(0);
      this.layers.push({ weights, biases, activation: this.config.activationFn });
      prevSize = hiddenSize;
    }

    // Output layer
    const outputScale = Math.sqrt(2 / prevSize);
    this.outputWeights = this.randomVector(prevSize, outputScale);
    this.outputBias = 0;
  }

  /** Generate random vector */
  private randomVector(size: number, scale: number): number[] {
    const vec: number[] = [];
    for (let i = 0; i < size; i++) {
      vec.push((Math.random() - 0.5) * 2 * scale);
    }
    return vec;
  }

  /** Apply activation function */
  private activate(x: number, type: ActivationType): number {
    switch (type) {
      case 'relu':
        return Math.max(0, x);
      case 'sigmoid':
        return 1 / (1 + Math.exp(-Math.max(-500, Math.min(500, x))));
      case 'tanh':
        return Math.tanh(x);
      case 'linear':
        return x;
      default:
        return Math.max(0, x);
    }
  }

  /** Derivative of activation function */
  private activateDerivative(x: number, type: ActivationType): number {
    switch (type) {
      case 'relu':
        return x > 0 ? 1 : 0;
      case 'sigmoid': {
        const s = this.activate(x, 'sigmoid');
        return s * (1 - s);
      }
      case 'tanh': {
        const t = Math.tanh(x);
        return 1 - t * t;
      }
      case 'linear':
        return 1;
      default:
        return x > 0 ? 1 : 0;
    }
  }

  /** Forward pass through the network */
  forward(userId: string, itemId: string): { output: number; activations: number[][] } {
    const userEmb = this.userEmbeddings.get(userId);
    const itemEmb = this.itemEmbeddings.get(itemId);

    if (!userEmb || !itemEmb) {
      return { output: 0.5, activations: [] };
    }

    // Concatenate embeddings
    let input = [...userEmb, ...itemEmb];
    const activations: number[][] = [input];

    // Pass through hidden layers
    for (const layer of this.layers) {
      const output: number[] = [];
      for (let i = 0; i < layer.weights.length; i++) {
        let sum = layer.biases[i]!;
        for (let j = 0; j < input.length; j++) {
          sum += layer.weights[i]![j]! * input[j]!;
        }
        output.push(this.activate(sum, layer.activation));
      }
      input = output;
      activations.push(input);
    }

    // Output layer with sigmoid
    let outputSum = this.outputBias;
    for (let i = 0; i < input.length; i++) {
      outputSum += this.outputWeights[i]! * input[i]!;
    }
    const output = this.activate(outputSum, 'sigmoid');

    return { output, activations };
  }

  /** Compute binary cross-entropy loss */
  computeLoss(predicted: number, actual: number): number {
    const eps = 1e-7;
    const clipped = Math.max(eps, Math.min(1 - eps, predicted));
    return -(actual * Math.log(clipped) + (1 - actual) * Math.log(1 - clipped));
  }

  /** Train on a single sample with simplified backpropagation */
  private trainSample(sample: TrainingSample): number {
    const { output, activations } = this.forward(sample.userId, sample.itemId);
    const loss = this.computeLoss(output, sample.label);
    const lr = this.config.learningRate;

    // Output layer gradient
    const outputError = output - sample.label;
    const lastActivation = activations[activations.length - 1]!;

    // Update output weights
    for (let i = 0; i < this.outputWeights.length; i++) {
      const grad = outputError * (lastActivation[i] || 0);
      this.outputWeights[i]! -= lr * grad;
    }
    this.outputBias -= lr * outputError;

    // Backpropagate through hidden layers
    let layerError: number[] = [];
    for (let i = 0; i < this.outputWeights.length; i++) {
      layerError.push(outputError * this.outputWeights[i]!);
    }

    for (let l = this.layers.length - 1; l >= 0; l--) {
      const layer = this.layers[l]!;
      const prevActivation = activations[l]!;
      const newError: number[] = new Array(prevActivation.length).fill(0);

      for (let i = 0; i < layer.weights.length; i++) {
        const delta =
          layerError[i]! * this.activateDerivative(activations[l + 1]![i]!, layer.activation);

        // Apply dropout conceptually
        const dropoutMask = Math.random() > this.config.dropout ? 1 : 0;

        for (let j = 0; j < layer.weights[i]!.length; j++) {
          newError[j]! += delta * layer.weights[i]![j]!;
          layer.weights[i]![j]! -= lr * delta * prevActivation[j]! * dropoutMask;
        }
        layer.biases[i]! -= lr * delta * dropoutMask;
      }

      layerError = newError;
    }

    // Update embeddings
    const userEmb = this.userEmbeddings.get(sample.userId);
    const itemEmb = this.itemEmbeddings.get(sample.itemId);
    if (userEmb && itemEmb) {
      for (let i = 0; i < userEmb.length; i++) {
        userEmb[i]! -= lr * (layerError[i] || 0);
      }
      for (let i = 0; i < itemEmb.length; i++) {
        itemEmb[i]! -= lr * (layerError[userEmb.length + i] || 0);
      }
    }

    return loss;
  }

  /** Train the model on data */
  train(samples: TrainingSample[]): void {
    this.trainingLoss = [];

    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      let epochLoss = 0;
      // Shuffle samples
      const shuffled = [...samples].sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffled.length; i += this.config.batchSize) {
        const batch = shuffled.slice(i, i + this.config.batchSize);
        let batchLoss = 0;
        for (const sample of batch) {
          batchLoss += this.trainSample(sample);
        }
        epochLoss += batchLoss;
      }

      this.trainingLoss.push(epochLoss / samples.length);
    }
  }

  /** Predict interaction probability */
  predict(userId: string, itemId: string): number {
    const { output } = this.forward(userId, itemId);
    return output;
  }

  /** Get recommendations for a user */
  recommend(
    userId: string,
    candidateItemIds: string[],
    topN: number = 10,
  ): Array<{ itemId: string; score: number }> {
    const predictions: Array<{ itemId: string; score: number }> = [];

    for (const itemId of candidateItemIds) {
      const score = this.predict(userId, itemId);
      predictions.push({ itemId, score });
    }

    predictions.sort((a, b) => b.score - a.score);
    return predictions.slice(0, topN);
  }

  /** Get user embedding vector */
  getUserEmbedding(userId: string): number[] | null {
    return this.userEmbeddings.get(userId) || null;
  }

  /** Get item embedding vector */
  getItemEmbedding(itemId: string): number[] | null {
    return this.itemEmbeddings.get(itemId) || null;
  }

  /** Get training loss history */
  getLossHistory(): number[] {
    return [...this.trainingLoss];
  }

  /** Get model summary */
  getModelSummary(): { layers: number; parameters: number; embeddingSize: number } {
    let params = 0;
    for (const layer of this.layers) {
      params += layer.weights.length * (layer.weights[0]?.length || 0);
      params += layer.biases.length;
    }
    params += this.outputWeights.length + 1;
    params += this.userEmbeddings.size * this.config.embeddingSize;
    params += this.itemEmbeddings.size * this.config.embeddingSize;

    return {
      layers: this.layers.length + 1,
      parameters: params,
      embeddingSize: this.config.embeddingSize,
    };
  }
}
