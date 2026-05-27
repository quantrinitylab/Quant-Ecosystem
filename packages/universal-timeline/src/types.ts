// ============================================================================
// Universal Timeline - Types
// ============================================================================

export interface TimelineEvent {
  id: string;
  userId: string;
  app: string;
  type: string;
  title: string;
  description: string;
  resourceUrl?: string;
  timestamp: number;
  metadata?: Record<string, string>;
  importance: TimelineImportance;
}

export type TimelineImportance = 'low' | 'medium' | 'high' | 'critical';

export interface TimelineFilter {
  apps?: string[];
  types?: string[];
  userId?: string;
  projectId?: string;
  importance?: TimelineImportance[];
  before?: number;
  after?: number;
  limit?: number;
}

export interface TimelineSource {
  name: string;
  app: string;
  fetchEvents: (filter: TimelineFilter) => Promise<TimelineEvent[]>;
}

export type TimelineSubscriber = (event: TimelineEvent) => void;
