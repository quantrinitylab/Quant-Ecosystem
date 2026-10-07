// Types
export type {
  Surface,
  AspectRatio,
  ContentType,
  PublishStatus,
  PublishIntent,
  SurfaceResult,
  AnalyticsMetrics,
  SurfaceAnalytics,
  AggregatedAnalytics,
  ContentLibraryItem,
  ScheduleSuggestion,
  ReframeResult,
  SceneDetection,
  CropRegion,
  ClipSuggestion,
} from './types.js';

export {
  SurfaceSchema,
  AspectRatioSchema,
  ContentTypeSchema,
  PublishStatusSchema,
} from './types.js';

// Services
export {
  PublishIntentService,
  PublishIntentSchema,
  CreatePublishIntentSchema,
} from './publish-intent.js';
export type { CreatePublishIntentInput, ListFilters } from './publish-intent.js';

export { SurfaceAdapter } from './surface-adapter.js';
export type { FormattedContent } from './surface-adapter.js';

export { AIReframeService } from './ai-reframe.service.js';

export { AITitleDescriptionService } from './ai-title-description.service.js';
export type { ContentInfo } from './ai-title-description.service.js';

export { AISchedulingService } from './ai-scheduling.service.js';

export { PublishFanoutService, CrossPublishJobSchema } from './publish-fanout.service.js';
export type { CrossPublishJob, QueueAdapter } from './publish-fanout.service.js';

export { AnalyticsAggregatorService } from './analytics-aggregator.service.js';

export { ContentLibraryService } from './content-library.service.js';
export type { StoreContentInput, ContentListFilters } from './content-library.service.js';

// Routes
export { createPublishRoutes } from './routes/publish.js';
export type { RouteRequest, RouteResponse } from './routes/publish.js';
