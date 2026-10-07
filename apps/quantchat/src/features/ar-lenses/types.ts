// ============================================================================
// quantchat — ar-lenses surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing data shapes for the ar-lenses api-client hooks. These mirror
// the JSON the quantchat backend ar-lenses routes return (see
// apps/quantchat/backend/routes/ar-lenses.ts) and are intentionally decoupled
// from the `@quant/ar-lenses` engine's internal types so a backend refactor
// never forces a frontend type change. Every hook is typed against the
// `{ success, data }` envelope via `APIResponse<T>` from the SDK.

export type ArCrossAppTarget = 'quant_neon' | 'quant_chat' | 'quant_max' | 'quant_meet';

export interface ArAppCapabilities {
  app: ArCrossAppTarget;
  maxFaces: number;
  supports3D: boolean;
  supportsParticles: boolean;
  maxResolution: number;
  supportsGenerative: boolean;
}

export interface ArCapabilitiesResponse {
  capabilities: ArAppCapabilities;
}

/** Body for POST /api/ar-lenses/lenses/generate. */
export interface GenerateLensInput {
  prompt: string;
  style?: string;
  intensity?: number;
}

export interface ArLensEffectStep {
  effectType: string;
  parameters: Record<string, unknown>;
  order: number;
}

export interface ArLensDefinition {
  id: string;
  name: string;
  version: string;
  triggers: string[];
  effects: ArLensEffectStep[];
  parameters: Record<string, { min: number; max: number; default: number }>;
}

export interface GenerateLensResponse {
  lens: ArLensDefinition;
  confidence: number;
}

export interface ArConsentRecord {
  id: string;
  userId: string;
  faceId: string;
  granted: boolean;
  timestamp: number;
  purpose: string;
  revoked: boolean;
  revokedAt?: number;
}

export interface ListConsentResponse {
  consents: ArConsentRecord[];
}

/** Body for POST /api/ar-lenses/consent. */
export interface GrantConsentInput {
  faceId: string;
  purpose: string;
}

export interface GrantConsentResponse {
  consent: ArConsentRecord;
}

export interface RevokeConsentResponse {
  id: string;
  revoked: boolean;
}
