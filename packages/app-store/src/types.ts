import { z } from 'zod';

export const AppStatusSchema = z.enum([
  'draft',
  'pending_review',
  'published',
  'suspended',
  'unpublished',
]);
export type AppStatus = z.infer<typeof AppStatusSchema>;

export const VisibilitySchema = z.enum(['public', 'unlisted', 'private', 'restricted']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const AppListingSchema = z.object({
  id: z.string(),
  name: z.string(),
  creatorId: z.string(),
  description: z.string(),
  version: z.string(),
  category: z.string(),
  subcategory: z.string(),
  rating: z.number().min(0).max(5),
  reviewCount: z.number().int().min(0),
  trustScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  price: z.number().min(0),
  downloads: z.number().int().min(0),
  screenshots: z.array(z.string()),
  status: AppStatusSchema,
});
export type AppListing = z.infer<typeof AppListingSchema>;

export const AppReviewSchema = z.object({
  id: z.string(),
  appId: z.string(),
  userId: z.string(),
  rating: z.number().int().min(1).max(5),
  text: z.string(),
  verifiedPurchase: z.boolean(),
  helpful: z.number().int().min(0),
  createdAt: z.date(),
});
export type AppReview = z.infer<typeof AppReviewSchema>;

export const AppCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  parentId: z.string().optional(),
  description: z.string(),
  appCount: z.number().int().min(0),
});
export type AppCategory = z.infer<typeof AppCategorySchema>;

export const RankingFactorsSchema = z.object({
  qualityScore: z.number().min(0).max(100),
  trustScore: z.number().min(0).max(100),
  userRating: z.number().min(0).max(5),
  freshness: z.number().min(0).max(1),
  relevance: z.number().min(0).max(1),
});
export type RankingFactors = z.infer<typeof RankingFactorsSchema>;

export const DistributionTargetSchema = z.object({
  appId: z.string(),
  contexts: z.array(z.string()),
  visibility: VisibilitySchema,
  restrictions: z.array(z.string()),
});
export type DistributionTarget = z.infer<typeof DistributionTargetSchema>;

export interface SearchFilters {
  category?: string;
  minRating?: number;
  maxPrice?: number;
  status?: AppStatus;
  creatorId?: string;
}

export interface Pagination {
  offset: number;
  limit: number;
}

export interface SortOptions {
  field: 'rating' | 'downloads' | 'price' | 'name' | 'qualityScore';
  direction: 'asc' | 'desc';
}

export interface UserContext {
  userId: string;
  preferences: string[];
  history: string[];
}
