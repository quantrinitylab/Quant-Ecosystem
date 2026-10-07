import type {
  HandDetectionAR,
  HandGestureAR,
  HandLandmarkAR,
  TrackingFrame,
  PlatformAdapterInterface,
} from '../types.js';

const HAND_LANDMARK_COUNT = 21;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export class HandTrackerAR {
  private adapter: PlatformAdapterInterface;
  private confidenceThreshold: number;

  constructor(adapter: PlatformAdapterInterface, options?: { confidenceThreshold?: number }) {
    this.adapter = adapter;
    this.confidenceThreshold = clamp01(options?.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    const raw = this.adapter.detectHands(frame);
    return raw
      .filter((hand) => hand.confidence >= this.confidenceThreshold)
      .map((hand) => this.validateLandmarks(hand))
      .map((hand) => ({ ...hand, gesture: this.classifyGesture(hand.landmarks) }));
  }

  classifyGesture(landmarks: HandLandmarkAR[]): HandGestureAR {
    if (landmarks.length < HAND_LANDMARK_COUNT) return 'unknown';

    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];

    if (!thumbTip || !indexTip || !middleTip || !ringTip || !pinkyTip || !wrist) return 'unknown';

    const allExtended = [indexTip, middleTip, ringTip, pinkyTip].every(
      (tip) => tip.position.y < wrist.position.y,
    );
    if (allExtended) return 'open_palm';

    const allCurled = [indexTip, middleTip, ringTip, pinkyTip].every(
      (tip) => tip.position.y >= wrist.position.y,
    );

    // Check thumbs_up before fist: thumb raised while all fingers curled
    const thumbUp = thumbTip.position.y < wrist.position.y;
    if (allCurled && thumbUp) return 'thumbs_up';

    if (allCurled) return 'fist';

    const thumbIndexClose =
      Math.abs(thumbTip.position.x - indexTip.position.x) < 0.05 &&
      Math.abs(thumbTip.position.y - indexTip.position.y) < 0.05;
    if (thumbIndexClose) return 'pinch';

    const indexExtended = indexTip.position.y < wrist.position.y;
    const othersDown = [middleTip, ringTip, pinkyTip].every(
      (tip) => tip.position.y >= wrist.position.y,
    );
    if (indexExtended && othersDown) return 'point';

    const indexMiddleUp =
      indexTip.position.y < wrist.position.y && middleTip.position.y < wrist.position.y;
    const ringPinkyDown = [ringTip, pinkyTip].every((tip) => tip.position.y >= wrist.position.y);
    if (indexMiddleUp && ringPinkyDown) return 'peace';

    return 'unknown';
  }

  private validateLandmarks(hand: HandDetectionAR): HandDetectionAR {
    if (hand.landmarks.length !== HAND_LANDMARK_COUNT) {
      const padded: HandLandmarkAR[] = Array.from({ length: HAND_LANDMARK_COUNT }, (_, i) => {
        const existing = hand.landmarks[i];
        return existing ?? { index: i, position: { x: 0, y: 0, z: 0 }, confidence: 0 };
      });
      return { ...hand, landmarks: padded };
    }
    return hand;
  }

  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0, Math.min(1, threshold));
  }
}
