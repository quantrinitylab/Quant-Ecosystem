// ============================================================================
// Recommendations Package - Matrix Factorization (ALS)
// ============================================================================

import type { MatrixFactorizationConfig, LatentFactor, Rating } from '../types';

/** Matrix factorization using Alternating Least Squares (ALS) algorithm */
export class MatrixFactorizer {
  private config: MatrixFactorizationConfig;
  private userFactors: Map<string, number[]>;
  private itemFactors: Map<string, number[]>;
  private userBiases: Map<string, number>;
  private itemBiases: Map<string, number>;
  private globalMean: number;
  private ratings: Rating[];
  private converged: boolean;
  private iterationErrors: number[];

  constructor(config: MatrixFactorizationConfig) {
    this.config = config;
    this.userFactors = new Map();
    this.itemFactors = new Map();
    this.userBiases = new Map();
    this.itemBiases = new Map();
    this.globalMean = 0;
    this.ratings = [];
    this.converged = false;
    this.iterationErrors = [];
  }

  /** Initialize random latent factor matrices */
  private initializeFactors(userIds: string[], itemIds: string[]): void {
    const k = this.config.latentDimensions;
    const scale = 1 / Math.sqrt(k);

    for (const userId of userIds) {
      const vector: number[] = [];
      for (let i = 0; i < k; i++) {
        vector.push((Math.random() - 0.5) * scale * 2);
      }
      this.userFactors.set(userId, vector);
      this.userBiases.set(userId, 0);
    }

    for (const itemId of itemIds) {
      const vector: number[] = [];
      for (let i = 0; i < k; i++) {
        vector.push((Math.random() - 0.5) * scale * 2);
      }
      this.itemFactors.set(itemId, vector);
      this.itemBiases.set(itemId, 0);
    }
  }

  /** Compute dot product of two vectors */
  private dotProduct(vecA: number[], vecB: number[]): number {
    let sum = 0;
    for (let i = 0; i < vecA.length; i++) {
      sum += vecA[i]! * vecB[i]!;
    }
    return sum;
  }

  /** Predict rating for user-item pair */
  predict(userId: string, itemId: string): number {
    const userVec = this.userFactors.get(userId);
    const itemVec = this.itemFactors.get(itemId);
    if (!userVec || !itemVec) return this.globalMean;

    const userBias = this.userBiases.get(userId) || 0;
    const itemBias = this.itemBiases.get(itemId) || 0;

    const prediction = this.globalMean + userBias + itemBias + this.dotProduct(userVec, itemVec);
    // Clamp to valid rating range
    return Math.max(1, Math.min(5, prediction));
  }

  /** Compute RMSE on the training data */
  private computeRMSE(): number {
    let sumSquaredError = 0;
    for (const rating of this.ratings) {
      const predicted = this.predict(rating.userId, rating.itemId);
      const error = rating.value - predicted;
      sumSquaredError += error * error;
    }
    return Math.sqrt(sumSquaredError / Math.max(this.ratings.length, 1));
  }

  /** Solve for user factors while fixing item factors (ALS step) */
  private solveUserFactors(): void {
    const k = this.config.latentDimensions;
    const lambda = this.config.regularization;

    // Group ratings by user
    const userRatingsMap: Map<string, Array<{ itemId: string; value: number }>> = new Map();
    for (const rating of this.ratings) {
      if (!userRatingsMap.has(rating.userId)) {
        userRatingsMap.set(rating.userId, []);
      }
      userRatingsMap.get(rating.userId)!.push({ itemId: rating.itemId, value: rating.value });
    }

    for (const [userId, userRatings] of userRatingsMap) {
      if (userRatings.length === 0) continue;

      // Build A^T * A + lambda * I matrix (k x k)
      const ata: number[][] = [];
      for (let i = 0; i < k; i++) {
        ata.push(new Array(k).fill(0));
      }

      // Build A^T * b vector (k x 1)
      const atb: number[] = new Array(k).fill(0);

      // Update user bias
      let biasSum = 0;
      for (const { itemId, value } of userRatings) {
        const itemVec = this.itemFactors.get(itemId);
        if (!itemVec) continue;

        const itemBias = this.itemBiases.get(itemId) || 0;
        const residual = value - this.globalMean - itemBias;
        biasSum +=
          residual - this.dotProduct(this.userFactors.get(userId) || new Array(k).fill(0), itemVec);

        // A^T * A
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            ata[i]![j]! += itemVec[i]! * itemVec[j]!;
          }
          // A^T * b
          atb[i]! += itemVec[i]! * (value - this.globalMean - itemBias);
        }
      }

