import type { BackgroundReplacement, BodyDetection } from '../types.js';

interface SegmentationResult {
  personMask: boolean;
  edgeRefinement: number;
  replacement: BackgroundReplacement;
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export class BackgroundReplacer {
  private config: BackgroundReplacement;
  private previousMask: { x: number; y: number; width: number; height: number } | null = null;

  constructor(config: BackgroundReplacement) {
    this.config = config;
  }

  segment(bodies: BodyDetection[]): SegmentationResult {
    if (bodies.length === 0) {
      return {
        personMask: false,
        edgeRefinement: this.config.edgeRefinement,
        replacement: this.config,
        bounds: null,
      };
    }

    const bounds = this.computeBounds(bodies);
    const smoothedBounds = this.applyTemporalSmoothing(bounds);

    return {
      personMask: true,
      edgeRefinement: this.config.edgeRefinement,
      replacement: this.config,
      bounds: smoothedBounds,
    };
  }

  private computeBounds(bodies: BodyDetection[]): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const body of bodies) {
      for (const landmark of body.landmarks) {
        minX = Math.min(minX, landmark.position.x);
        minY = Math.min(minY, landmark.position.y);
        maxX = Math.max(maxX, landmark.position.x);
        maxY = Math.max(maxY, landmark.position.y);
      }
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  private applyTemporalSmoothing(bounds: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    if (!this.previousMask) {
      this.previousMask = bounds;
      return bounds;
    }

    const alpha = this.config.temporalSmoothing;
    const smoothed = {
      x: this.previousMask.x * alpha + bounds.x * (1 - alpha),
      y: this.previousMask.y * alpha + bounds.y * (1 - alpha),
      width: this.previousMask.width * alpha + bounds.width * (1 - alpha),
      height: this.previousMask.height * alpha + bounds.height * (1 - alpha),
    };

    this.previousMask = smoothed;
    return smoothed;
  }

  setBackground(config: BackgroundReplacement): void {
    this.config = config;
  }

  reset(): void {
    this.previousMask = null;
  }
}
