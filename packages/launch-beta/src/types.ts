// prettier-ignore
export interface BetaUser { id: string; email: string; cohort: string; activatedAt: number; isActive: boolean }
// prettier-ignore
export interface BetaCohort { name: string; capacity: number; members: string[]; activationRate: number }
// prettier-ignore
export interface RetentionMetrics { d1: number; d7: number; d30: number; cohort: string }
// prettier-ignore
export interface NPSSurvey { id: string; userId: string; score: number; comment: string; timestamp: number }
// prettier-ignore
export interface NPSScore { score: number; promoters: number; passives: number; detractors: number; responseCount: number }
// prettier-ignore
export interface BugReport { id: string; userId: string; priority: number; description: string; screenshot?: string; logs?: string; deviceInfo: string; reproSteps: string; createdAt: number }
// prettier-ignore
export interface FeatureFlag { id: string; name: string; enabled: boolean; cohorts: string[]; userIds: string[]; rolloutPercent: number; killSwitch: boolean }
// prettier-ignore
export interface BetaInvite { id: string; email: string; cohort: string; sentAt: number; acceptedAt?: number; expiresAt: number; status: 'sent' | 'opened' | 'accepted' | 'expired'; referredBy?: string }

export type BetaPhase = 'invite-only' | 'limited' | 'open';
// prettier-ignore
export interface InviteTemplate { id: string; name: string; subject: string; body: string }
export type FeedbackCategory = 'ux' | 'performance' | 'features' | 'bugs';
// prettier-ignore
export interface FeedbackEntry { id: string; userId: string; category: FeedbackCategory; text: string; sentiment: number; votes: number; acknowledged: boolean; createdAt: number }
// prettier-ignore
export interface RolloutRule { featureId: string; percentage: number; stage: number; errorThreshold: number }
// prettier-ignore
export interface RolloutState { featureId: string; currentPercentage: number; currentStage: number; stages: number[]; errorCount: number; requestCount: number; rolledBack: boolean }
