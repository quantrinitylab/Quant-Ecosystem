// ============================================================================
// AI Daily Brief - Types
// ============================================================================

export interface DailyBrief {
  id: string;
  userId: string;
  generatedAt: number;
  sections: BriefSection[];
  overallPriority: BriefPriority;
}

export type BriefPriority = 'low' | 'medium' | 'high' | 'critical';

export type BriefSectionType =
  | 'deadlines'
  | 'messages'
  | 'meetings'
  | 'tasks'
  | 'anomalies'
  | 'insights';

export interface BriefSection {
  type: BriefSectionType;
  title: string;
  items: BriefItem[];
  urgency: number;
}

export interface BriefItem {
  id: string;
  title: string;
  description: string;
  dueAt?: number;
  sourceApp: string;
  priority: BriefPriority;
  actionUrl?: string;
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  description: string;
  severity: number;
  detectedAt: number;
  context: Record<string, string>;
}

export type AnomalyType =
  | 'missed_deadline'
  | 'message_spike'
  | 'unusual_activity_time'
  | 'overdue_task';

export interface DataProvider {
  name: string;
  app: string;
  fetchItems: (userId: string) => Promise<BriefItem[]>;
}
