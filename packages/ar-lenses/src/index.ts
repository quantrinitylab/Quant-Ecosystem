// Types
export type {
  Point3D,
  FaceLandmark,
  FaceExpression,
  FaceDetection,
  HandLandmarkAR,
  HandGestureAR,
  HandDetectionAR,
  BodyLandmark,
  BodyTrackingMode,
  BodyDetection,
  TrackingFrame,
  PlatformType,
  PlatformAdapterInterface,
  Overlay2DConfig,
  AnimationKeyframe,
  Overlay3DConfig,
  TransformMatrix,
  ParticleConfig,
  Particle,
  LightingEffectType,
  LightingEffectConfig,
  LensTrigger,
  LensEffectStep,
  LensDefinition,
  LensRuntimeConfig,
  EffectPipelineStage,
  PipelineData,
  GenerativeLensRequest,
  StyleTransferConfig,
  BackgroundReplacement,
  BodyFilterCategory,
  EthicsPolicy,
  ContentRating,
  ConsentRecord,
  DeepfakeMarkerData,
  CrossAppTarget,
  AppCapabilities,
  DistributionManifest,
} from './types.js';

// Tracking
export { FaceTracker } from './tracking/face-tracker.js';
export { HandTrackerAR } from './tracking/hand-tracker-ar.js';
export { BodyTracker } from './tracking/body-tracker.js';
export { MediaPipeAdapter, ARKitAdapter, ARCoreAdapter } from './tracking/platform-adapter.js';

// Overlay
export { Overlay2DEngine } from './overlay/overlay-2d.js';
export { Overlay3DEngine } from './overlay/overlay-3d.js';
export { ParticleSystem } from './overlay/particles.js';
export { LightingEffects } from './overlay/effects.js';

// Lens
export { LensSchema } from './lens/lens-schema.js';
export { LensRuntime } from './lens/lens-runtime.js';
export type { RuntimeMetrics, EthicsPolicyHook } from './lens/lens-runtime.js';
export { EffectPipeline } from './lens/effect-pipeline.js';
export type { BudgetExecutionResult } from './lens/effect-pipeline.js';

// Generative
export { PromptToLens } from './generative/prompt-to-lens.js';
export type { PromptToLensResult } from './generative/prompt-to-lens.js';
export { StyleTransfer } from './generative/style-transfer.js';
export { BackgroundReplacer } from './generative/background-replace.js';

// Ethics
export { BodyFilterGuard } from './ethics/body-filter-guard.js';
export { AgeGate } from './ethics/age-gate.js';
export { ConsentManager, InMemoryConsentStorage } from './ethics/consent-manager.js';
export type { ConsentStorage } from './ethics/consent-manager.js';
export { DeepfakeMarker } from './ethics/deepfake-marker.js';
export type { DeepfakeMarkerOptions } from './ethics/deepfake-marker.js';

// Distribution
export { CrossAppDistributor } from './distribution/cross-app.js';
