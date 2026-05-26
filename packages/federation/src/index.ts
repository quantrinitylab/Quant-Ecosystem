// ============================================================================
// @quant/federation - Federation Package (ActivityPub + Matrix)
// ============================================================================

// ActivityPub
export { Actor, ActorSchema } from './activitypub/actor.js';
export { signRequest, verifySignature } from './activitypub/http-signatures.js';
export { WebFingerHandler, WebFingerResponseSchema } from './activitypub/webfinger.js';
export { NodeInfoHandler, NodeInfoSchema } from './activitypub/nodeinfo.js';
export { InboxProcessor, ActivitySchema } from './activitypub/inbox.js';
export type { InboxSignatureVerifier } from './activitypub/inbox.js';
export { OutboxPublisher } from './activitypub/outbox.js';
export { DeliveryQueue, DeliveryJobSchema } from './activitypub/delivery-queue.js';
export { FederationServer } from './activitypub/server.js';

// Matrix
export { MatrixBridgeBot } from './matrix/bridge-bot.js';
export type { BridgeResult } from './matrix/bridge-bot.js';
export { RoomMapper, MappingSchema } from './matrix/room-mapper.js';

// Moderation
export { FederationModeration, BlocklistSchema, AllowlistSchema } from './moderation.js';
