// ============================================================================
// Quant Ecosystem - Constants
// ============================================================================

import type { QuantApp, RateLimitConfig } from './types';

/** All apps in the Quant Ecosystem */
export const QUANT_APPS: Record<QuantApp, { name: string; description: string; color: string }> = {
  quantchat: {
    name: 'QuantChat',
    description: 'Instant messaging with disappearing messages, stories, and video calls',
    color: '#FFD700',
  },
  quantmail: {
    name: 'QuantMail',
    description: 'Email platform and central OAuth provider for the ecosystem',
    color: '#4285F4',
  },
  quantsync: {
    name: 'QuantSync',
    description: 'Social feed with posts, threads, and communities',
    color: '#1DA1F2',
  },
  quantads: {
    name: 'QuantAds',
    description: 'Advertising platform for the ecosystem',
    color: '#34A853',
  },
  quantube: {
    name: 'QuantTube',
    description: 'Video and music streaming platform',
    color: '#FF0000',
  },
  quantneon: {
    name: 'QuantNeon',
    description: 'Photo and video sharing with filters and stories',
    color: '#E1306C',
  },
  quantedits: {
    name: 'QuantEdits',
    description: 'Professional video and photo editing suite',
    color: '#9B59B6',
  },
  quantmax: {
    name: 'QuantMax',
    description: 'Short-form video, live video chat, and dating',
    color: '#FF6B6B',
  },
  quantai: {
    name: 'QuantAI',
    description: 'Central AI hub for the ecosystem with device control',
    color: '#00D4AA',
  },
};

/** API Base URLs */
export const API_ENDPOINTS = {
  auth: '/api/v1/auth',
  users: '/api/v1/users',
  messages: '/api/v1/messages',
  emails: '/api/v1/emails',
  posts: '/api/v1/posts',
  ads: '/api/v1/ads',
  media: '/api/v1/media',
  ai: '/api/v1/ai',
  realtime: '/api/v1/realtime',
  notifications: '/api/v1/notifications',
  search: '/api/v1/search',
  analytics: '/api/v1/analytics',
} as const;

/** WebSocket Event Types */
export const WS_EVENTS = {
  // Connection
  CONNECT: 'ws:connect',
  DISCONNECT: 'ws:disconnect',
  RECONNECT: 'ws:reconnect',
  ERROR: 'ws:error',

  // Presence
  PRESENCE_UPDATE: 'presence:update',
  PRESENCE_SUBSCRIBE: 'presence:subscribe',
  PRESENCE_UNSUBSCRIBE: 'presence:unsubscribe',

  // Messaging (QuantChat)
  MESSAGE_NEW: 'message:new',
  MESSAGE_READ: 'message:read',
  MESSAGE_DELIVERED: 'message:delivered',
  MESSAGE_TYPING: 'message:typing',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_EDITED: 'message:edited',

  // Email (QuantMail)
  EMAIL_NEW: 'email:new',
  EMAIL_READ: 'email:read',

  // Social (QuantSync)
  POST_NEW: 'post:new',
  POST_LIKE: 'post:like',
  POST_COMMENT: 'post:comment',
  POST_SHARE: 'post:share',

  // Streaming (QuantTube)
  STREAM_START: 'stream:start',
  STREAM_END: 'stream:end',
  STREAM_VIEWER_JOIN: 'stream:viewer_join',
  STREAM_VIEWER_LEAVE: 'stream:viewer_leave',
  STREAM_CHAT: 'stream:chat',

  // Media (QuantNeon)
  STORY_NEW: 'story:new',
  STORY_VIEW: 'story:view',
  STORY_REACTION: 'story:reaction',

  // Video Chat (QuantMax)
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECTED: 'call:rejected',
  CALL_ENDED: 'call:ended',
  CALL_ICE_CANDIDATE: 'call:ice_candidate',
  CALL_SDP_OFFER: 'call:sdp_offer',
  CALL_SDP_ANSWER: 'call:sdp_answer',

  // AI (QuantAI)
  AI_RESPONSE_CHUNK: 'ai:response_chunk',
  AI_RESPONSE_COMPLETE: 'ai:response_complete',
  AI_DEVICE_COMMAND: 'ai:device_command',

  // Notifications
  NOTIFICATION_NEW: 'notification:new',
  NOTIFICATION_READ: 'notification:read',

  // Ads
  AD_IMPRESSION: 'ad:impression',
  AD_CLICK: 'ad:click',
} as const;

/** HTTP Status Codes */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

/** Error Codes */
export const ERROR_CODES = {
  // Auth errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_REFRESH_TOKEN_EXPIRED: 'AUTH_REFRESH_TOKEN_EXPIRED',
  AUTH_ACCOUNT_SUSPENDED: 'AUTH_ACCOUNT_SUSPENDED',
  AUTH_EMAIL_NOT_VERIFIED: 'AUTH_EMAIL_NOT_VERIFIED',
  AUTH_2FA_REQUIRED: 'AUTH_2FA_REQUIRED',
  AUTH_2FA_INVALID: 'AUTH_2FA_INVALID',
  AUTH_OAUTH_DENIED: 'AUTH_OAUTH_DENIED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',

  // Resource errors
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_DELETED: 'RESOURCE_DELETED',

  // Rate limit
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

/** Default Rate Limit Configurations */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  default: { windowMs: 60000, maxRequests: 100, keyPrefix: 'rl:default' },
  auth: { windowMs: 900000, maxRequests: 10, keyPrefix: 'rl:auth' },
  ai: { windowMs: 60000, maxRequests: 20, keyPrefix: 'rl:ai' },
  upload: { windowMs: 3600000, maxRequests: 50, keyPrefix: 'rl:upload' },
  search: { windowMs: 60000, maxRequests: 30, keyPrefix: 'rl:search' },
  realtime: { windowMs: 1000, maxRequests: 50, keyPrefix: 'rl:realtime' },
};

/** Token expiration times (in seconds) */
export const TOKEN_EXPIRY = {
  ACCESS_TOKEN: 3600, // 1 hour
  REFRESH_TOKEN: 2592000, // 30 days
  EMAIL_VERIFICATION: 86400, // 24 hours
  PASSWORD_RESET: 3600, // 1 hour
  OAUTH_CODE: 600, // 10 minutes
  SESSION: 604800, // 7 days
} as const;

/** File upload limits (in bytes) */
export const UPLOAD_LIMITS = {
  AVATAR: 5 * 1024 * 1024, // 5MB
  IMAGE: 20 * 1024 * 1024, // 20MB
  VIDEO: 500 * 1024 * 1024, // 500MB
  AUDIO: 100 * 1024 * 1024, // 100MB
  DOCUMENT: 50 * 1024 * 1024, // 50MB
  EMAIL_ATTACHMENT: 25 * 1024 * 1024, // 25MB
} as const;

/** Supported file types */
export const SUPPORTED_FILE_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  videos: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac'],
  documents: ['application/pdf', 'text/plain', 'application/msword'],
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1,
} as const;

/** AI Model identifiers */
export const AI_MODELS = {
  GPT4: 'gpt-4-turbo',
  GPT35: 'gpt-3.5-turbo',
  CLAUDE: 'claude-3-opus',
  LLAMA: 'llama-3-70b',
  STABLE_DIFFUSION: 'stable-diffusion-xl',
  WHISPER: 'whisper-large-v3',
} as const;

/** Cache TTL values (in seconds) */
export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
  USER_PROFILE: 600, // 10 minutes
  SESSION: 3600, // 1 hour
  FEED: 120, // 2 minutes
  SEARCH: 300, // 5 minutes
} as const;
