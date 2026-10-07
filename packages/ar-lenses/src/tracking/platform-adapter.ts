import type {
  PlatformAdapterInterface,
  PlatformType,
  TrackingFrame,
  FaceDetection,
  HandDetectionAR,
  BodyDetection,
} from '../types.js';

// These adapters are placeholders for the native/WASM tracking backends. Until a
// backend is wired up they return `[]` for empty (null-data) frames, but throw for
// frames that actually carry pixel data — surfacing "not implemented" loudly instead
// of silently reporting "no detections" on every frame.
function notImplemented(platform: PlatformType, kind: string): never {
  throw new Error(`${platform} ${kind} detection is not implemented yet`);
}

export class MediaPipeAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'mediapipe';

  async initialize(): Promise<void> {
    // MediaPipe WASM initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'face');
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'hand');
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'body');
  }
}

export class ARKitAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'arkit';

  async initialize(): Promise<void> {
    // ARKit native bridge initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'face');
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'hand');
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'body');
  }
}

export class ARCoreAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'arcore';

  async initialize(): Promise<void> {
    // ARCore native bridge initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'face');
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'hand');
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return notImplemented(this.platform, 'body');
  }
}
