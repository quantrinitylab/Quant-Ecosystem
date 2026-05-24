// ============================================================================
// Quant Ecosystem - Shared Types
// ============================================================================

/** Base entity with common fields */
export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

/** User roles across the ecosystem */
export type UserRole = 'user' | 'admin' | 'moderator' | 'creator' | 'advertiser';

/** Account status */
export type AccountStatus = 'active' | 'suspended' | 'deactivated' | 'pending_verification';

/** User profile shared across all Quant apps */
export interface User extends BaseEntity {
  email: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  phoneNumber?: string;
  role: UserRole;
  status: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt?: Date;
  metadata: Record<string, unknown>;
}

/** Session information */
export interface Session extends BaseEntity {
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  isActive: boolean;
}

/** Device information for sessions */
export interface DeviceInfo {
  userAgent: string;
  platform: 'web' | 'ios' | 'android' | 'desktop';
  deviceId: string;
  deviceName?: string;
  osVersion?: string;
  appVersion?: string;
}

/** Standard API response wrapper */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  metadata?: ResponseMetadata;
}

/** API error structure */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  statusCode: number;
}

/** Response metadata */
export interface ResponseMetadata {
  requestId: string;
  timestamp: number;
  duration: number;
  version: string;
}

/** Paginated result wrapper */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** Pagination request parameters */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/** Search parameters */
export interface SearchParams extends PaginationParams {
  query: string;
  filters?: Record<string, string | number | boolean>;
}

/** File/media attachment */
export interface MediaAttachment extends BaseEntity {
  url: string;
  thumbnailUrl?: string;
  type: MediaType;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  filename: string;
  uploadedBy: string;
}

/** Supported media types */
export type MediaType = 'image' | 'video' | 'audio' | 'document' | 'gif' | 'sticker';

/** Notification structure */
export interface Notification extends BaseEntity {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read: boolean;
  readAt?: Date;
  actionUrl?: string;
  sourceApp: QuantApp;
}

/** Notification types across ecosystem */
export type NotificationType =
  | 'message'
  | 'email'
  | 'mention'
  | 'like'
  | 'comment'
  | 'follow'
  | 'share'
  | 'ad_engagement'
  | 'video_upload'
  | 'live_stream'
  | 'match'
  | 'ai_response'
  | 'system';

/** All Quant apps in the ecosystem */
export type QuantApp =
  | 'quantchat'
  | 'quantmail'
  | 'quantsync'
  | 'quantads'
  | 'quantube'
  | 'quantneon'
  | 'quantedits'
  | 'quantmax'
  | 'quantai';

/** OAuth2 token response */
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string[];
  idToken?: string;
}

/** OAuth2 authorization request */
export interface OAuthAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: 'code' | 'token';
  scope: string[];
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'plain' | 'S256';
}

/** WebSocket event structure */
export interface RealtimeEvent<T = unknown> {
  type: string;
  channel: string;
  payload: T;
  timestamp: number;
  senderId?: string;
}

/** Presence status */
export type PresenceStatus = 'online' | 'away' | 'busy' | 'offline' | 'invisible';

/** User presence information */
export interface UserPresence {
  userId: string;
  status: PresenceStatus;
  lastSeen: Date;
  activeApp?: QuantApp;
  customStatus?: string;
}

/** AI request structure */
export interface AIRequest {
  prompt: string;
  context?: string[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
}

/** AI response structure */
export interface AIResponse {
  content: string;
  model: string;
  usage: AIUsage;
  finishReason: 'stop' | 'length' | 'content_filter';
  metadata?: Record<string, unknown>;
}

/** AI token usage tracking */
export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Theme configuration */
export interface ThemeConfig {
  name: string;
  mode: 'light' | 'dark';
  colors: ThemeColors;
  fonts: ThemeFonts;
  spacing: ThemeSpacing;
  borderRadius: ThemeBorderRadius;
}

/** Theme color palette */
export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

/** Theme font configuration */
export interface ThemeFonts {
  heading: string;
  body: string;
  mono: string;
  sizes: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
  };
}

/** Theme spacing scale */
export interface ThemeSpacing {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  '3xl': string;
}

/** Theme border radius */
export interface ThemeBorderRadius {
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;
}

/** Permission scopes for OAuth */
export type PermissionScope =
  | 'profile:read'
  | 'profile:write'
  | 'email:read'
  | 'email:send'
  | 'messages:read'
  | 'messages:write'
  | 'posts:read'
  | 'posts:write'
  | 'media:read'
  | 'media:upload'
  | 'contacts:read'
  | 'contacts:write'
  | 'ai:use'
  | 'realtime:connect'
  | 'ads:manage'
  | 'analytics:read';

/** Rate limit configuration */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

/** Webhook event payload */
export interface WebhookPayload<T = unknown> {
  event: string;
  timestamp: number;
  data: T;
  signature: string;
  source: QuantApp;
}
