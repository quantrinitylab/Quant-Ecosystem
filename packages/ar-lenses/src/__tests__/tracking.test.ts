import { describe, it, expect } from 'vitest';
import { FaceTracker } from '../tracking/face-tracker.js';
import { HandTrackerAR } from '../tracking/hand-tracker-ar.js';
import { BodyTracker } from '../tracking/body-tracker.js';
import { MediaPipeAdapter, ARKitAdapter, ARCoreAdapter } from '../tracking/platform-adapter.js';
import type {
  PlatformAdapterInterface,
  TrackingFrame,
  FaceDetection,
  HandDetectionAR,
  BodyDetection,
} from '../types.js';

function createFrame(): TrackingFrame {
  return { timestamp: Date.now(), width: 1920, height: 1080, data: new Uint8Array(100) };
}

function createMockAdapter(
  faces: FaceDetection[] = [],
  hands: HandDetectionAR[] = [],
  bodies: BodyDetection[] = [],
): PlatformAdapterInterface {
  return {
    platform: 'mediapipe',
    initialize: async () => {},
    detectFaces: () => faces,
    detectHands: () => hands,
    detectBodies: () => bodies,
  };
}

function makeFace(id: string, confidence: number, landmarkCount = 468): FaceDetection {
  return {
    id,
    confidence,
    landmarks: Array.from({ length: landmarkCount }, (_, i) => ({
      index: i,
      position: { x: Math.random(), y: Math.random(), z: 0 },
      confidence: 0.9,
    })),
    expressions: [
      { type: 'smile', intensity: 0.8 },
      { type: 'blink', intensity: 0.2 },
    ],
    boundingBox: { x: 0, y: 0, width: 200, height: 200 },
  };
}

function makeHand(id: string, hand: 'left' | 'right', confidence: number): HandDetectionAR {
  return {
    id,
    hand,
    confidence,
    gesture: 'open_palm',
    landmarks: Array.from({ length: 21 }, (_, i) => ({
      index: i,
      position: { x: Math.random(), y: i < 10 ? -1 : 1, z: 0 },
      confidence: 0.9,
    })),
  };
}

function makeBody(id: string, confidence: number, count = 33): BodyDetection {
  return {
    id,
    confidence,
    mode: 'full',
    landmarks: Array.from({ length: count }, (_, i) => ({
      index: i,
      position: { x: Math.random(), y: Math.random(), z: 0 },
      confidence: 0.9,
    })),
  };
}

describe('FaceTracker', () => {
  it('detects faces with 468 landmarks', () => {
    const face = makeFace('f1', 0.95);
    const adapter = createMockAdapter([face]);
    const tracker = new FaceTracker(adapter);
    const results = tracker.detectFaces(createFrame());
    expect(results).toHaveLength(1);
    expect(results[0]!.landmarks).toHaveLength(468);
  });

  it('filters by confidence threshold', () => {
    const faces = [makeFace('f1', 0.9), makeFace('f2', 0.3)];
    const adapter = createMockAdapter(faces);
    const tracker = new FaceTracker(adapter, { confidenceThreshold: 0.5 });
    const results = tracker.detectFaces(createFrame());
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe('f1');
  });

  it('supports multi-face detection', () => {
    const faces = [makeFace('f1', 0.9), makeFace('f2', 0.8), makeFace('f3', 0.7)];
    const adapter = createMockAdapter(faces);
    const tracker = new FaceTracker(adapter, { maxFaces: 3 });
    const results = tracker.detectFaces(createFrame());
    expect(results).toHaveLength(3);
  });

  it('limits to maxFaces', () => {
    const faces = [makeFace('f1', 0.9), makeFace('f2', 0.8), makeFace('f3', 0.7)];
    const adapter = createMockAdapter(faces);
    const tracker = new FaceTracker(adapter, { maxFaces: 2 });
    const results = tracker.detectFaces(createFrame());
    expect(results).toHaveLength(2);
  });

  it('pads landmarks if less than 468', () => {
    const face = makeFace('f1', 0.95, 100);
    const adapter = createMockAdapter([face]);
    const tracker = new FaceTracker(adapter);
    const results = tracker.detectFaces(createFrame());
    expect(results[0]!.landmarks).toHaveLength(468);
  });

  it('extracts expressions above threshold', () => {
    const face = makeFace('f1', 0.95);
    const adapter = createMockAdapter([face]);
    const tracker = new FaceTracker(adapter);
    const results = tracker.detectFaces(createFrame());
    const expressions = tracker.getExpressions(results[0]!);
    expect(expressions).toHaveLength(1);
    expect(expressions[0]!.type).toBe('smile');
  });
});

