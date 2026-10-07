// ============================================================================
// quantube — cross-publish surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing shapes for the cross-publish api-client hooks. Mirror the JSON
// the quantube backend routes return (apps/quantube/backend/routes/cross-publish
// .ts), wrapping `@quant/cross-publish`. Typed against the `{ success, data }`
// envelope via `APIResponse<T>`.

export type CrossPublishSurface = string;
export type CrossPublishContentType = string;
export type CrossPublishStatus = 'pending' | 'processing' | 'partial' | 'completed' | 'failed';

export interface PublishIntentDTO {
  id: string;
  userId: string;
  contentId: string;
  contentType: CrossPublishContentType;
  title: string;
  description: string;
  surfaces: CrossPublishSurface[];
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  status: CrossPublishStatus;
}

export interface CreateIntentInput {
  contentId: string;
  contentType: CrossPublishContentType;
  title: string;
  description: string;
  surfaces: CrossPublishSurface[];
  mediaUrl: string;
  thumbnailUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CreateIntentResponse {
  intent: PublishIntentDTO;
}

export interface ListIntentsResponse {
  intents: PublishIntentDTO[];
}

export interface FanoutResponse {
  jobIds: string[];
  status: CrossPublishStatus;
}

export interface IntentStatusResponse {
  status: string;
  results: unknown[];
}

export interface ContentLibraryItemDTO {
  id: string;
  userId: string;
  contentType: CrossPublishContentType;
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryListResponse {
  items: ContentLibraryItemDTO[];
}

export interface StoreContentInput {
  contentType: CrossPublishContentType;
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata?: Record<string, unknown>;
}

export interface StoreContentResponse {
  item: ContentLibraryItemDTO;
}
