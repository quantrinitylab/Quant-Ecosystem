// Types
export type {
  PermissionTier,
  ToolInputSchema,
  ToolOutputSchema,
  UndoRecipe,
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
  ToolPlanStep,
  ToolPlan,
  IntentMatch,
  AuditEntry,
  UndoAction,
  MCPToolEntry,
  ParsedIntent,
  WorkflowExecutionOptions,
  WorkflowResult,
} from './types.js';

// Registry
export { ToolRegistry } from './registry/tool-registry.js';

// Planner
export { IntentRouter } from './planner/intent-router.js';
export { IntentParser } from './planner/intent-parser.js';
export { MultiStepPlanner } from './planner/multi-step-planner.js';

// Executor
export { ToolExecutor, type ToolHandler } from './executor/tool-executor.js';
export { WorkflowExecutor } from './executor/workflow-executor.js';
export type { WorkflowEventType, WorkflowEvent, WorkflowListener } from './executor/workflow-executor.js';

// Real handler implementations (registered on a ToolExecutor by the consumer)
export {
  registerMailReadHandlers,
  resolveCallerJwt,
  resolveBaseUrl,
  MAIL_JWT_METADATA_KEY,
  QUANTMAIL_API_BASE_URL_ENV,
  DEFAULT_QUANTMAIL_API_BASE_URL,
  MAX_PAGE_SIZE,
  type MailReadHandlerOptions,
  type MailSummary,
} from './handlers/mail-read-handlers.js';

// Permissions
export { PermissionEngine } from './permissions/permission-engine.js';

// Undo
export { UndoRegistry } from './undo/undo-registry.js';

// Audit
export { AuditLog } from './audit/audit-log.js';

// MCP — protocol-compliant Streamable HTTP gateway (P1-1) + legacy adapter
export { MCPServerAdapter } from './mcp/mcp-server.js';
export {
  QuantyMcpServer,
  McpRpcError,
  CONFIRMATION_ARG_KEY,
  MCP_PROTOCOL_VERSIONS,
  MCP_LATEST_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type McpAuthContext,
  type ToolCallOutcome,
  type ConfirmationEnvelope,
} from './mcp/mcp-gateway-server.js';
export {
  toMcpInputSchema,
  toRiskTier,
  toToolDescriptor,
  type McpJsonSchema,
  type McpJsonSchemaProperty,
} from './mcp/descriptor-mapping.js';

// Connect-once OAuth + capability token (P1-2)
export {
  SCOPE_CATALOG,
  allScopeNames,
  isKnownScope,
  requiredScopesForTool,
  scopeDomainForAppId,
  scopeInfo,
  type CapabilityScope,
  CAPABILITY_TOKEN_ISSUER,
  CAPABILITY_TOKEN_SECRET_ENV,
  CapabilityTokenError,
  isCapabilityTokenRevoked,
  issueCapabilityToken,
  resolveCapabilitySecret,
  revokeCapabilityToken,
  verifyCapabilityToken,
  type CapabilityClaims,
  type CapabilityTokenErrorCode,
  type IssueCapabilityTokenOptions,
  createConnectOnceHandler,
  type ConnectOnceOptions,
  type ConsentUser,
  JwtCapabilityTokenResolver,
} from './connect-once/index.js';
export type {
  CapabilityTokenResolver,
  ResolvedCapabilities,
} from './mcp/mcp-gateway-server.js';

// Orchestrator
export { CrossAppOrchestrator } from './orchestrator/index.js';
export type {
  OrchestratorEvent,
  OrchestratorEventType,
  OrchestratorListener,
  OrchestratorOptions,
} from './orchestrator/index.js';
export { ContextManager } from './orchestrator/index.js';
export type { AppContext, ResolvedReference } from './orchestrator/index.js';

// Tool definitions
export {
  allTools,
  mailTools,
  chatTools,
  calendarTools,
  docsTools,
  driveTools,
  meetTools,
  neonTools,
  syncTools,
  tubeTools,
  maxTools,
  editsTools,
  adsTools,
  mapsTools,
  photosTools,
  deviceTools,
  studioTools,
  paymentsTools,
} from './tools/index.js';