      // Add regularization (lambda * I)
      for (let i = 0; i < k; i++) {
        ata[i]![i]! += lambda * userRatings.length;
      }

      // Solve using Gaussian elimination
      const solution = this.solveLinearSystem(ata, atb);
      this.userFactors.set(userId, solution);

      // Update user bias
      this.userBiases.set(userId, biasSum / (userRatings.length + lambda));
    }
  }

  /** Solve for item factors while fixing user factors (ALS step) */
  private solveItemFactors(): void {
    const k = this.config.latentDimensions;
    const lambda = this.config.regularization;

    // Group ratings by item
    const itemRatingsMap: Map<string, Array<{ userId: string; value: number }>> = new Map();
    for (const rating of this.ratings) {
      if (!itemRatingsMap.has(rating.itemId)) {
        itemRatingsMap.set(rating.itemId, []);
      }
      itemRatingsMap.get(rating.itemId)!.push({ userId: rating.userId, value: rating.value });
    }

    for (const [itemId, itemRatings] of itemRatingsMap) {
      if (itemRatings.length === 0) continue;

      // Build A^T * A + lambda * I matrix (k x k)
      const ata: number[][] = [];
      for (let i = 0; i < k; i++) {
        ata.push(new Array(k).fill(0));
      }

      // Build A^T * b vector (k x 1)
      const atb: number[] = new Array(k).fill(0);

      // Update item bias
      let biasSum = 0;
      for (const { userId, value } of itemRatings) {
        const userVec = this.userFactors.get(userId);
        if (!userVec) continue;

        const userBias = this.userBiases.get(userId) || 0;
        const residual = value - this.globalMean - userBias;
        biasSum +=
          residual - this.dotProduct(userVec, this.itemFactors.get(itemId) || new Array(k).fill(0));

        // A^T * A
        for (let i = 0; i < k; i++) {
          for (let j = 0; j < k; j++) {
            ata[i]![j]! += userVec[i]! * userVec[j]!;
          }
          // A^T * b
          atb[i]! += userVec[i]! * (value - this.globalMean - userBias);
        }
      }

      // Add regularization
      for (let i = 0; i < k; i++) {
        ata[i]![i]! += lambda * itemRatings.length;
      }

      // Solve using Gaussian elimination
      const solution = this.solveLinearSystem(ata, atb);
      this.itemFactors.set(itemId, solution);

      // Update item bias
      this.itemBiases.set(itemId, biasSum / (itemRatings.length + lambda));
    }
  }

  /** Solve linear system Ax = b using Gaussian elimination with partial pivoting */
  private solveLinearSystem(A: number[][], b: number[]): number[] {
    const n = b.length;
    // Create augmented matrix
    const augmented: number[][] = [];
    for (let i = 0; i < n; i++) {
      augmented.push([...A[i]!, b[i]!]);
    }

    // Forward elimination with partial pivoting
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxVal = Math.abs(augmented[col]![col]!);
      let maxRow = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(augmented[row]![col]!) > maxVal) {
          maxVal = Math.abs(augmented[row]![col]!);
          maxRow = row;
        }
      }

      // Swap rows
      if (maxRow !== col) {
        const temp = augmented[col]!;
        augmented[col] = augmented[maxRow]!;
        augmented[maxRow] = temp;
      }

      // Check for singularity
      if (Math.abs(augmented[col]![col]!) < 1e-10) {
        continue;
      }

      // Eliminate below
      for (let row = col + 1; row < n; row++) {
        const factor = augmented[row]![col]! / augmented[col]![col]!;
        for (let j = col; j <= n; j++) {
          augmented[row]![j]! -= factor * augmented[col]![j]!;
        }
      }
    }

    // Back substitution
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      if (Math.abs(augmented[i]![i]!) < 1e-10) {
        x[i] = 0;
        continue;
      }
      let sum: number = augmented[i]![n]!;
      for (let j = i + 1; j < n; j++) {
        sum -= augmented[i]![j]! * x[j]!;
      }
      x[i] = sum / augmented[i]![i]!;
    }

    return x;
  }

  /** Train the model using ALS */
  train(ratings: Rating[]): void {
    this.ratings = ratings;

    // Compute global mean
    let sum = 0;
    for (const r of ratings) {
      sum += r.value;
    }
    this.globalMean = ratings.length > 0 ? sum / ratings.length : 0;

    // Collect unique user and item IDs
    const userIds = new Set<string>();
    const itemIds = new Set<string>();
    for (const r of ratings) {
      userIds.add(r.userId);
      itemIds.add(r.itemId);
    }

    // Initialize latent factors
    this.initializeFactors(Array.from(userIds), Array.from(itemIds));

    // ALS iteration
    let prevRMSE = Infinity;
    this.converged = false;
    this.iterationErrors = [];

    for (let iter = 0; iter < this.config.maxIterations; iter++) {
      // Step 1: Fix item factors, solve for user factors
      this.solveUserFactors();

      // Step 2: Fix user factors, solve for item factors
      this.solveItemFactors();

      // Check convergence
      const currentRMSE = this.computeRMSE();
      this.iterationErrors.push(currentRMSE);

      const improvement = Math.abs(prevRMSE - currentRMSE);
      if (improvement < this.config.convergenceThreshold) {
        this.converged = true;
        break;
      }
      prevRMSE = currentRMSE;
    }
  }

  /** Get recommendations for a user */
  recommend(
    userId: string,
    excludeItems: Set<string>,
    topN: number = 10,
  ): Array<{ itemId: string; score: number }> {
    const predictions: Array<{ itemId: string; score: number }> = [];

    for (const itemId of this.itemFactors.keys()) {
      if (excludeItems.has(itemId)) continue;
      const score = this.predict(userId, itemId);
      predictions.push({ itemId, score });
    }

    predictions.sort((a, b) => b.score - a.score);
    return predictions.slice(0, topN);
  }

  /** Get latent factors for a user */
  getUserFactor(userId: string): LatentFactor | null {
    const vector = this.userFactors.get(userId);
    if (!vector) return null;
    return { id: userId, vector, bias: this.userBiases.get(userId) || 0 };
  }

  /** Get latent factors for an item */
  getItemFactor(itemId: string): LatentFactor | null {
    const vector = this.itemFactors.get(itemId);
    if (!vector) return null;
    return { id: itemId, vector, bias: this.itemBiases.get(itemId) || 0 };
  }

  /** Find similar items using latent factor similarity */
  findSimilarItems(
    itemId: string,
    topN: number = 10,
  ): Array<{ itemId: string; similarity: number }> {
    const targetVec = this.itemFactors.get(itemId);
    if (!targetVec) return [];

    const similarities: Array<{ itemId: string; similarity: number }> = [];

    for (const [otherId, otherVec] of this.itemFactors) {
      if (otherId === itemId) continue;
      const similarity = this.cosineSimilarity(targetVec, otherVec);
      similarities.push({ itemId: otherId, similarity });
    }

    similarities.sort((a, b) => b.similarity - a.similarity);
    return similarities.slice(0, topN);
  }

  /** Compute cosine similarity between two vectors */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i]! * vecB[i]!;
      magA += vecA[i]! * vecA[i]!;
      magB += vecB[i]! * vecB[i]!;
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Get training statistics */
  getTrainingStats(): {
    converged: boolean;
    iterations: number;
    finalRMSE: number;
    errors: number[];
  } {
    return {
      converged: this.converged,
      iterations: this.iterationErrors.length,
      finalRMSE: this.iterationErrors[this.iterationErrors.length - 1] || 0,
      errors: this.iterationErrors,
    };
  }
}
