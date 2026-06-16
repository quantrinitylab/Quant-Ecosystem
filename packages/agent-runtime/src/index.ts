// ============================================================================
// @quant/agent-runtime - Core Agent Runtime Framework
// ============================================================================

// Permissions
export {
  PermissionLevel,
  PermissionLevelSchema,
  canAct,
  canExecuteHighRisk,
  isFullAuto,
  PermissionGuard,
} from './permissions.js';
export type { ActionRequest } from './permissions.js';

// State Machine
export { AgentState, AgentStateMachine } from './state-machine.js';

// Audit Trail
export { AuditTrail, AuditEntrySchema } from './audit-trail.js';
export type { AuditEntry } from './audit-trail.js';

// Undo Engine
export { UndoEngine } from './undo-engine.js';
export type { UndoAction } from './undo-engine.js';

// Trust Score
export {
  TrustScore,
  scoreToPermissionLevel,
  permissionLevelToScore,
  AUTO_PAUSE_THRESHOLD,
  REVIEW_ZONE_THRESHOLD,
} from './trust-score.js';
export type { TrustScoreOptions } from './trust-score.js';

// Spending Limit
export {
  SpendingLimit,
  SpendingLimitConfigSchema,
  SpendingCapBreachedError,
} from './spending-limit.js';
export type {
  SpendingLimitConfig,
  SpendingPeriod,
  CapType,
  SpendingLimitOptions,
} from './spending-limit.js';

// Kill Switch
export { KillSwitch } from './kill-switch.js';

// Approval Queue
export { ApprovalQueue, ApprovalRequestSchema } from './approval-queue.js';
export type { ApprovalRequest, ApprovalStatus, QueuedRequest } from './approval-queue.js';

// Conflict Resolver
export { ConflictResolver } from './conflict-resolver.js';
export type { ResourceLock, ConflictResult } from './conflict-resolver.js';

// Sandbox
export { AgentSandbox } from './sandbox.js';
export type { SandboxAction } from './sandbox.js';

// Task Decomposer
export { TaskDecomposer, SubTaskSchema } from './task-decomposer.js';
export type { SubTask, AIInferenceAdapter } from './task-decomposer.js';

// Worker Agent
export { WorkerAgent } from './worker-agent.js';
export type { AgentStatus, AgentTask } from './worker-agent.js';

// Orchestrator
export { Orchestrator } from './orchestrator.js';
export type { OrchestratorTask, TaskStatus } from './orchestrator.js';

// ============================================================================
// Device Control Layer
// ============================================================================

// Tier 1 - API Controller
export {
  Tier1ApiController,
  ApiDefinitionSchema,
  HttpApiExecutionBackend,
} from './device/tier1-api.js';
export type { ApiDefinition, ApiCallResult, ApiExecutionBackend } from './device/tier1-api.js';

// Tier 2 - OS Controller
export { Tier2OsController, PlatformSchema } from './device/tier2-os.js';
export type { Platform, OsCommandResult, SystemInfo } from './device/tier2-os.js';

// Tier 3 - Vision Controller
export { Tier3VisionController, HttpVisionScreenSource } from './device/tier3-vision.js';
export type {
  VisionAnalysisResult,
  DetectedElement,
  ClickCoords,
  VisionInferenceAdapter,
  VisionScreenSource,
} from './device/tier3-vision.js';

// Screen Capture
export { ScreenCapture, HttpScreenCaptureBackend } from './device/screen-capture.js';
export type {
  ScreenBounds,
  CaptureFrame,
  ScreenDiff,
  ScreenCaptureBackend,
} from './device/screen-capture.js';

// Action Executor
export { ActionExecutor } from './device/action-executor.js';
export type { ActionResult, Coordinates, ScrollDirection } from './device/action-executor.js';

// App Launcher
export { AppLauncher, AppRegistryEntrySchema } from './device/app-launcher.js';
export type { AppRegistryEntry, LaunchResult } from './device/app-launcher.js';

// ============================================================================
// Pre-Built Pilot Agents
// ============================================================================

