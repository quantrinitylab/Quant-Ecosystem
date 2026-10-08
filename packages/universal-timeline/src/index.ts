// ============================================================================
// Universal Timeline - Public API
// ============================================================================

export type {
  TimelineEvent,
  TimelineFilter,
  TimelineImportance,
  TimelineSource,
  TimelineSubscriber,
} from './types';
export { UniversalTimelineService } from './timeline-service';
export type { TimelineServiceOptions } from './timeline-service';
export { TimelineAggregator } from './timeline-aggregator';
// EC-02 resource adapters (doc 22): typed refs + context envelopes.
export {
  timelineEventToResourceRef,
  attachResourceRef,
  attachProvenance,
  timelineEventToEnvelope,
} from './resource-adapters';