describe('HandTrackerAR', () => {
  it('detects hands with 21 landmarks', () => {
    const hand = makeHand('h1', 'right', 0.9);
    const adapter = createMockAdapter([], [hand]);
    const tracker = new HandTrackerAR(adapter);
    const results = tracker.detectHands(createFrame());
    expect(results).toHaveLength(1);
    expect(results[0]!.landmarks).toHaveLength(21);
  });

  it('classifies gestures', () => {
    const tracker = new HandTrackerAR(createMockAdapter());
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      index: i,
      position: { x: 0, y: i === 0 ? 1 : -1, z: 0 },
      confidence: 0.9,
    }));
    const gesture = tracker.classifyGesture(landmarks);
    expect(gesture).toBe('open_palm');
  });

  it('classifies thumbs_up gesture', () => {
    const tracker = new HandTrackerAR(createMockAdapter());
    // Wrist at y=1, thumb tip at y=-1 (above), all finger tips at y=1 (at or below wrist)
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      index: i,
      position: { x: 0, y: 1, z: 0 },
      confidence: 0.9,
    }));
    // wrist at y=1
    landmarks[0] = { index: 0, position: { x: 0, y: 1, z: 0 }, confidence: 0.9 };
    // thumb tip above wrist
    landmarks[4] = { index: 4, position: { x: 0, y: -1, z: 0 }, confidence: 0.9 };
    // index, middle, ring, pinky tips at or below wrist (curled)
    landmarks[8] = { index: 8, position: { x: 0, y: 1, z: 0 }, confidence: 0.9 };
    landmarks[12] = { index: 12, position: { x: 0, y: 1, z: 0 }, confidence: 0.9 };
    landmarks[16] = { index: 16, position: { x: 0, y: 1, z: 0 }, confidence: 0.9 };
    landmarks[20] = { index: 20, position: { x: 0, y: 1, z: 0 }, confidence: 0.9 };
    const gesture = tracker.classifyGesture(landmarks);
    expect(gesture).toBe('thumbs_up');
  });

  it('returns unknown for insufficient landmarks', () => {
    const tracker = new HandTrackerAR(createMockAdapter());
    const gesture = tracker.classifyGesture([]);
    expect(gesture).toBe('unknown');
  });

  it('filters by confidence threshold', () => {
    const hands = [makeHand('h1', 'left', 0.9), makeHand('h2', 'right', 0.3)];
    const adapter = createMockAdapter([], hands);
    const tracker = new HandTrackerAR(adapter, { confidenceThreshold: 0.6 });
    const results = tracker.detectHands(createFrame());
    expect(results).toHaveLength(1);
  });
});

describe('BodyTracker', () => {
  it('detects 33 body landmarks', () => {
    const body = makeBody('b1', 0.9);
    const adapter = createMockAdapter([], [], [body]);
    const tracker = new BodyTracker(adapter);
    const results = tracker.detectPose(createFrame());
    expect(results).toHaveLength(1);
    expect(results[0]!.landmarks).toHaveLength(33);
  });

  it('supports upper body mode', () => {
    const body = makeBody('b1', 0.9);
    const adapter = createMockAdapter([], [], [body]);
    const tracker = new BodyTracker(adapter, { mode: 'upper' });
    const results = tracker.detectPose(createFrame());
    expect(results[0]!.landmarks).toHaveLength(17);
    expect(results[0]!.mode).toBe('upper');
  });

  it('supports multi-person tracking', () => {
    const bodies = [makeBody('b1', 0.9), makeBody('b2', 0.8)];
    const adapter = createMockAdapter([], [], bodies);
    const tracker = new BodyTracker(adapter, { maxPersons: 5 });
    const results = tracker.detectPose(createFrame());
    expect(results).toHaveLength(2);
  });

  it('respects maxPersons limit', () => {
    const bodies = [makeBody('b1', 0.9), makeBody('b2', 0.8), makeBody('b3', 0.7)];
    const adapter = createMockAdapter([], [], bodies);
    const tracker = new BodyTracker(adapter, { maxPersons: 2 });
    const results = tracker.detectPose(createFrame());
    expect(results).toHaveLength(2);
  });

  it('filters by confidence', () => {
    const bodies = [makeBody('b1', 0.9), makeBody('b2', 0.2)];
    const adapter = createMockAdapter([], [], bodies);
    const tracker = new BodyTracker(adapter, { confidenceThreshold: 0.5 });
    const results = tracker.detectPose(createFrame());
    expect(results).toHaveLength(1);
  });
});

describe('PlatformAdapters', () => {
  it('MediaPipeAdapter has correct platform type', () => {
    const adapter = new MediaPipeAdapter();
    expect(adapter.platform).toBe('mediapipe');
  });

  it('ARKitAdapter has correct platform type', () => {
    const adapter = new ARKitAdapter();
    expect(adapter.platform).toBe('arkit');
  });

  it('ARCoreAdapter has correct platform type', () => {
    const adapter = new ARCoreAdapter();
    expect(adapter.platform).toBe('arcore');
  });

  it('adapters return empty arrays for null data frames', () => {
    const adapter = new MediaPipeAdapter();
    const frame: TrackingFrame = { timestamp: 0, width: 0, height: 0, data: null };
    expect(adapter.detectFaces(frame)).toHaveLength(0);
    expect(adapter.detectHands(frame)).toHaveLength(0);
    expect(adapter.detectBodies(frame)).toHaveLength(0);
  });
});
