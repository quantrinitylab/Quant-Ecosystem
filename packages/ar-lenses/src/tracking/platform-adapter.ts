import type {
  PlatformAdapterInterface,
  PlatformType,
  TrackingFrame,
  FaceDetection,
  HandDetectionAR,
  BodyDetection,
} from '../types.js';

export class MediaPipeAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'mediapipe';

  async initialize(): Promise<void> {
    // MediaPipe WASM initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    // Placeholder: real implementation calls MediaPipe Face Mesh
    return [];
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return [];
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return [];
  }
}

export class ARKitAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'arkit';

  async initialize(): Promise<void> {
    // ARKit native bridge initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    return [];
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return [];
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return [];
  }
}

export class ARCoreAdapter implements PlatformAdapterInterface {
  platform: PlatformType = 'arcore';

  async initialize(): Promise<void> {
    // ARCore native bridge initialization placeholder
  }

  detectFaces(frame: TrackingFrame): FaceDetection[] {
    if (!frame.data) return [];
    return [];
  }

  detectHands(frame: TrackingFrame): HandDetectionAR[] {
    if (!frame.data) return [];
    return [];
  }

  detectBodies(frame: TrackingFrame): BodyDetection[] {
    if (!frame.data) return [];
    return [];
  }
}
