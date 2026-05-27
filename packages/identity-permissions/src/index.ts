// ============================================================================
// @quant/identity-permissions - Identity, Permissions, Workspaces, Context Graph
// ============================================================================

export * from './types.js';
export { RBACEngine } from './core/rbac.js';
export { PermissionEngine } from './core/permission-engine.js';
export {
  ALL_RESOURCE_CONTRACTS,
  getResourceContract,
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
} from './core/resource-contracts.js';
export { ResourceRegistry } from './core/resource-registry.js';
export { ContextGraph } from './core/context-graph.js';
export { MemoryManager } from './core/memory-manager.js';
export { ConsentManager } from './core/consent-manager.js';
export { WorkspaceAuditLog } from './core/workspace-audit.js';
