// ============================================================================
// QuantEdits - Type Definitions
// Professional video/photo editor types
// ============================================================================

export type ProjectType = 'video' | 'photo' | 'design' | 'presentation' | 'story' | 'reel';
export type LayerType =
  | 'video'
  | 'audio'
  | 'image'
  | 'text'
  | 'shape'
  | 'effect'
  | 'overlay'
  | 'sticker';
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';
export type ExportFormat =
  | 'mp4'
  | 'mov'
  | 'avi'
  | 'webm'
  | 'gif'
  | 'png'
  | 'jpg'
  | 'webp'
  | 'svg'
  | 'pdf';
export type ExportQuality = 'draft' | 'standard' | 'high' | 'ultra' | '4k' | '8k';
export type EffectCategory =
  | 'filter'
  | 'transition'
  | 'animation'
  | 'text-effect'
  | 'color-grade'
  | 'blur'
  | 'distortion'
  | 'stylize';
export type AssetCategory =
  | 'font'
  | 'music'
  | 'stock-photo'
  | 'stock-video'
  | 'icon'
  | 'shape'
  | 'background'
  | 'sticker'
  | 'brand-kit';
export type TemplateCategory =
  | 'social-media'
  | 'presentation'
  | 'video'
  | 'photo'
  | 'story'
  | 'thumbnail'
  | 'ad'
  | 'poster';

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: ProjectType;
  width: number;
  height: number;
  fps: number;
  duration: number;
  layers: Layer[];
  timeline: Timeline;
  createdAt: string;
  updatedAt: string;
  version: number;
  autoSaveEnabled: boolean;
  collaborators: Collaborator[];
  thumbnail?: string;
  tags: string[];
  isPublic: boolean;
}

export interface Layer {
  id: string;
  projectId: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  position: { x: number; y: number; z: number };
  size: { width: number; height: number };
  rotation: number;
  scale: { x: number; y: number };
  anchor: { x: number; y: number };
  effects: AppliedEffect[];
  keyframes: Keyframe[];
  startTime: number;
  endTime: number;
  content: LayerContent;
  mask?: MaskConfig;
  parentId?: string;
  children: string[];
}

export interface LayerContent {
  type: LayerType;
  src?: string;
  text?: TextContent;
  shape?: ShapeContent;
  color?: string;
  videoTrim?: { start: number; end: number };
  audioVolume?: number;
  playbackSpeed?: number;
}

export interface TextContent {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  stroke?: { color: string; width: number };
  shadow?: { color: string; offsetX: number; offsetY: number; blur: number };
  backgroundColor?: string;
}

export interface ShapeContent {
  type: 'rectangle' | 'circle' | 'triangle' | 'polygon' | 'star' | 'line' | 'arrow' | 'custom';
  fill: string;
  stroke: { color: string; width: number };
  borderRadius?: number;
  points?: number;
  path?: string;
}

export interface Timeline {
  id: string;
  projectId: string;
  duration: number;
  tracks: Track[];
  markers: TimelineMarker[];
  playheadPosition: number;
  zoom: number;
  scrollPosition: number;
}

export interface Track {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'effect' | 'text' | 'overlay';
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  height: number;
  volume: number;
}

export interface Clip {
  id: string;
  trackId: string;
  layerId: string;
  startTime: number;
  endTime: number;
  trimStart: number;
  trimEnd: number;
  transitions: { in?: Transition; out?: Transition };
  speed: number;
  volume: number;
}

export interface Transition {
  type: string;
  duration: number;
  easing: string;
  params: Record<string, unknown>;
}

export interface TimelineMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

export interface Keyframe {
  id: string;
  layerId: string;
  time: number;
  property: string;
  value: unknown;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce' | 'elastic';
}

export interface MaskConfig {
  type: 'shape' | 'path' | 'alpha' | 'luminance';
  inverted: boolean;
  feather: number;
  path?: string;
  shape?: ShapeContent;
}

export interface Effect {
  id: string;
  name: string;
  category: EffectCategory;
  description: string;
  thumbnail: string;
  params: EffectParam[];
  isCustom: boolean;
  isPremium: boolean;
  preview?: string;
}

export interface EffectParam {
  name: string;
  type: 'number' | 'color' | 'boolean' | 'select' | 'range' | 'point';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface AppliedEffect {
  id: string;
  effectId: string;
  name: string;
  enabled: boolean;
  params: Record<string, unknown>;
  intensity: number;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  thumbnail: string;
  preview?: string;
  width: number;
  height: number;
  duration?: number;
  layers: Layer[];
  variables: TemplateVariable[];
  tags: string[];
  isPremium: boolean;
  usageCount: number;
  creatorId: string;
  createdAt: string;
}

export interface TemplateVariable {
  id: string;
  name: string;
  type: 'text' | 'image' | 'color' | 'video';
  defaultValue: string;
  hint: string;
  layerId: string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  url: string;
  thumbnail: string;
  metadata: AssetMetadata;
  tags: string[];
  isPremium: boolean;
  license: 'free' | 'premium' | 'enterprise';
  uploadedBy?: string;
  createdAt: string;
}

export interface AssetMetadata {
  size: number;
  format: string;
  width?: number;
  height?: number;
  duration?: number;
  sampleRate?: number;
  bitrate?: number;
}

export interface ExportConfig {
  format: ExportFormat;
  quality: ExportQuality;
  width: number;
  height: number;
  fps?: number;
  bitrate?: number;
  codec?: string;
  audioCodec?: string;
  publishTo?: PublishTarget[];
}

export interface PublishTarget {
  app: 'quantneon' | 'quantube' | 'quantsync' | 'quantmax';
  title: string;
  description: string;
  tags: string[];
  visibility: 'public' | 'private' | 'unlisted';
  schedule?: string;
}

export interface ExportJob {
  id: string;
  projectId: string;
  userId: string;
  config: ExportConfig;
  status:
    | 'queued'
    | 'processing'
    | 'rendering'
    | 'encoding'
    | 'publishing'
    | 'completed'
    | 'failed';
  progress: number;
  outputUrl?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface Collaborator {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer' | 'commenter';
  joinedAt: string;
  cursorPosition?: { x: number; y: number };
  selectedLayerId?: string;
  isOnline: boolean;
}

export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  content: string;
  timestamp: number;
  layerId?: string;
  position?: { x: number; y: number };
  resolved: boolean;
  replies: Comment[];
  createdAt: string;
}

export interface AIEditRequest {
  type:
    | 'background-removal'
    | 'upscale'
    | 'style-transfer'
    | 'auto-caption'
    | 'voice-clone'
    | 'object-removal'
    | 'color-grade'
    | 'auto-edit'
    | 'enhance';
  projectId: string;
  layerId?: string;
  params: Record<string, unknown>;
  prompt?: string;
}

export interface AIEditResult {
  id: string;
  requestId: string;
  status: 'processing' | 'completed' | 'failed';
  outputUrl?: string;
  layers?: Layer[];
  confidence: number;
  processingTime: number;
}

export interface VersionHistory {
  id: string;
  projectId: string;
  version: number;
  snapshot: Partial<Project>;
  userId: string;
  description: string;
  createdAt: string;
}

export interface BrandKit {
  id: string;
  userId: string;
  name: string;
  colors: string[];
  fonts: { primary: string; secondary: string; accent: string };
  logos: Asset[];
  guidelines: string;
}

export interface RouteDefinition {
  method: string;
  path: string;
  handler: (req: any, res: any) => Promise<void>;
  middleware?: any[];
  requiresAuth?: boolean;
}