export { EmailPilot } from './agents/email-pilot.js';
export type { EmailItem, EmailProcessingResult } from './agents/email-pilot.js';

export { CodePilot } from './agents/code-pilot.js';
export type {
  CodeChange,
  CodeReviewResult,
  CodeIssue,
  CodeSuggestion,
} from './agents/code-pilot.js';

export { SchedulePilot } from './agents/schedule-pilot.js';
export type { CalendarEvent, ScheduleResult } from './agents/schedule-pilot.js';

export { ShoppingPilot } from './agents/shopping-pilot.js';
export type { Product, ShoppingResult } from './agents/shopping-pilot.js';

export { FinancePilot } from './agents/finance-pilot.js';
export type { Expense, FinanceInsight } from './agents/finance-pilot.js';

export { SocialPilot } from './agents/social-pilot.js';
export type { SocialPost, SocialResult } from './agents/social-pilot.js';

export { ContentPilot } from './agents/content-pilot.js';
export type { ContentDraft, ContentResult } from './agents/content-pilot.js';

export { TravelPilot } from './agents/travel-pilot.js';
export type { TripPlan, TripActivity, TravelResult } from './agents/travel-pilot.js';

export { ResearchPilot } from './agents/research-pilot.js';
export type { ResearchSource, ResearchResult } from './agents/research-pilot.js';

export { HealthPilot } from './agents/health-pilot.js';
export type { HealthMetric, HealthReminder, HealthResult } from './agents/health-pilot.js';

export { MeetingPilot } from './agents/meeting-pilot.js';
export type { Meeting, MeetingNotes, ActionItem, MeetingResult } from './agents/meeting-pilot.js';

export { LearningPilot } from './agents/learning-pilot.js';
export type { LearningResource, LearningPath, LearningResult } from './agents/learning-pilot.js';

// ============================================================================
// Agent Marketplace
// ============================================================================

export { AgentSpecSchema, AgentCapabilitySchema } from './marketplace/agent-spec.js';
export type { AgentSpec, AgentCapability, PublishedAgentSpec } from './marketplace/agent-spec.js';

export { AgentPublisher } from './marketplace/publisher.js';
export type { PublishResult } from './marketplace/publisher.js';

export { AgentInstaller } from './marketplace/installer.js';
export type {
  InstalledAgent,
  InstallResult,
  SecurityAudit,
  IsolationLevel,
} from './marketplace/installer.js';

// ============================================================================
// Agentic AI Foundation (Phase 7)
// ============================================================================

// Types
export * from './types.js';

// Typed Tool Registry
export { TypedToolRegistry } from './typed-tool-registry.js';

// Plan Generator
export { PlanGenerator } from './plan-generator.js';

// Safety Classifier
export { SafetyClassifier } from './safety-classifier.js';
export type { SafetyRule } from './safety-classifier.js';

// Cost Tracker
export { CostTracker } from './cost-tracker.js';

// Execution Engine
export { ExecutionEngine, tierToPermissionLevel } from './execution-engine.js';
export type { ExecutionEngineOptions } from './execution-engine.js';

// Workflows
export { BaseWorkflow } from './workflows/base-workflow.js';
export { PlanMyDayWorkflow } from './workflows/plan-my-day.js';
export { EmailReplyWorkflow } from './workflows/email-reply.js';
export { MeetingToTasksWorkflow } from './workflows/meeting-to-tasks.js';
export { CrossAppSearchWorkflow } from './workflows/cross-app-search.js';
export { ContentLaunchWorkflow } from './workflows/content-launch.js';

// ============================================================================
// Intelligent Agent (Phase 21)
// ============================================================================

// AI Engine Port (DI boundary)
export type {
  AIEnginePort,
  AIInferenceOptions,
  AIInferenceResult,
  AIClassificationResult,
} from './ai-engine.interface.js';

// IntelligentAgent base class
export { IntelligentAgent } from './intelligent-agent.js';
export type { TraceEvent, IntelligentAgentConfig } from './intelligent-agent.js';
