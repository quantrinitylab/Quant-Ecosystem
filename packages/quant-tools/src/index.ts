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

// Permissions
export { PermissionEngine } from './permissions/permission-engine.js';

// Undo
export { UndoRegistry } from './undo/undo-registry.js';

// Audit
export { AuditLog } from './audit/audit-log.js';

// MCP
export { MCPServerAdapter } from './mcp/mcp-server.js';

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
