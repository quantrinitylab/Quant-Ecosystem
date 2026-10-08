export const QUANT_APP_IDS = [
  'quantmail', 'quantchat', 'quantai', 'quantgram', 'quantwave',
  'quantmax', 'quantube', 'quantcooks', 'quantads',
] as const;

export type QuantAppId = (typeof QUANT_APP_IDS)[number];

export type QuantVisibility = 'private' | 'shared' | 'public';

export type QuantActorType = 'user' | 'service' | 'agent';

export type QuantPurpose =
  | 'user_action'
  | 'notification'
  | 'search'
  | 'recommendation'
  | 'agent_execution'
  | 'analytics'
  | 'memory';

export interface QuantActor {
  type: QuantActorType;
  userId?: string;
  serviceId?: string;
  agentRunId?: string;
}

export interface QuantResourceRef {
  appId: QuantAppId;
  resourceType: string;
  resourceId: string;
  resourceVersion?: number;
  visibility: QuantVisibility;
  canonicalUrl: string;
  deepLink: string;
  ownerUserId?: string;
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuantContextEnvelope<TPayload = unknown> {
  eventId: string;
  schemaVersion: number;
  correlationId: string;
  causationId?: string;
  actor: QuantActor;
  sourceApp: QuantAppId;
  targetApp?: QuantAppId;
  resource?: QuantResourceRef;
  occurredAt: string;
  publishedAt?: string;
  tenantId?: string;
  purpose: QuantPurpose;
  payload: TPayload;
  traceId?: string;
}

export type QuantHandoffMode =
  | 'open'
  | 'share'
  | 'attach'
  | 'import'
  | 'command'
  | 'notify';

export type QuantOperationState =
  | 'planned'
  | 'waiting_approval'
  | 'executing'
  | 'verifying'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'unknown'
  | 'cancelled';

export type QuantProvenanceOperation =
  | 'shared'
  | 'attached'
  | 'imported'
  | 'derived';

export interface QuantProvenance {
  source: QuantResourceRef;
  operation: QuantProvenanceOperation;
  sourceVersion?: number;
  importedAt: string;
  actor: 'user' | 'system' | 'agent';
  correlationId: string;
}

export interface EconomyOperationRef {
  operationId: string;
  sourceApp: QuantAppId;
  action: string;
  quoteId?: string;
  reservationId?: string;
}

export type QuantEventEnvelope<TPayload = unknown> =
  QuantContextEnvelope<TPayload> & {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
  };
