// ============================================================================
// @quant/identity-permissions - Types
// ============================================================================

/** Workspace role levels */
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';

/** Resource-level permissions */
export type ResourcePermission = 'create' | 'read' | 'update' | 'delete' | 'share' | 'admin';

/** All resource types tracked in the ecosystem */
export type ResourceType =
  | 'message'
  | 'email'
  | 'doc'
  | 'file'
  | 'meeting'
  | 'post'
  | 'video'
  | 'campaign'
  | 'task'
  | 'payment'
  | 'code-artifact'
  | 'user-profile'
  | 'subscription'
  | 'wallet'
  | 'ad'
  | 'calendar-event';

// ============================================================================
// Platform-wide ABAC + RBAC Types
// ============================================================================

/** Platform-level roles (distinct from workspace roles) */
export type PlatformRole = 'USER' | 'ADMIN' | 'MODERATOR' | 'CREATOR' | 'ADVERTISER' | 'AGENT';

/** Permission actions for the unified permission model */
export type PermissionAction = 'read' | 'write' | 'delete' | 'share' | 'monetize' | 'agent-act';

/** Attribute-Based Access Control context for permission evaluation */
export interface ABACContext {
  /** Current time as ISO string or timestamp */
  time?: string | number;
  /** User location (country code or region) */
  location?: string;
  /** Device type or identifier */
  device?: string;
  /** User trust score (0-100) */
  trustScore?: number;
  /** IP address of the request */
  ipAddress?: string;
}

/** Permission policy rule combining RBAC and ABAC */
export interface PermissionPolicy {
  /** Roles this policy applies to */
  roles: PlatformRole[];
  /** Actions allowed by this policy */
  actions: PermissionAction[];
  /** Resource types this policy covers */
  resourceTypes: ResourceType[];
  /** Optional ABAC conditions that must be satisfied */
  conditions?: ABACCondition[];
}

/** ABAC condition for fine-grained access control */
export interface ABACCondition {
  /** The attribute to evaluate */
  attribute: keyof ABACContext;
  /** Comparison operator */
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'notIn';
  /** Value to compare against */
  value: unknown;
}

/** Typed permission contract for a resource type */
export interface ResourcePermissionContract {
  /** The resource type this contract covers */
  resourceType: ResourceType;
  /** Mapping of actions to the roles allowed to perform them */
  allowedActions: Record<PermissionAction, PlatformRole[]>;
}

/** User identity for permission checks */
export interface PermissionSubject {
  /** User identifier */
  userId: string;
  /** Platform roles assigned to the user */
  roles: PlatformRole[];
}

/** Consent ledger entry for tracking consent grants and withdrawals */
export interface ConsentLedgerEntry {
  /** Unique identifier for this consent entry */
  id: string;
  /** User who granted or received the consent */
  userId: string;
  /** The scope/permission being consented to */
  scope: string;
  /** The application/agent that requested consent */
  source: string;
  /** Timestamp when consent was granted */
  grantedAt: number;
  /** Optional expiry timestamp */
  expiry?: number;
  /** Timestamp when consent was withdrawn (undefined if still active) */
  withdrawnAt?: number;
}

/** Workspace role membership for a user */
export interface RoleMembership {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
  grantedAt: number;
}

/** Resource entry tracked by the registry */
export interface ResourceEntry {
  id: string;
  type: ResourceType;
  ownerId: string;
  workspaceId: string;
  title: string;
  metadata: Record<string, unknown>;
  aiAccessEnabled: boolean;
  createdAt: number;
}

/** Agent access grant for resource types */
export interface AgentAccessGrant {
  id: string;
  agentId: string;
  userId: string;
  workspaceId: string;
  resourceTypes: ResourceType[];
  permissions: ResourcePermission[];
  expiresAt?: number;
  createdAt: number;
}

/** Typed edge relationships for the context graph */
export type ContextEdgeType = 'mentioned-in' | 'attended' | 'edited' | 'shared-with' | 'related-to';

/** Node in the context graph */
export interface ContextNode {
  id: string;
  type: ResourceType;
  ownerId: string;
  workspaceId: string;
  metadata: Record<string, unknown>;
  relationships: ContextEdge[];
}

/** Edge connecting two context nodes */
export interface ContextEdge {
  targetId: string;
  relationship: ContextEdgeType;
}

/** Memory entry for a user */
export interface MemoryEntry {
  id: string;
  userId: string;
  appSource: string;
  content: string;
  paused: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Consent prompt from an agent to a user */
export interface ConsentPrompt {
  id: string;
  userId: string;
  agentId: string;
  resourceType: ResourceType;
  reason: string;
  createdAt: number;
}

/** User response to a consent prompt */
export interface ConsentResponse {
  promptId: string;
  userId: string;
  granted: boolean;
  respondedAt: number;
}

/** Audit event for workspace activity tracking */
export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  actorType: 'user' | 'agent';
  action: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  timestamp: number;
}
