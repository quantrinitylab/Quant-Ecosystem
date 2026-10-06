// ============================================================================
// @quant/federation - Federation Package (ActivityPub + Matrix + CalDAV + Mail + Developer Platform)
// ============================================================================

// ActivityPub
export { Actor, ActorSchema } from './activitypub/actor.js';
export { verifySignature } from './activitypub/http-signatures.js';
export { WebFingerHandler, WebFingerResponseSchema } from './activitypub/webfinger.js';
export { NodeInfoHandler, NodeInfoSchema } from './activitypub/nodeinfo.js';
export { InboxProcessor, ActivitySchema } from './activitypub/inbox.js';
export type { InboxSignatureVerifier } from './activitypub/inbox.js';
export { OutboxPublisher } from './activitypub/outbox.js';
export { DeliveryQueue, DeliveryJobSchema } from './activitypub/delivery-queue.js';
export { FederationServer } from './activitypub/server.js';
export type { RequestMetadata, RouteResponse } from './activitypub/server.js';

// Matrix
export { MatrixBridgeBot } from './matrix/bridge-bot.js';
export type { BridgeResult, MatrixBridgeConfig } from './matrix/bridge-bot.js';
export { RoomMapper, InMemoryRoomMappingStore, MappingSchema } from './matrix/room-mapper.js';
export type { RoomMappingStore } from './matrix/room-mapper.js';

// Moderation
export { FederationModeration, BlocklistSchema, AllowlistSchema } from './moderation.js';

// CalDAV / CardDAV
export { CalDAVServer, CalendarCollectionSchema } from './caldav/caldav-server.js';
export type { CalDAVRequest, CalDAVResponse, CalendarCollection } from './caldav/caldav-server.js';
export { CardDAVServer, AddressBookSchema } from './caldav/carddav-server.js';
export type { CardDAVRequest, CardDAVResponse, AddressBook } from './caldav/carddav-server.js';
export { VCalSerializer, CalendarEventSchema } from './caldav/vcal-serializer.js';
export type { CalendarEvent } from './caldav/vcal-serializer.js';
export { VCardSerializer, VCardSchema } from './caldav/vcard-serializer.js';
export type { VCard } from './caldav/vcard-serializer.js';

// Mail Protocols
export { IMAPAdapter, MailboxSchema, MessageSchema } from './mail-protocols/imap-adapter.js';
export type {
  Mailbox,
  Message,
  IMAPResponse,
  SearchCriteria,
  AuthenticationDelegate,
} from './mail-protocols/imap-adapter.js';
export { POP3Adapter, POP3MessageSchema } from './mail-protocols/pop3-adapter.js';
export type { POP3Message, POP3Response } from './mail-protocols/pop3-adapter.js';
export { SMTPRelay, SMTPMessageSchema, DKIMConfigSchema } from './mail-protocols/smtp-relay.js';
export type { SMTPMessage, DKIMConfig, RelayResult } from './mail-protocols/smtp-relay.js';

// Developer Platform
export {
  OAuth2Provider,
  OAuth2ClientSchema,
  TokenResponseSchema,
  IntrospectionResponseSchema,
} from './developer-platform/oauth2-provider.js';
export type {
  OAuth2Client,
  TokenResponse,
  IntrospectionResponse,
  AuthorizeRequest,
  TokenRequest,
  OAuth2Error,
} from './developer-platform/oauth2-provider.js';
export { APIKeyManager, APIKeySchema } from './developer-platform/api-key-manager.js';
export type {
  APIKey,
  CreateKeyOptions,
  ValidateResult,
} from './developer-platform/api-key-manager.js';
export {
  WebhookManager,
  WebhookEndpointSchema,
  WebhookDeliverySchema,
} from './developer-platform/webhook-manager.js';
export type {
  WebhookEndpoint,
  WebhookDelivery,
  RegisterOptions,
  DeliverOptions,
} from './developer-platform/webhook-manager.js';
export {
  RateLimitConfig,
  RateLimitRuleSchema,
  RateLimitConfigSchema,
} from './developer-platform/rate-limit-config.js';
export type {
  RateLimitRule,
  RateLimitConfigType,
  RateLimitResult,
} from './developer-platform/rate-limit-config.js';
export {
  AppRegistrationSchema,
  APIEndpointSchema,
  APIDocSchema,
  DeveloperProfileSchema,
} from './developer-platform/developer-portal-types.js';
export type {
  AppRegistration,
  APIEndpoint,
  APIDoc,
  DeveloperProfile,
} from './developer-platform/developer-portal-types.js';

// AT Protocol
export { ATProtocolAdapter, ATPostSchema, ATTimelineItemSchema } from './at-protocol/at-adapter.js';
export type { ATPost, ATTimelineItem, ATFeedResponse } from './at-protocol/at-adapter.js';
export { ATIdentityService, ATProfileSchema } from './at-protocol/at-identity.js';
export type { ATProfile, DIDDocument } from './at-protocol/at-identity.js';
export { ATFeedGenerator, FeedAlgorithmSchema } from './at-protocol/at-feed-generator.js';
export type {
  FeedAlgorithm,
  FeedItem,
  FeedResult,
  FeedGeneratorFn,
} from './at-protocol/at-feed-generator.js';

// ActivityPub (extended)
export { FollowManager, FollowRecordSchema } from './activitypub/follow-manager.js';
export type { FollowRecord } from './activitypub/follow-manager.js';
export { BoostService, BoostRecordSchema } from './activitypub/boost-service.js';
export type { BoostRecord } from './activitypub/boost-service.js';

// Sync Services
export {
  CalDAVSyncService,
  CalendarEventSyncSchema,
  SyncCredentialsSchema,
} from './sync/caldav-sync.js';
export type {
  CalendarEventSync,
  SyncCredentials,
  SyncResult,
  ConflictResolution,
} from './sync/caldav-sync.js';
export { CardDAVSyncService, ContactSyncSchema } from './sync/carddav-sync.js';
export type {
  ContactSync,
  CardDAVSyncCredentials,
  CardDAVSyncResult,
  MergeResult,
} from './sync/carddav-sync.js';

// Mail Protocol Bridges
export {
  IMAPBridge,
  IMAPConfigSchema,
  BridgeMailboxSchema,
  BridgeMessageSchema,
} from './mail-protocols/imap-bridge.js';
export type {
  IMAPConfig,
  BridgeMailbox,
  BridgeMessage,
  MessageRange,
  IMAPSearchCriteria,
  IdleCallback,
} from './mail-protocols/imap-bridge.js';
export {
  SMTPBridge,
  SMTPConfigSchema,
  SMTPOutboundMessageSchema,
} from './mail-protocols/smtp-bridge.js';
export type {
  SMTPConfig,
  SMTPOutboundMessage,
  SendResult,
  RelayStatus,
} from './mail-protocols/smtp-bridge.js';

// Public API / Self-Host
export { PublicAPIConfig, APIEndpointConfigSchema } from './public-api/api-config.js';
export type { APIEndpointConfig, OpenAPISpec, APIStatus } from './public-api/api-config.js';
export {
  SelfHostConfig,
  SelfHostConfigSchema,
  DatabaseConfigSchema,
  StorageConfigSchema,
  FederationConfigSchema,
} from './public-api/self-host-config.js';
export type {
  SelfHostConfigType,
  DatabaseConfig,
  StorageConfig,
  FederationConfig,
  ValidationResult,
} from './public-api/self-host-config.js';
