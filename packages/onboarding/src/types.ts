export type OnboardingRole = 'personal' | 'team-admin' | 'creator' | 'advertiser' | 'developer';

export type OnboardingStepStatus = 'pending' | 'active' | 'completed' | 'skipped';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  required: boolean;
  data?: Record<string, unknown>;
}

export interface OnboardingFlow {
  id: string;
  role: OnboardingRole;
  steps: OnboardingStep[];
  currentStepIndex: number;
  completedAt?: Date;
}

export interface DemoModeConfig {
  enabled: boolean;
  sampleDataSets: SampleDataSet[];
  expiresAt?: Date;
}

export type ImportSource = 'google' | 'microsoft' | 'apple' | 'github' | 'csv' | 'custom';

export type ImportDataType = 'email' | 'calendar' | 'contacts' | 'files' | 'repos';

export interface ImportFlowConfig {
  source: ImportSource;
  dataTypes: ImportDataType[];
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
}

export type AIPersonality = 'professional' | 'friendly' | 'concise' | 'creative' | 'technical';

export interface AISetupPreferences {
  personality: AIPersonality;
  memoryEnabled: boolean;
  contextSources: string[];
  autoSuggest: boolean;
}

export type PrivacyLevel = 'strict' | 'balanced' | 'open';

export interface PrivacyPreferences {
  level: PrivacyLevel;
  dataSharing: boolean;
  aiDataAccess: boolean;
  profileVisibility: 'public' | 'private' | 'contacts-only';
  activityVisibility: 'public' | 'private' | 'contacts-only';
}

export type NotificationChannel = 'email' | 'push' | 'in-app' | 'sms';

export type NotificationFrequency = 'realtime' | 'hourly' | 'daily' | 'weekly';

export interface NotificationPreferences {
  channels: NotificationChannel[];
  frequency: NotificationFrequency;
  categories: Record<string, boolean>;
}

export interface SampleDataSet {
  name: string;
  description: string;
  items: Record<string, unknown>[];
}

// --- Phase 35: Activation, Retention, Gamification ---

export type ActivationEvent =
  | 'first_message_sent'
  | 'first_doc_created'
  | 'first_file_uploaded'
  | 'first_invite_sent'
  | 'first_integration_connected'
  | 'profile_completed'
  | 'first_search'
  | 'first_ai_interaction';

export interface ActivationMetrics {
  userId: string;
  totalEvents: number;
  completedEvents: ActivationEvent[];
  activationRate: number;
  activationRateTarget: number; // >=0.40
  activated: boolean;
  onboardingStepsCompleted: number;
  maxOnboardingSteps: number; // 3
  skippedAll: boolean;
  timestamp: Date;
}

export interface RetentionMetrics {
  userId: string;
  signupDate: Date;
  lastActiveDate: Date;
  d7Retained: boolean;
  d7Target: number; // >=0.25
  daysActive: number[];
  retentionRate: number;
  reEngagementSent: number[];
  unsubscribed: boolean;
}

export interface StreakConfig {
  enabled: boolean;
  optIn: boolean;
  currentStreak: number;
  longestStreak: number;
  lastActivityDate?: Date;
  gracePeriodHours: number;
  maxNotificationsPerDay: number;
}

export interface GamificationConfig {
  optIn: boolean;
  streaks: StreakConfig;
  dailyBriefEnabled: boolean;
  weeklyReviewEnabled: boolean;
  addictionSafeguards: {
    maxDailyNotifications: number;
    quietHoursEnabled: boolean;
    quietHoursStart: number; // hour 0-23
    quietHoursEnd: number;
    noFOMO: boolean;
  };
}

export interface TutorialStep {
  id: string;
  title: string;
  content: string;
  targetSelector?: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  highlightElement?: boolean;
  allowDismiss: boolean;
}

export interface TutorialOverlay {
  id: string;
  appId: string;
  steps: TutorialStep[];
  currentStepIndex: number;
  completed: boolean;
  dismissed: boolean;
  progress: number;
}

export type AppId =
  | 'quant-chat'
  | 'quant-mail'
  | 'quant-edits'
  | 'quant-drive'
  | 'quant-meet'
  | 'quant-calendar'
  | 'quant-tasks'
  | 'quant-code'
  | 'quant-social'
  | 'quant-ads'
  | 'quant-pay'
  | 'quant-photos'
  | 'quant-mobile';

export interface EmptyStateConfig {
  appId: AppId;
  personality: 'witty' | 'professional' | 'creative' | 'motivating' | 'technical' | 'friendly';
  headline: string;
  description: string;
  illustration?: string;
  ctas: EmptyStateCTA[];
}

export interface EmptyStateCTA {
  label: string;
  action: string;
  primary: boolean;
}

export interface ReferralConfig {
  userId: string;
  referralCode: string;
  referralsCount: number;
  rewardTier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
  rewards: ReferralReward[];
  antifraud: {
    maxReferralsPerDay: number;
    requireVerifiedEmail: boolean;
    minimumAccountAge: number; // days
    blockedDomains: string[];
  };
}

export interface ReferralReward {
  tier: ReferralConfig['rewardTier'];
  requiredReferrals: number;
  description: string;
  claimed: boolean;
}

export type ReEngagementDay = 3 | 7 | 14 | 30;

export interface ReEngagementSchedule {
  userId: string;
  scheduledDays: ReEngagementDay[];
  sentNotifications: { day: ReEngagementDay; sentAt: Date }[];
  unsubscribed: boolean;
  oneClickUnsubscribeToken: string;
}

export interface HabitLoopConfig {
  dailyBrief: {
    enabled: boolean;
    preferredTime: string; // HH:mm
    content: 'summary' | 'tasks' | 'mixed';
  };
  weeklyReview: {
    enabled: boolean;
    preferredDay: 'monday' | 'friday' | 'sunday';
    includeStreaks: boolean;
    includeGoals: boolean;
  };
}
