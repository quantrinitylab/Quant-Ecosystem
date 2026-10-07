// ============================================================================
// Ranking System - Shared Types
// ============================================================================

export interface FeedItem {
  id: string;
  content: string;
  authorId: string;
  timestamp: number;
  metadata: Record<string, unknown>;
  upvotes: number;
  shares: number;
  replies: number;
  replyQuality: number;
  authorReputation: number;
}

export interface RankedItem extends FeedItem {
  score: number;
  algorithmUsed: AlgorithmType;
}

export enum AlgorithmType {
  Chrono = 'chrono',
  AI = 'ai',
  Community = 'community',
  Custom = 'custom',
  Following = 'following',
}

export interface UserAlgorithmPreference {
  userId: string;
  algorithm: AlgorithmType;
  feedId: string;
  customPluginId?: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  wasmUrl: string;
  version: string;
  author: string;
}

export interface ABTestBucket {
  experimentId: string;
  bucket: string;
  algorithm: AlgorithmType;
}

export interface FeedRequest {
  userId: string;
  feedId: string;
  page: number;
  pageSize: number;
}

export interface FeedResponse {
  items: RankedItem[];
  page: number;
  pageSize: number;
  algorithmUsed: AlgorithmType;
}
