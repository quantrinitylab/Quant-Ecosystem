// ============================================================================
// Resource Contracts - Typed permission contracts for all resource types
// ============================================================================
// Each contract defines which platform roles can perform which actions on a resource type.

import type { ResourcePermissionContract, PlatformRole, ResourceType } from '../types.js';

/** All platform roles for convenience */
const ALL_ROLES: PlatformRole[] = ['USER', 'ADMIN', 'MODERATOR', 'CREATOR', 'ADVERTISER', 'AGENT'];

/** Standard user-facing roles (excludes AGENT) */
const HUMAN_ROLES: PlatformRole[] = ['USER', 'ADMIN', 'MODERATOR', 'CREATOR', 'ADVERTISER'];

/** Roles that create content */
const CONTENT_CREATORS: PlatformRole[] = ['USER', 'ADMIN', 'CREATOR'];

function createContract(
  resourceType: ResourceType,
  allowedActions: ResourcePermissionContract['allowedActions'],
): ResourcePermissionContract {
  return { resourceType, allowedActions };
}

export const EMAIL_CONTRACT: ResourcePermissionContract = createContract('email', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const MESSAGE_CONTRACT: ResourcePermissionContract = createContract('message', {
  read: ALL_ROLES,
  write: HUMAN_ROLES,
  delete: ['USER', 'ADMIN', 'MODERATOR'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const POST_CONTRACT: ResourcePermissionContract = createContract('post', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN', 'MODERATOR'],
  share: ALL_ROLES,
  monetize: ['CREATOR', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const VIDEO_CONTRACT: ResourcePermissionContract = createContract('video', {
  read: ALL_ROLES,
  write: ['CREATOR', 'ADMIN'],
  delete: ['CREATOR', 'ADMIN', 'MODERATOR'],
  share: ALL_ROLES,
  monetize: ['CREATOR', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const FILE_CONTRACT: ResourcePermissionContract = createContract('file', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const DOC_CONTRACT: ResourcePermissionContract = createContract('doc', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: ['CREATOR', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const MEETING_CONTRACT: ResourcePermissionContract = createContract('meeting', {
  read: HUMAN_ROLES,
  write: ['USER', 'ADMIN', 'CREATOR'],
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const CAMPAIGN_CONTRACT: ResourcePermissionContract = createContract('campaign', {
  read: ['ADVERTISER', 'ADMIN', 'MODERATOR'],
  write: ['ADVERTISER', 'ADMIN'],
  delete: ['ADVERTISER', 'ADMIN'],
  share: ['ADVERTISER', 'ADMIN'],
  monetize: ['ADVERTISER', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const PAYMENT_CONTRACT: ResourcePermissionContract = createContract('payment', {
  read: ['USER', 'ADMIN'],
  write: ['ADMIN'],
  delete: ['ADMIN'],
  share: [],
  monetize: [],
  'agent-act': ['ADMIN'],
});

export const USER_PROFILE_CONTRACT: ResourcePermissionContract = createContract('user-profile', {
  read: ALL_ROLES,
  write: ['USER', 'ADMIN'],
  delete: ['ADMIN'],
  share: ['USER', 'ADMIN'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const SUBSCRIPTION_CONTRACT: ResourcePermissionContract = createContract('subscription', {
  read: ['USER', 'ADMIN'],
  write: ['USER', 'ADMIN'],
  delete: ['ADMIN'],
  share: [],
  monetize: ['ADMIN'],
  'agent-act': ['ADMIN'],
});

export const WALLET_CONTRACT: ResourcePermissionContract = createContract('wallet', {
  read: ['USER', 'ADMIN'],
  write: ['USER', 'ADMIN'],
  delete: ['ADMIN'],
  share: [],
  monetize: [],
  'agent-act': ['ADMIN'],
});

export const AD_CONTRACT: ResourcePermissionContract = createContract('ad', {
  read: ALL_ROLES,
  write: ['ADVERTISER', 'ADMIN'],
  delete: ['ADVERTISER', 'ADMIN', 'MODERATOR'],
  share: ['ADVERTISER', 'ADMIN'],
  monetize: ['ADVERTISER', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const CALENDAR_EVENT_CONTRACT: ResourcePermissionContract = createContract(
  'calendar-event',
  {
    read: HUMAN_ROLES,
    write: ['USER', 'ADMIN', 'CREATOR'],
    delete: ['USER', 'ADMIN'],
    share: ['USER', 'ADMIN', 'CREATOR'],
    monetize: [],
    'agent-act': ['AGENT', 'ADMIN'],
  },
);

export const CODE_ARTIFACT_CONTRACT: ResourcePermissionContract = createContract('code-artifact', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: ['CREATOR', 'ADMIN'],
  'agent-act': ['AGENT', 'ADMIN'],
});

export const TASK_CONTRACT: ResourcePermissionContract = createContract('task', {
  read: ALL_ROLES,
  write: CONTENT_CREATORS,
  delete: ['USER', 'ADMIN'],
  share: ['USER', 'ADMIN', 'CREATOR'],
  monetize: [],
  'agent-act': ['AGENT', 'ADMIN'],
});

/** All resource contracts in a single collection */
export const ALL_RESOURCE_CONTRACTS: ResourcePermissionContract[] = [
  EMAIL_CONTRACT,
  MESSAGE_CONTRACT,
  POST_CONTRACT,
  VIDEO_CONTRACT,
  FILE_CONTRACT,
  DOC_CONTRACT,
  MEETING_CONTRACT,
  CAMPAIGN_CONTRACT,
  PAYMENT_CONTRACT,
  USER_PROFILE_CONTRACT,
  SUBSCRIPTION_CONTRACT,
  WALLET_CONTRACT,
  AD_CONTRACT,
  CALENDAR_EVENT_CONTRACT,
  CODE_ARTIFACT_CONTRACT,
  TASK_CONTRACT,
];

/** Get contract by resource type */
export function getResourceContract(
  resourceType: ResourceType,
): ResourcePermissionContract | undefined {
  return ALL_RESOURCE_CONTRACTS.find((c) => c.resourceType === resourceType);
}
