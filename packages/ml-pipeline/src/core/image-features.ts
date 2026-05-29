// ============================================================================
// ML Pipeline - Image Feature Extractor
// ============================================================================

interface ConvKernel {
  name: string;
  weights: number[][];
  size: number;
}

interface FeatureMap {
  data: number[][];
  width: number;
  height: number;
  kernelName: string;
}

/**
 * @simulated This implementation is a simulation/prototype.
 * Classification: NAIVE
 * Reason: Basic pixel stats, no CNN feature extraction
 * Production path: Use CLIP or ResNet via ONNX
 */
export class ImageFeatureExtractor {
  private kernels: Map<string, ConvKernel> = new Map();
  private featureCache: Map<string, number[]> = new Map();
  private cacheMaxSize: number = 500;

  constructor() {
    this.initializeKernels();
  }

  private initializeKernels(): void {
    // Edge detection (Sobel horizontal)
    this.kernels.set('edge_h', {
      name: 'edge_h',
      weights: [
        [-1, -2, -1],
        [0, 0, 0],
        [1, 2, 1],
      ],
      size: 3,
    });
    // Edge detection (Sobel vertical)
    this.kernels.set('edge_v', {
      name: 'edge_v',
      weights: [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1],
      ],
      size: 3,
    });
    // Gaussian blur
    this.kernels.set('blur', {
      name: 'blur',
      weights: [
        [1, 2, 1],
        [2, 4, 2],
        [1, 2, 1],
      ].map((r) => r.map((v) => v / 16)),
      size: 3,
    });
    // Sharpen
    this.kernels.set('sharpen', {
      name: 'sharpen',
      weights: [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0],
      ],
      size: 3,
    });
    // Laplacian edge detection
    this.kernels.set('laplacian', {
      name: 'laplacian',
      weights: [
        [0, 1, 0],
        [1, -4, 1],
        [0, 1, 0],
      ],
      size: 3,
    });
    // Emboss
    this.kernels.set('emboss', {
      name: 'emboss',
      weights: [
        [-2, -1, 0],
        [-1, 1, 1],
        [0, 1, 2],
      ],
      size: 3,
    });
    // Identity (for testing)
    this.kernels.set('identity', {
      name: 'identity',
      weights: [
        [0, 0, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      size: 3,
    });
  }

  // 2D Convolution operation
  convolve2D(input: number[][], kernel: number[][]): number[][] {
    const inputH = input.length;
    const inputW = input[0]?.length ?? 0;
    const kernelH = kernel.length;
    const kernelW = kernel[0]?.length ?? 0;
    const padH = Math.floor(kernelH / 2);
    const padW = Math.floor(kernelW / 2);
    const outputH = inputH;
    const outputW = inputW;
    const output: number[][] = Array.from({ length: outputH }, () => new Array(outputW).fill(0));
    for (let i = 0; i < outputH; i++) {
      for (let j = 0; j < outputW; j++) {
        let sum = 0;
        for (let ki = 0; ki < kernelH; ki++) {
          for (let kj = 0; kj < kernelW; kj++) {
            const ii = i + ki - padH;
            const jj = j + kj - padW;
            if (ii >= 0 && ii < inputH && jj >= 0 && jj < inputW) {
              sum += input[ii]![jj]! * kernel[ki]![kj]!;
            }
          }
        }
        output[i]![j] = sum;
      }
    }
    return output;
  }

  // Max pooling operation
  maxPool(input: number[][], poolSize: number = 2, stride: number = 2): number[][] {
    const inputH = input.length;
    const inputW = input[0]?.length ?? 0;
    const outputH = Math.floor((inputH - poolSize) / stride) + 1;
    const outputW = Math.floor((inputW - poolSize) / stride) + 1;
    const output: number[][] = Array.from({ length: outputH }, () => new Array(outputW).fill(0));
    for (let i = 0; i < outputH; i++) {
      for (let j = 0; j < outputW; j++) {
        let maxVal = -Infinity;
        for (let pi = 0; pi < poolSize; pi++) {
          for (let pj = 0; pj < poolSize; pj++) {
            const ii = i * stride + pi;
            const jj = j * stride + pj;
            if (ii < inputH && jj < inputW) {
              maxVal = Math.max(maxVal, input[ii]![jj]!);
            }
          }
        }
        output[i]![j] = maxVal === -Infinity ? 0 : maxVal;
      }
    }
    return output;
  }

  // Average pooling operation
  avgPool(input: number[][], poolSize: number = 2, stride: number = 2): number[][] {
    const inputH = input.length;
    const inputW = input[0]?.length ?? 0;
    const outputH = Math.floor((inputH - poolSize) / stride) + 1;
    const outputW = Math.floor((inputW - poolSize) / stride) + 1;
    const output: number[][] = Array.from({ length: outputH }, () => new Array(outputW).fill(0));
    for (let i = 0; i < outputH; i++) {
      for (let j = 0; j < outputW; j++) {
        let sum = 0;
        let count = 0;
        for (let pi = 0; pi < poolSize; pi++) {
          for (let pj = 0; pj < poolSize; pj++) {
            const ii = i * stride + pi;
            const jj = j * stride + pj;
            if (ii < inputH && jj < inputW) {
              sum += input[ii]![jj]!;
              count++;
            }
          }
        }
        output[i]![j] = count > 0 ? sum / count : 0;
      }
    }
    return output;
  }

  // Generate feature maps by applying multiple kernels
  generateFeatureMaps(input: number[][], kernelNames?: string[]): FeatureMap[] {
    const names = kernelNames ?? ['edge_h', 'edge_v', 'blur', 'sharpen', 'laplacian'];
    const maps: FeatureMap[] = [];
    for (const name of names) {
      const kernel = this.kernels.get(name);
      if (!kernel) continue;
      const convolved = this.convolve2D(input, kernel.weights);
      // Apply ReLU activation
      const activated = convolved.map((row) => row.map((v) => Math.max(0, v)));
      maps.push({
        data: activated,
        width: activated[0]?.length ?? 0,
        height: activated.length,
        kernelName: name,
      });
    }
    return maps;
  }

  // Flatten feature maps into a single vector
  flatten(featureMaps: FeatureMap[]): number[] {
    const vector: number[] = [];
    for (const map of featureMaps) {
      for (const row of map.data) {
        for (const val of row) {
          vector.push(val);
        }
      }
    }
    return vector;
  }

  // Full feature extraction pipeline
  extractFeatures(image: number[][], poolSize: number = 2): number[] {
    const cacheKey = this.computeCacheKey(image);
    const cached = this.featureCache.get(cacheKey);
    if (cached) return cached;
    // Preprocess
    const normalized = this.normalizePixels(image);
    // Generate feature maps
    const featureMaps = this.generateFeatureMaps(normalized);
    // Apply pooling to each map
    const pooledMaps: FeatureMap[] = featureMaps.map((map) => ({
      data: this.maxPool(map.data, poolSize, poolSize),
      width: Math.floor(map.width / poolSize),
      height: Math.floor(map.height / poolSize),
      kernelName: map.kernelName,
    }));
    // Flatten
    const features = this.flatten(pooledMaps);
    // Cache
    if (this.featureCache.size >= this.cacheMaxSize) {
      const firstKey = this.featureCache.keys().next().value as string;
      this.featureCache.delete(firstKey);
    }
    this.featureCache.set(cacheKey, features);
    return features;
  }

  // Normalize pixel values to [0, 1]
  normalizePixels(image: number[][]): number[][] {
    let min = Infinity,
      max = -Infinity;
    for (const row of image) {
      for (const val of row) {
        min = Math.min(min, val);
        max = Math.max(max, val);
      }
    }
    const range = max - min;
    if (range === 0) return image.map((row) => row.map(() => 0));
    return image.map((row) => row.map((val) => (val - min) / range));
  }

  // Resize grid using bilinear interpolation
  resize(image: number[][], targetH: number, targetW: number): number[][] {
    const srcH = image.length;
    const srcW = image[0]?.length ?? 0;
    const output: number[][] = Array.from({ length: targetH }, () => new Array(targetW).fill(0));
    const scaleY = srcH / targetH;
    const scaleX = srcW / targetW;
    for (let i = 0; i < targetH; i++) {
      for (let j = 0; j < targetW; j++) {
        const srcY = i * scaleY;
        const srcX = j * scaleX;
        const y0 = Math.floor(srcY);
        const x0 = Math.floor(srcX);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const dy = srcY - y0;
        const dx = srcX - x0;
        // Bilinear interpolation
        const val =
          (1 - dy) * (1 - dx) * (image[y0]?.[x0] ?? 0) +
          (1 - dy) * dx * (image[y0]?.[x1] ?? 0) +
          dy * (1 - dx) * (image[y1]?.[x0] ?? 0) +
          dy * dx * (image[y1]?.[x1] ?? 0);
        output[i]![j] = val;
      }
    }
    return output;
  }

  // Compare two feature vectors
  compareFeatures(featuresA: number[], featuresB: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    const len = Math.min(featuresA.length, featuresB.length);
    for (let i = 0; i < len; i++) {
      dot += featuresA[i]! * featuresB[i]!;
      normA += featuresA[i]! * featuresA[i]!;
      normB += featuresB[i]! * featuresB[i]!;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    if (denom === 0) return 0;
    return dot / denom;
  }

  addKernel(name: string, weights: number[][]): void {
    this.kernels.set(name, { name, weights, size: weights.length });
  }

  getKernelNames(): string[] {
    return Array.from(this.kernels.keys());
  }

  private computeCacheKey(image: number[][]): string {
    // Simple hash based on dimensions and sample values
    const h = image.length;
    const w = image[0]?.length ?? 0;
    const sample = (image[0]?.[0] ?? 0) + (image[h - 1]?.[w - 1] ?? 0);
    return `${h}x${w}:${sample.toFixed(4)}`;
  }

  clearCache(): void {
    this.featureCache.clear();
  }

  getCacheSize(): number {
    return this.featureCache.size;
  }
}
