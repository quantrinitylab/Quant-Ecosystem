// prettier-ignore
export interface RateLimit { requestsPerMinute: number; requestsPerDay: number }
export type DeveloperTier = 'free' | 'pro' | 'enterprise';
// prettier-ignore
export interface APIKey { id: string; name: string; createdAt: number; revokedAt: number | null; usageCount: number; rateLimit: RateLimit; scopes: string[]; expiresAt: number | null }
// prettier-ignore
export interface AgentListing { id: string; name: string; rating: number; downloads: number; revenueSharePct: number }
// prettier-ignore
export interface MarketplaceListing { agentId: string; status: 'pending' | 'approved' | 'rejected'; reviewedAt: number | null }
// prettier-ignore
export interface WebhookConfig { id: string; url: string; events: string[]; secret: string; retryCount: number; lastDelivery: number | null }

// prettier-ignore
export interface KeyRotation { oldKeyId: string; newKeyId: string; rotatedAt: number; gracePeriodMs: number; graceEndsAt: number }
// prettier-ignore
export interface OAuthClient { id: string; clientId: string; clientSecret: string; name: string; redirectUris: string[]; scopes: string[]; createdAt: number }
// prettier-ignore
export interface OAuthToken { id: string; clientId: string; accessToken: string; refreshToken: string; scopes: string[]; expiresAt: number; revokedAt: number | null }
// prettier-ignore
export interface DeveloperApp { id: string; name: string; description: string; redirectUris: string[]; status: 'active' | 'suspended' | 'under_review'; ownerId: string; createdAt: number }
// prettier-ignore
export interface UsageRecord { keyId: string; endpoint: string; day: string; count: number; errors: number; latencyMs: number[] }
// prettier-ignore
export interface UsageReport { keyId: string; totalRequests: number; totalErrors: number; errorRate: number; avgLatency: number; p95Latency: number }
// prettier-ignore
export interface SDKDownload { id: string; version: string; platform: string; downloadedAt: number }
// prettier-ignore
export interface SDKVersion { version: string; deprecated: boolean; deprecationMessage?: string; platforms: string[]; releasedAt: number }
// prettier-ignore
export interface WebhookDelivery { id: string; webhookId: string; event: string; statusCode: number; deliveredAt: number; retryAttempt: number }
