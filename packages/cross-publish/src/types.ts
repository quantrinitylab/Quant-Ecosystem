import { z } from 'zod';

export type Surface = 'quantube' | 'quantsync' | 'quantneon' | 'quantmail';

export type AspectRatio = 'vertical_9_16' | 'horizontal_16_9' | 'square_1_1';

export type ContentType = 'video' | 'image' | 'text' | 'audio';

export type PublishStatus = 'pending' | 'processing' | 'published' | 'failed' | 'partial';

export const SurfaceSchema = z.enum(['quantube', 'quantsync', 'quantneon', 'quantmail']);

export const AspectRatioSchema = z.enum(['vertical_9_16', 'horizontal_16_9', 'square_1_1']);

export const ContentTypeSchema = z.enum(['video', 'image', 'text', 'audio']);

export const PublishStatusSchema = z.enum([
  'pending',
  'processing',
  'published',
  'failed',
  'partial',
]);

export interface PublishIntent {
  id: string;
  userId: string;
  contentId: string;
  contentType: ContentType;
  title: string;
  description: string;
  surfaces: Surface[];
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  status: PublishStatus;
}

export interface SurfaceResult {
  surface: Surface;
  status: PublishStatus;
  publishedUrl: string | null;
  error: string | null;
  publishedAt: Date | null;
}

export interface AnalyticsMetrics {
  views: number;
  likes: number;
  shares: number;
  comments: number;
  watchTime: number;
}

export interface SurfaceAnalytics {
  surface: Surface;
  metrics: AnalyticsMetrics;
  lastUpdated: Date;
}

export interface AggregatedAnalytics {
  intentId: string;
  surfaces: Surface[];
  totalMetrics: AnalyticsMetrics;
  perSurface: SurfaceAnalytics[];
}

export interface ContentLibraryItem {
  id: string;
  userId: string;
  contentType: ContentType;
  title: string;
  description: string;
  mediaUrl: string;
  thumbnailUrl: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScheduleSuggestion {
  surface: Surface;
  suggestedTime: Date;
  reason: string;
  confidence: number;
}

export interface ReframeResult {
  sourceAspect: AspectRatio;
  targetAspect: AspectRatio;
  cropRegion: CropRegion;
  confidence: number;
}

export interface SceneDetection {
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClipSuggestion {
  start: number;
  end: number;
  score: number;
  reason: string;
}
