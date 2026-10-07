// ============================================================================
// quantchat — federation surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing data shapes for the federation api-client hooks. These mirror
// the JSON the quantchat backend federation routes return (see
// apps/quantchat/backend/routes/federation.ts) and are intentionally decoupled
// from the `@quant/federation` engine's internal types so a backend refactor
// never forces a frontend type change. Every hook is typed against the
// `{ success, data }` envelope via `APIResponse<T>` from the SDK.

export interface FederationInstanceStatus {
  domain: string;
  blocked: boolean;
  allowed: boolean;
}

/** Body for POST /api/federation/instances/block and /allow. */
export interface FederationInstanceInput {
  domain: string;
}

export interface FederationInstanceMutationResponse {
  domain: string;
  blocked?: boolean;
  allowed?: boolean;
}

export interface FederationApiKeySummary {
  id: string;
  name: string;
  ownerId: string;
  scopes: string[];
  createdAt?: string;
  expiresAt?: string;
  revoked?: boolean;
}

/** An API key as returned ONCE on creation (includes the raw secret). */
export interface FederationApiKeyWithSecret extends FederationApiKeySummary {
  key: string;
}

export interface ListFederationKeysResponse {
  keys: FederationApiKeySummary[];
}

/** Body for POST /api/federation/keys. */
export interface CreateFederationKeyInput {
  name: string;
  scopes: string[];
  expiresAt?: string;
}

export interface CreateFederationKeyResponse {
  apiKey: FederationApiKeyWithSecret;
}

export interface RevokeFederationKeyResponse {
  id: string;
  revoked: boolean;
}
