// ============================================================================
// Universal Timeline - Types
// ============================================================================

import type { QuantResourceRef, ResourceProvenance } from '@quant/app-registry';

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
  /**
   * EC-02 typed resource reference (doc 22 §2). Attached when the event's
   * app/type/id resolve against the canonical resource vocabulary;
   * absent for unknown producers (timeline never drops events).
   */
  resourceRef?: QuantResourceRef;
  /**
   * EC-02 provenance (§8) — set when this event was imported/derived from
   * another app's object rather than produced natively.
   */
  provenance?: ResourceProvenance;
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
