// ============================================================================
// Quant Ecosystem - Unified Interconnection Architecture Types
// ============================================================================

/**
 * The 10 Core Applications of the Quant Ecosystem
 */
export type CoreQuantAppId =
  | 'quantmail'
  | 'quantchat'
  | 'quantgram'
  | 'quantai'
  | 'quantube'
  | 'quantwave'
  | 'quantmax'
  | 'quantcooks'
  | 'quantads'
  | 'quanttrinity';

export type AppCategory =
  | 'social_communication'
  | 'creative_intelligence'
  | 'enterprise_productivity';

export interface QuantAppDescriptor {
  id: CoreQuantAppId;
  name: string;
  tagline: string;
  description: string;
  category: AppCategory;
  accentColor: string;
  icon: string; // SVG path or icon name
  defaultPort: number;
  subdomain: string;
  productionUrl: string;
  defaultRoute: string;
  badgeCount?: number;
  status: 'active' | 'beta' | 'preview';
}

/**
 * Universal User Account & SSO Session Representation
 */
export interface QuantUserSession {
  userId: string;
  email: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  tier?: 'free' | 'pro' | 'ultra' | 'enterprise';
  organizationId?: string;
  currentApp?: CoreQuantAppId;
  activeSessions?: {
    appId: CoreQuantAppId;
    lastActiveAt: number;
  }[];
  creditsBalance?: number;
  token?: string;
}

export interface ConsumedSSOTicket {
  ticket: string;
  session?: Partial<QuantUserSession>;
  returnPath: string | null;
}

export interface SSOTokenHandoffPayload {
  handoffTicket: string;
  userId: string;
  targetApp: CoreQuantAppId;
  returnPath: string;
  timestamp: number;
  nonce: string;
  signature: string;
}

export interface SafeReturnValidationResult {
  isSafe: boolean;
  sanitizedUrl: string;
  reason?: string;
}

/**
 * Federated Search & Command Palette Types
 */
export type SearchScope =
  | 'all'
  | 'mail'
  | 'chat'
  | 'gram'
  | 'ai'
  | 'drive'
  | 'calendar'
  | 'actions';

export interface FederatedSearchResult {
  id: string;
  app: CoreQuantAppId;
  scope: SearchScope;
  title: string;
  subtitle: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  actionUrl: string;
  timestamp: number;
  score: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface QuickActionItem {
  id: string;
  app: CoreQuantAppId;
  title: string;
  description: string;
  shortcut?: string;
  icon: string;
  category: string;
  execute: () => Promise<void> | void;
}

/**
 * Cross-App Asset Transfer Pipelines
 */
export type AssetMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'video/mp4'
  | 'video/webm'
  | 'audio/mp3'
  | 'audio/wav'
  | 'audio/ogg'
  | 'application/pdf'
  | 'application/json'
  | 'text/markdown';

export type PipelineType =
  | 'drive_to_ai_canvas'
  | 'ai_to_gram_reel'
  | 'gram_to_chat_dm'
  | 'gram_to_mail_thread'
  | 'chat_voicenote_to_drive_docs';

export interface QuantAsset {
  assetId: string;
  name: string;
  mimeType: AssetMimeType;
  sourceApp: CoreQuantAppId;
  sourceUrl: string;
  sizeBytes: number;
  thumbnailUrl?: string;
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:3';
  metadata: {
    durationSeconds?: number;
    promptUsed?: string;
    modelUsed?: string;
    authorName?: string;
    transcriptionText?: string;
    extractedKeywords?: string[];
    [key: string]: unknown;
  };
  createdAt: number;
}

export interface AssetTransferIntent {
  transferId: string;
  pipeline: PipelineType;
  asset: QuantAsset;
  targetApp: CoreQuantAppId;
  targetContext?: {
    threadId?: string;
    channelId?: string;
    canvasSessionId?: string;
    folderId?: string;
    recipientUserId?: string;
  };
  status: 'pending' | 'transforming' | 'completed' | 'failed';
  resultUrl?: string;
  error?: string;
}

/**
 * Unified Notification Drawer Types
 */
export type NotificationSeverity = 'low' | 'normal' | 'important' | 'critical';

export interface UnifiedNotificationItem {
  id: string;
  app: CoreQuantAppId;
  title: string;
  body: string;
  summary?: string;
  timestamp: number;
  read: boolean;
  severity: NotificationSeverity;
  category: 'message' | 'mention' | 'task_complete' | 'system' | 'social_reaction';
  avatarUrl?: string;
  mediaThumbnailUrl?: string;
  deepLink: string;
  actions?: {
    actionId: string;
    label: string;
    primary?: boolean;
    handlerUrl?: string;
  }[];
}

export interface AppNotificationBadgeCount {
  app: CoreQuantAppId;
  unreadCount: number;
  hasUrgent: boolean;
}
