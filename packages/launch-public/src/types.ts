// prettier-ignore
export type AppStore = 'ios' | 'android';
// prettier-ignore
export type SubmissionStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected';
// prettier-ignore
export interface LaunchGate { name: string; required: boolean; passed: boolean; dependsOn?: string[] }
// prettier-ignore
export interface LaunchChecklist { gates: LaunchGate[]; allHardGatesPassed: boolean; readyToLaunch: boolean }
// prettier-ignore
export interface StatusIncident { id: string; title: string; severity: number; status: 'investigating' | 'identified' | 'monitoring' | 'resolved'; createdAt: number; resolvedAt?: number }
// prettier-ignore
export interface SupportTicket { id: string; userId: string; question: string; answer?: string; confidence: number; escalated: boolean; status: 'open' | 'resolved' | 'escalated' }
// prettier-ignore
export interface PressCoverage { outlet: string; title: string; url: string; sentiment: number; publishedAt: number; reach: number }

// prettier-ignore
export type StoreSubmissionStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected' | 'live';
// prettier-ignore
export interface StoreSubmission { id: string; store: AppStore; status: StoreSubmissionStatus; submittedAt: number | null; rejectionReason?: string; reviewTimeMs?: number }
// prettier-ignore
export interface MarketingSite { id: string; name: string; variant: string; visits: number; conversions: number }
// prettier-ignore
export interface PressKit { id: string; appName: string; description: string; logoUrls: string[]; screenshotUrls: string[]; stats: Record<string, number>; createdAt: number }
// prettier-ignore
export interface PressRelease { id: string; title: string; embargoUntil: number | null; publishedAt: number | null; scheduled: boolean }
// prettier-ignore
export interface LaunchMetricsData { downloads: number[]; retention: number[]; revenue: number[]; crashFreeRate: number; storeRanking: number | null; acquisitionCost: number }
