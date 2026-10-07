import type {
  FaceDetection,
  FaceLandmark,
  FaceExpression,
  TrackingFrame,
  PlatformAdapterInterface,
} from '../types.js';

const FACE_LANDMARK_COUNT = 468;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.5;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class FaceTracker {
  private adapter: PlatformAdapterInterface;
  private confidenceThreshold: number;
  private maxFaces: number;

  constructor(
    adapter: PlatformAdapterInterface,
    options?: { confidenceThreshold?: number; maxFaces?: number },
  ) {
    this.adapter = adapter;
    this.confidenceThreshold = clamp01(options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
    this.maxFaces = Math.max(1, Math.floor(options?.maxFaces ?? 5));
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    const raw = this.adapter.detectFaces(frame);
    return raw
      .filter((face) => face.confidence >= this.confidenceThreshold)
      .slice(0, this.maxFaces)
      .map((face) => this.validateLandmarks(face));
  }

  private validateLandmarks(face: FaceDetection): FaceDetection {
    if (face.landmarks.length !== FACE_LANDMARK_COUNT) {
      const padded: FaceLandmark[] = Array.from({ length: FACE_LANDMARK_COUNT }, (_, i) => {
        const existing = face.landmarks[i];
        return existing ?? { index: i, position: { x: 0, y: 0, z: 0 }, confidence: 0 };
      });
      return { ...face, landmarks: padded };
    }
    return face;
  }

  getExpressions(face: FaceDetection): FaceExpression[] {
    return face.expressions.filter((e) => e.intensity > 0.3);
  }

  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }

  setMaxFaces(max: number): void {
    this.maxFaces = Math.max(1, max);
  }
}
