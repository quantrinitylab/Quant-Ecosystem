export interface LiveTranscriptConfig {
  enabled: boolean;
  language: string;
  showConfidence: boolean;
  autoScroll: boolean;
}

export interface BackgroundBlurONNXConfig {
  modelPath: string;
  segmentationThreshold: number;
  smoothingFactor: number;
  fps: number;
}

export interface MeetingSummaryResult {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  duration: number;
}

export interface ActionItemResult {
  items: ActionItem[];
  totalCount: number;
  generatedAt: Date;
}

export interface ActionItem {
  id: string;
  title: string;
  description: string;
  assignee: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SmartMuteDetectionConfig {
  enabled: boolean;
  silenceThresholdDb: number;
  silenceDurationMs: number;
  notifyParticipant: boolean;
}

export interface MeetingPrepConfig {
  enabled: boolean;
  lookbackDays: number;
  relevantDocsLimit: number;
  includeCalendarContext: boolean;
}

export interface RelevantDoc {
  id: string;
  title: string;
  snippet: string;
  relevanceScore: number;
  source: string;
}

export interface ParticipantContext {
  userId: string;
  displayName: string;
  recentInteractions: number;
  sharedDocs: string[];
}

export interface MeetingPrepResult {
  suggestedAgenda: string[];
  relevantDocs: RelevantDoc[];
  previousActionItems: string[];
  participants: ParticipantContext[];
}
