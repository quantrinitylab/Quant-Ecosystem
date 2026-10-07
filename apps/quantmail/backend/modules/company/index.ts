// ============================================================================
// Company OS module — Agent Workforce orchestration layer (Phase 6)
// quantmail-superhub · Task 18.1 (Requirements 9.1, 9.2, 9.3, 9.4)
// ============================================================================
//
// PURPOSE
//   Groups the "agent company" orchestration concern — turning ONE CEO goal
//   into a planned, tenant-scoped agent org — into a single cohesive module,
//   mirroring the QuantCode (`modules/code`), Agent (`modules/agent`), Billing
//   (`modules/billing`), and Answers (`modules/answers`) module structure.
//
// CURRENT SURFACE (Tasks 18.1 + 19.1)
//   • `CompanyOrchestrator.intakeGoal` / `planOrg` — see Task 18.1.
//   • `CompanyOrchestrator.provisionWorkspace(orgId, input)` — ATTACH (CEO
//     write scope required — Req 10.1) or CREATE the workspace repo, ensure a
//     default branch + branch-protection rule (Req 10.2), bind it to the org
//     and advance status to PROVISIONING.
//   • `CompanyOrchestrator.spawnFleet(orgId, plan, options)` — create one
//     `AgentWorker` per planned headcount (Req 10.4); resolve each worker's
//     model with CEO per-worker/per-role overrides else the role default
//     (Req 10.5), failing closed via `RoleCatalog.resolveModel` (Req 10.6);
//     assign each worker a tenant-scoped mailbox identity via the injectable
//     `AgentIdentityProvisioner` seam (Req 10.3 — the real provisioner is Task
//     19.2).
//   • `CompanyOrchestrator.supervise(orgId)` — observe the `agent-bus` (Req
//     12.5), reconcile the org's hard caps so `costSpent <= budgetCap` and
//     `totalIterations <= maxIterations` always hold (Req 13.1, 13.2), and
//     pause/retire over-budget, stalled, or looping workers (Req 13.3, 13.4).
//   • `RoleCatalog` — the seven agent roles + `resolveModel` (fail-closed).
//
// NEXT (not in this task)
//   The email-as-message-bus is implemented (`AgentEmailBus`, Task 20.1) and
//   supervision is now in place (Task 21.1). Still to come: human approval
//   gates and credit-backed budget reservation (Phase 7).
//
// MODULE BOUNDARY
//   This module consumes only neutral packages (`@quant/server-core`,
//   `@quant/ai`, `@prisma/client`). Per the SRP boundary it does NOT import the
//   mail-domain services and does NOT touch QuantChat; QuantCode / Agent /
//   Billing are consumed (in later tasks) only via their module barrels.

export {
  CompanyOrchestrator,
  createPrismaTenantOwnership,
  DEFAULT_BUDGET_CAP,
  DEFAULT_MAX_ITERATIONS,
  DEFAULT_SUPERVISION_CONFIG,
} from './services/company-orchestrator.service';
export type {
  TenantOwnershipPort,
  IntakeGoalOptions,
  OrgPlan,
  OrgPlanRole,
  PlanOrgOptions,
  CompanyOrchestratorOptions,
  ProvisionWorkspaceInput,
  Workspace,
  RepoVisibility,
  SpawnFleetOptions,
  SupervisionConfig,
  SupervisionReason,
  SupervisionWorkerAction,
  SupervisionTick,
} from './services/company-orchestrator.service';

export {
  PrismaAgentIdentityProvisioner,
  createPrismaAgentIdentityProvisioner,
  defaultAgentIdentityProvisioner,
  buildAgentScopes,
  defaultTenantDomain,
  AGENT_BUS_SCOPE,
} from './services/agent-identity-provisioner';
export type {
  AgentIdentityProvisioner,
  AgentIdentityProvisionRequest,
  AgentMailboxIdentity,
  TenantDomainResolver,
  PrismaAgentIdentityProvisionerOptions,
} from './services/agent-identity-provisioner';

export {
  RoleCatalog,
  createModelRouterRoutability,
  ALL_ROLE_KEYS,
} from './services/role-catalog.service';
export type {
  AgentRoleKey,
  ModelRef,
  AgentRole,
  CeoModelOverrides,
  ResolveModelContext,
  ModelRoutabilityPort,
  RoleCatalogOptions,
} from './services/role-catalog.service';

export {
  HeuristicOrgPlanner,
  defaultOrgPlanner,
} from './services/org-planner';
export type {
  RoleAllocation,
  OrgPlanRequest,
  OrgPlanner,
} from './services/org-planner';

// Task 22.2 — the policy-guarded autonomous Gmail handler. Classifies each
// proposed inbox action's sensitivity via the existing AI email services
// (injectable `SensitivityClassifierPort`), auto-executes at/below the
// `InboxAutomationPolicy` threshold respecting the undo-send window, routes
// above-threshold (and external-send-above-threshold) actions through the agent
// module's `AgentApprovalGate` (consumed via the `../agent` barrel), takes no
// action when the policy is disabled, and audits every action (Req 15.1–15.6).
export {
  GmailHandler,
  InMemoryGmailActionExecutor,
  createTriageSensitivityClassifier,
  sensitivityFromUrgency,
  isSendLike,
} from './services/gmail-handler.service';
export type {
  SensitivityLevel,
  GmailActionKind,
  ProposedGmailAction,
  InboxAutomationPolicy,
  ClassificationContext,
  SensitivityClassifierPort,
  TriagePort,
  GmailExecuteOptions,
  GmailActionResult,
  GmailActionExecutorPort,
  ApprovalGatePort,
  GmailHandlerOutcome,
  GmailHandlerDecision,
  GmailHandlerOptions,
} from './services/gmail-handler.service';

export {
  AgentEmailBus,
  InMemoryMailDelivery,
  ALL_MSG_TYPES,
  AGENT_BUS_LABEL,
} from './services/agent-email-bus';
export type {
  AgentBusMsgType,
  AgentBusArtifact,
  AgentBusMessage,
  AgentBusHeaders,
  MailDeliveryPort,
  DeliverBusMailInput,
  DeliveredBusMail,
  SendOptions,
  AgentEmailBusOptions,
} from './services/agent-email-bus';

// Task 30.1 — credit-backed org budget reservation (Requirements 21.1, 21.2,
// 21.3). The injectable port the orchestrator reserves the org `budgetCap`
// through at provisioning, plus the real adapter backed by the billing
// `CreditWallet` (consumed only via the billing module barrel). When wired,
// provisioning fails closed if the CEO's reservable balance is below the cap.
export {
  createCreditWalletOrgBudgetReservation,
  orgBudgetActionKey,
} from './services/org-budget-reservation.port';
export type {
  OrgBudgetReservationPort,
  OrgBudgetReservationInput,
  OrgBudgetReservation,
  CreditWalletOrgBudgetReservationOptions,
} from './services/org-budget-reservation.port';
