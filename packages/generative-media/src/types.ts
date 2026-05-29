export type MediaType = 'image' | 'video' | 'music' | 'voice' | '3d';
export type ProviderPriority = 'self-hosted' | 'commercial';
export type SensitivityLevel = 'strict' | 'moderate' | 'permissive';

export type Modality = 'text' | 'image' | 'video' | 'audio' | 'music' | '3d';

export interface ModalityTransform {
  source: Modality;
  target: Modality;
  providerId: string;
}

export interface SynthIDConfig {
  strength: number;
  algorithm: 'spectral' | 'spatial' | 'hybrid';
  includeMetadata: boolean;
}

export interface ProvenanceManifest {
  assetId: string;
  generationModel: string;
  prompt: string;
  timestamp: number;
  userId: string;
  c2paSignature: string;
  synthIdEmbedded: boolean;
  parentAssets: string[];
  editHistory: string[];
}

export type ObjectEditOperationType = 'inpaint' | 'outpaint' | 'style-transfer' | 'remove';

export interface ObjectEditOperation {
  type: ObjectEditOperationType;
  segmentId?: string;
  prompt?: string;
  direction?: 'left' | 'right' | 'up' | 'down';
  size?: number;
  style?: string;
}

export interface ObjectSegment {
  id: string;
  label: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  maskUri: string;
}

export interface EditResult {
  uri: string;
  operation: ObjectEditOperationType;
  segments: ObjectSegment[];
  metadata: Record<string, unknown>;
}

export interface VerificationResult {
  assetId: string;
  status: 'verified' | 'unverified' | 'tampered';
  confidence: number;
  manifest: ProvenanceManifest | null;
}

export interface ProviderConfig {
  id: string;
  name: string;
  mediaType: MediaType;
  priority: ProviderPriority;
  available: boolean;
  costPerUnit: number;
  selfHosted: boolean;
}

export interface ImageOptions {
  width: number;
  height: number;
  negativePrompt?: string;
  seed?: number;
  style?: string;
}

export interface VideoOptions {
  duration: 5 | 10 | 30;
  fps: number;
  style?: string;
}

export interface MusicOptions {
  duration: number;
  genre?: string;
  tempo?: number;
  style?: string;
}

export interface VoiceOptions {
  text: string;
  voiceId: string;
  consentVerified: boolean;
}

export interface GenerationRequest {
  prompt: string;
  mediaType: MediaType;
  options?: ImageOptions | VideoOptions | MusicOptions | VoiceOptions;
  maxBudget?: number;
}

export interface GenerationResult {
  uri: string;
  mediaType: MediaType;
  provider: string;
  cost: number;
  provenance: C2PACredential;
  metadata: Record<string, unknown>;
}

export interface SafetyResult {
  allowed: boolean;
  reasons: string[];
  confidence: number;
}

export interface CostEstimate {
  provider: string;
  estimatedCost: number;
  currency: string;
  breakdown: { item: string; cost: number }[];
}

export interface C2PACredential {
  assetId: string;
  model: string;
  prompt: string;
  timestamp: number;
  userId: string;
  signature: string;
}
