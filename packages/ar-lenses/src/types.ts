// --- Tracking Types ---

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface FaceLandmark {
  index: number;
  position: Point3D;
  confidence: number;
}

export interface FaceExpression {
  type: 'smile' | 'blink' | 'eyebrow_raise' | 'mouth_open' | 'frown' | 'wink';
  intensity: number;
}

export interface FaceDetection {
  id: string;
  landmarks: FaceLandmark[];
  expressions: FaceExpression[];
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export interface HandLandmarkAR {
  index: number;
  position: Point3D;
  confidence: number;
}

export type HandGestureAR =
  | 'open_palm'
  | 'fist'
  | 'pinch'
  | 'point'
  | 'peace'
  | 'thumbs_up'
  | 'unknown';

export interface HandDetectionAR {
  id: string;
  hand: 'left' | 'right';
  landmarks: HandLandmarkAR[];
  gesture: HandGestureAR;
  confidence: number;
}

export interface BodyLandmark {
  index: number;
  position: Point3D;
  confidence: number;
}

export type BodyTrackingMode = 'full' | 'upper';

export interface BodyDetection {
  id: string;
  landmarks: BodyLandmark[];
  mode: BodyTrackingMode;
  confidence: number;
}

export interface TrackingFrame {
  timestamp: number;
  width: number;
  height: number;
  data: Uint8Array | null;
}

export type PlatformType = 'mediapipe' | 'arkit' | 'arcore';

export interface PlatformAdapterInterface {
  platform: PlatformType;
  initialize(): Promise<void>;
  detectFaces(frame: TrackingFrame): FaceDetection[];
  detectHands(frame: TrackingFrame): HandDetectionAR[];
  detectBodies(frame: TrackingFrame): BodyDetection[];
}

// --- Overlay Types ---

export interface Overlay2DConfig {
  id: string;
  type: 'sticker' | 'filter' | 'text';
  anchorLandmark: number;
  position: Point3D;
  rotation: number;
  scale: number;
  opacity: number;
  zOrder: number;
  animation?: AnimationKeyframe[];
}

export interface AnimationKeyframe {
  time: number;
  opacity: number;
  scale: number;
  rotation: number;
  position: Point3D;
}

export interface Overlay3DConfig {
  id: string;
  type: 'mesh_deform' | 'accessory' | 'mask';
  anchorLandmarks: number[];
  transform: TransformMatrix;
  meshData?: Float32Array;
}

export interface TransformMatrix {
  position: Point3D;
  rotation: Point3D;
  scale: Point3D;
}

export interface ParticleConfig {
  id: string;
  mode: 'burst' | 'continuous';
  maxParticles: number;
  emitRate: number;
  lifetime: number;
  gravity: number;
  wind: Point3D;
  initialVelocity: Point3D;
  size: number;
  color: string;
}

export interface Particle {
  position: Point3D;
  velocity: Point3D;
  lifetime: number;
  age: number;
  size: number;
  color: string;
}

export type LightingEffectType = 'color_grade' | 'vignette' | 'bloom' | 'face_relight' | 'bg_blur';

export interface LightingEffectConfig {
  type: LightingEffectType;
  intensity: number;
  parameters: Record<string, number>;
}

// --- Lens Format Types ---

export type LensTrigger =
  | 'face_detect'
  | 'smile'
  | 'blink'
  | 'mouth_open'
  | 'hand_raise'
  | 'always';

export interface LensEffectStep {
  effectType: string;
  parameters: Record<string, unknown>;
  order: number;
}

export interface LensDefinition {
  id: string;
  name: string;
  version: string;
  triggers: LensTrigger[];
  effects: LensEffectStep[];
  parameters: Record<string, { min: number; max: number; default: number }>;
}

export interface LensRuntimeConfig {
  frameBudgetMs: number;
  maxMemoryMb: number;
  sandboxRestrictions: string[];
}

export interface EffectPipelineStage {
  name: string;
  execute(input: PipelineData): PipelineData;
}

export interface PipelineData {
  frame: TrackingFrame;
  tracking: {
    faces: FaceDetection[];
    hands: HandDetectionAR[];
    bodies: BodyDetection[];
  };
  overlays: Array<Overlay2DConfig | Overlay3DConfig>;
  metadata: Record<string, unknown>;
}

// --- Generative Types ---

export interface GenerativeLensRequest {
  prompt: string;
  style?: string;
  intensity?: number;
}

export interface StyleTransferConfig {
  stylePreset: string;
  intensity: number;
  faceOnly: boolean;
  preserveIdentity: boolean;
}

export interface BackgroundReplacement {
  type: 'generated' | 'static' | 'blur';
  source?: string;
  edgeRefinement: number;
  temporalSmoothing: number;
}

// --- Ethics Types ---

export type BodyFilterCategory = 'weight' | 'skin_tone' | 'proportions' | 'age_appearance';

export interface EthicsPolicy {
  blockedCategories: BodyFilterCategory[];
  ageRestrictions: boolean;
  consentRequired: boolean;
  provenanceRequired: boolean;
}

export type ContentRating = 'all_ages' | 'teen' | 'mature';

export interface ConsentRecord {
  id: string;
  userId: string;
  faceId: string;
  granted: boolean;
  timestamp: number;
  purpose: string;
  revoked: boolean;
  revokedAt?: number;
}

export interface DeepfakeMarkerData {
  assetId: string;
  timestamp: number;
  transformations: string[];
  signature: string;
  c2paCompatible: boolean;
}

// --- Distribution Types ---

export type CrossAppTarget = 'quant_neon' | 'quant_chat' | 'quant_max' | 'quant_meet';

export interface AppCapabilities {
  app: CrossAppTarget;
  maxFaces: number;
  supports3D: boolean;
  supportsParticles: boolean;
  maxResolution: number;
  supportsGenerative: boolean;
}

export interface DistributionManifest {
  lensId: string;
  targets: CrossAppTarget[];
  compatibility: Map<CrossAppTarget, boolean>;
  constraints: Map<CrossAppTarget, string[]>;
}
