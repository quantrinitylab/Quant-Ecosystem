// ============================================================================
// quantube — media surface DTOs (Layer 5 request/response contracts)
// ============================================================================
//
// Frontend-facing shapes for the media api-client hooks. Mirror the JSON the
// quantube backend media routes return (apps/quantube/backend/routes/media.ts),
// which wrap `@quant/media` (UploadManager + SharedMediaPickerService). Typed
// against the `{ success, data }` envelope via `APIResponse<T>`.

export type MediaItemType = 'image' | 'video' | 'audio' | 'document';

export interface InitUploadInput {
  fileName: string;
  fileSize: number;
  mimeType: string;
  chunkSize?: number;
  checksum?: string;
  metadata?: Record<string, unknown>;
}

export interface UploadSessionResponse {
  session: {
    id: string;
    fileName: string;
    fileSize: number;
    totalChunks: number;
    status: string;
    [key: string]: unknown;
  };
}

export interface UploadProgressResponse {
  progress: {
    progress: number;
    uploadedBytes: number;
    totalBytes: number;
    uploadedChunks: number;
    totalChunks: number;
    status: string;
    [key: string]: unknown;
  };
}

export interface MediaLibraryItem {
  id: string;
  type: MediaItemType;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  sourceApp: string;
  createdAt: number;
}

export interface MediaLibraryResponse {
  items: MediaLibraryItem[];
  storage: { used: number; limit: number };
}

export interface AddMediaInput {
  type: MediaItemType;
  url: string;
  name: string;
  size: number;
  mimeType: string;
  thumbnailUrl?: string;
  sourceApp?: string;
}

export interface AddMediaResponse {
  item: MediaLibraryItem;
}

export interface MediaLibraryQuery {
  type?: MediaItemType;
  maxItems?: number;
  sourceApp?: string;
}
