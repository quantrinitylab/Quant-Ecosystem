// prettier-ignore
export interface RateLimit { requestsPerMinute: number; requestsPerDay: number }
export type DeveloperTier = 'free' | 'pro' | 'enterprise';
// prettier-ignore
export interface APIKey { id: string; name: string; createdAt: number; revokedAt: number | null; usageCount: number; rateLimit: RateLimit }
// prettier-ignore
export interface AgentListing { id: string; name: string; rating: number; downloads: number; revenueSharePct: number }
// prettier-ignore
export interface MarketplaceListing { agentId: string; status: 'pending' | 'approved' | 'rejected'; reviewedAt: number | null }
// prettier-ignore
export interface WebhookConfig { id: string; url: string; events: string[]; secret: string; retryCount: number; lastDelivery: number | null }
