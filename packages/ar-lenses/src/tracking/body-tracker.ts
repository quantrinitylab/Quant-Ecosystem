import type {
  BodyDetection,
  BodyLandmark,
  BodyTrackingMode,
  TrackingFrame,
  PlatformAdapterInterface,
} from '../types.js';

const BODY_LANDMARK_COUNT = 33;
const UPPER_BODY_LANDMARK_COUNT = 17;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class BodyTracker {
  private adapter: PlatformAdapterInterface;
  private confidenceThreshold: number;
  private mode: BodyTrackingMode;
  private maxPersons: number;

  constructor(
    adapter: PlatformAdapterInterface,
    options?: { confidenceThreshold?: number; mode?: BodyTrackingMode; maxPersons?: number },
  ) {
    this.adapter = adapter;
    this.confidenceThreshold = clamp01(options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
    this.mode = options?.mode ?? 'full';
    this.maxPersons = Math.max(1, Math.floor(options?.maxPersons ?? 5));
  }

  detectPose(frame: TrackingFrame): BodyDetection[] {
    const raw = this.adapter.detectBodies(frame);
    return raw
      .filter((body) => body.confidence >= this.confidenceThreshold)
      .slice(0, this.maxPersons)
      .map((body) => this.applyMode(body));
  }

  private applyMode(body: BodyDetection): BodyDetection {
    if (this.mode === 'upper') {
      const sliced = body.landmarks.slice(0, UPPER_BODY_LANDMARK_COUNT);
      const upperLandmarks: BodyLandmark[] = Array.from(
        { length: UPPER_BODY_LANDMARK_COUNT },
        (_, i) => sliced[i] ?? { index: i, position: { x: 0, y: 0, z: 0 }, confidence: 0 },
      );
      return { ...body, landmarks: upperLandmarks, mode: 'upper' };
    }
    return this.validateLandmarks(body);
  }

  private validateLandmarks(body: BodyDetection): BodyDetection {
    if (body.landmarks.length !== BODY_LANDMARK_COUNT) {
      const padded: BodyLandmark[] = Array.from({ length: BODY_LANDMARK_COUNT }, (_, i) => {
        const existing = body.landmarks[i];
        return existing ?? { index: i, position: { x: 0, y: 0, z: 0 }, confidence: 0 };
      });
      return { ...body, landmarks: padded };
    }
    return body;
  }

  setMode(mode: BodyTrackingMode): void {
    this.mode = mode;
  }

  setMaxPersons(max: number): void {
    this.maxPersons = Math.max(1, max);
  }

  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}
