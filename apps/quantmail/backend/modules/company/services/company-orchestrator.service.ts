// ============================================================================
// Company OS module — Company Orchestrator: intakeGoal + planOrg (Phase 6)
// quantmail-superhub · Task 18.1 (Requirements 9.1, 9.2, 9.3, 9.4)
// ============================================================================
//
// PURPOSE
//   Implements the first two entry points of the Company OS Orchestrator
//   (design §"INTERFACE CompanyOrchestrator"):
//
//       PROCEDURE intakeGoal(ceoUserId, goalText, options) RETURNS AgentOrg
//         PRECONDITION:  ceoUserId is an authenticated tenant owner
//         POSTCONDITION: AgentOrg created status 'planning', bound to the tenant
//
//       FUNCTION planOrg(orgId) RETURNS OrgPlan
//         POSTCONDITION: plan lists {role, count, defaultModel, toolScope,
//                        budgetShare} per role
//         POSTCONDITION: SUM(role budgets) <= org.budgetCap
//
//   AUTHZ (Requirements 9.1/9.2): intake is allowed ONLY for an authenticated
//   tenant owner. The "who owns which tenant" decision is behind an injectable
//   `TenantOwnershipPort`; the default adapter resolves the tenant from the
//   `User` record (a user owns their own tenant — the design defines a Tenant as
//   "the ownership/isolation boundary derived from a user"). A caller who is not
//   an authenticated tenant owner is REJECTED and NO `AgentOrg` is created.
//
//   PLANNING (Requirements 9.3/9.4): role + headcount selection is delegated to
//   an injectable `OrgPlanner` port (backed by `@quant/ai` in production, a
//   deterministic heuristic offline). This orchestrator owns the budget-share
//   and model-resolution math so the `SUM(role budgets) <= budgetCap` invariant
//   holds in one place: shares are allocated by worker-count weight and rounded
//   DOWN to the cent, which guarantees the sum can never exceed the cap.
//
//   SCOPE: this file implements `intakeGoal`, `planOrg` (Task 18.1),
//   `provisionWorkspace` + `spawnFleet` (Task 19.1) and `supervise` (Task 21.1).
//   `provisionWorkspace` attaches/creates the workspace repo (requiring CEO
//   write scope on attach — Req 10.1) and ensures a default branch + branch
//   protection (Req 10.2). `spawnFleet` creates one `AgentWorker` per planned
//   headcount (Req 10.4), resolving each worker's model with CEO per-worker/
//   per-role overrides else the role default (Req 10.5) and failing closed when
//   a model is not routable (Req 10.6); each worker is tenant-scoped and gets a
//   mailbox identity via the injectable `AgentIdentityProvisioner` seam (the
//   real provisioner is Task 19.2 — Req 10.3). `supervise` observes the
//   `agent-bus` (Req 12.5), reconciles the org caps (Req 13.1/13.2), and
//   pauses/retires over-budget/stalled/looping workers (Req 13.3/13.4).

import type {
  PrismaClient,
  AgentOrg,
  AgentWorker,
  Repository,
  User,
} from '@prisma/client';
import { createAppError } from '@quant/server-core';
// QuantCode public surface (SRP boundary): provisioning reuses the developer
// platform's write-scope policy and branch-protection service via the module
// barrel — never by reaching into `modules/code/services/*` directly.
import {
  ownerOnlyAccess,
  BranchProtectionService,
  type RepoAccessPort,
} from '../../code';
import {
  RoleCatalog,
  type AgentRoleKey,
  type ModelRef,
  type CeoModelOverrides,
} from './role-catalog.service';
import {
  defaultOrgPlanner,
  type OrgPlanner,
  type RoleAllocation,
} from './org-planner';
import {
  createPrismaAgentIdentityProvisioner,
  type AgentIdentityProvisioner,
} from './agent-identity-provisioner';
import {
  AgentEmailBus,
  type AgentBusMessage,
  type AgentBusMsgType,
} from './agent-email-bus';
import type { OrgBudgetReservationPort } from './org-budget-reservation.port';

// ---------------------------------------------------------------------------
// Tenant ownership seam (Requirements 9.1, 9.2)
// ---------------------------------------------------------------------------

/**
 * Resolves the tenant a caller owns. Returns the owned tenant id, or `null`
 * when the caller is NOT an authenticated tenant owner (intake is rejected).
 */
export interface TenantOwnershipPort {
  resolveOwnedTenant(ceoUserId: string): Promise<string | null> | string | null;
}

/**
 * Default ownership policy: a Tenant is "derived from a user" (design glossary),
 * so a user owns their own tenant — the tenant id IS the user id. The user must
 * exist and not be soft-deleted to be an authenticated tenant owner. This is
 * swappable for a real org-membership policy without touching the orchestrator.
 */
export function createPrismaTenantOwnership(prisma: PrismaClient): TenantOwnershipPort {
  return {
    async resolveOwnedTenant(ceoUserId: string): Promise<string | null> {
      if (typeof ceoUserId !== 'string' || ceoUserId.trim().length === 0) {
        return null;
      }
      const user: User | null = await prisma.user.findUnique({
        where: { id: ceoUserId },
      });
      if (!user || user.deletedAt != null) {
        return null;
      }
      // The user owns their own tenant.
      return user.id;
    },
  };
}

// ---------------------------------------------------------------------------
// Intake / plan contracts
// ---------------------------------------------------------------------------

export interface IntakeGoalOptions {
  /** Hard org-level credit ceiling. Defaults to {@link DEFAULT_BUDGET_CAP}. */
  budgetCap?: number;
  /** Org iteration ceiling. Defaults to {@link DEFAULT_MAX_ITERATIONS}. */
  maxIterations?: number;
}

/** One role line of an {@link OrgPlan}. */
export interface OrgPlanRole {
  role: AgentRoleKey;
  count: number;
  defaultModel: ModelRef;
  toolScope: string[];
  /** Share of `budgetCap` allocated to this role. SUM over roles <= budgetCap. */
  budgetShare: number;
}

/**
 * The output of `planOrg`: the org composition with a per-role budget share
 * (design POSTCONDITION). `totalBudget` is the sum of the role shares and is
 * guaranteed `<= budgetCap` (Requirement 9.4).
 */
export interface OrgPlan {
  orgId: string;
  budgetCap: number;
  totalBudget: number;
  roles: OrgPlanRole[];
}

export interface PlanOrgOptions {
  /** CEO model overrides applied when resolving each role's model. */
  ceoOverrides?: CeoModelOverrides;
}

// ---------------------------------------------------------------------------
// Workspace provisioning / fleet spawning contracts (Task 19.1)
// ---------------------------------------------------------------------------

/** Repository visibility (mirrors the Prisma `RepoVisibility` enum). */
export type RepoVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL';

/**
 * Input to {@link CompanyOrchestrator.provisionWorkspace}: either ATTACH an
 * existing repo (CEO must hold write scope — Requirement 10.1) or CREATE a new
 * one owned by the CEO.
 */
export type ProvisionWorkspaceInput =
  | { mode: 'attach'; repoId: string }
  | {
      mode: 'create';
      name: string;
      description?: string;
      defaultBranch?: string;
      visibility?: RepoVisibility;
    };

/** The provisioned workspace returned by `provisionWorkspace`. */
export interface Workspace {
  orgId: string;
  repoId: string;
  /** The repo's default branch (branch-protection is configured against it). */
  defaultBranch: string;
  /** True when an existing repo was attached; false when a repo was created. */
  attached: boolean;
  /** The branch-protection rule id guarding the default branch. */
  branchProtectionRuleId: string;
}

/** Options for {@link CompanyOrchestrator.spawnFleet}. */
export interface SpawnFleetOptions {
  /**
   * CEO model overrides applied per worker (highest precedence) then per role,
   * else the role default. A per-worker override is matched by the worker's
   * slot key (e.g. `coder-3`).
   */
  ceoOverrides?: CeoModelOverrides;
}

// ---------------------------------------------------------------------------
// Supervision contracts (Task 21.1 — Requirements 12.5, 13.1, 13.2, 13.3, 13.4)
// ---------------------------------------------------------------------------

/**
 * Tunable detection thresholds for one supervision pass. All defaults are
 * conservative and overridable via {@link CompanyOrchestratorOptions.supervision}
 * so the policy can be tightened/loosened without touching the orchestrator.
 */
export interface SupervisionConfig {
  /**
   * How many IDENTICAL bus messages (same sender + msg type + work item) a
   * worker may emit before it is flagged as LOOPING (oscillation). Default 3.
   */
  loopThreshold: number;
  /**
   * How many consecutive NON-PROGRESS bus messages (status/escalation, with no
   * progress message in between) a worker may emit before it is flagged as
   * STALLED. Default 3.
   */
  stallThreshold: number;
  /**
   * Fraction of a budget ceiling (org cap or a worker's share) at/above which
   * BUDGET PRESSURE is flagged (Req 12.5). Default 0.9 (90%).
   */
  budgetPressureRatio: number;
}

/** The default supervision thresholds. */
export const DEFAULT_SUPERVISION_CONFIG: SupervisionConfig = {
  loopThreshold: 3,
  stallThreshold: 3,
  budgetPressureRatio: 0.9,
};

/** Why a worker was paused/retired during a supervision pass. */
export type SupervisionReason =
  | 'budget_cap' // org reached/exceeded its budget cap
  | 'iteration_cap' // org reached/exceeded its iteration cap
  | 'over_budget' // the worker's own spend met/exceeded its budget share
  | 'stall' // the worker made no recent progress
  | 'loop' // the worker emitted repeated identical messages
  | 'budget_pressure'; // the worker is approaching its budget share

/** The action taken against a single worker in a supervision pass. */
export interface SupervisionWorkerAction {
  workerId: string;
  action: 'paused' | 'retired';
  reasons: SupervisionReason[];
}

/**
 * The result of one `supervise` pass (design §"PROCEDURE supervise RETURNS
 * SupervisionTick"). Summarizes the reconciled org caps and every worker that
 * was paused or retired, with the reasons why.
 *
 * INVARIANTS held by construction (Req 13.1, 13.2):
 *   - `costSpent <= budgetCap`
 *   - `totalIterations <= maxIterations`
 */
export interface SupervisionTick {
  orgId: string;
  /** Reconciled org spend, CLAMPED so it never exceeds `budgetCap` (Req 13.1). */
  costSpent: number;
  budgetCap: number;
  /** Reconciled org iterations, CLAMPED to `maxIterations` (Req 13.2). */
  totalIterations: number;
  maxIterations: number;
  /** True when aggregate spend reached/exceeded the budget cap. */
  budgetCapReached: boolean;
  /** True when the iteration signal reached/exceeded the iteration cap. */
  iterationCapReached: boolean;
  /** True when aggregate spend crossed the org budget-pressure ratio (Req 12.5). */
  budgetPressure: boolean;
  /** Number of agent-bus messages observed for the org this pass. */
  messagesObserved: number;
  /** Worker ids paused this pass. */
  pausedWorkerIds: string[];
  /** Worker ids retired (and identities revoked) this pass. */
  retiredWorkerIds: string[];
  /** Worker ids detected as stalled this pass. */
  stalledWorkerIds: string[];
  /** Worker ids detected as looping this pass. */
  loopingWorkerIds: string[];
  /** The full per-worker action log (paused/retired + reasons). */
  actions: SupervisionWorkerAction[];
}

export interface CompanyOrchestratorOptions {
  /** Role definitions + model-resolution policy. */
  roleCatalog?: RoleCatalog;
  /** Role + headcount planner (defaults to the offline heuristic planner). */
  planner?: OrgPlanner;
  /** Tenant-ownership authz policy (defaults to the prisma user-tenant policy). */
  tenantOwnership?: TenantOwnershipPort;
  /**
   * Write-scope policy used to gate ATTACH provisioning (Requirement 10.1).
   * Defaults to QuantCode's owner-only policy (consumed via the module barrel).
   */
  repoAccess?: RepoAccessPort;
  /**
   * Branch-protection service (consumed from the QuantCode module barrel) used
   * to ensure the workspace default branch is protected (Requirement 10.2).
   */
  branchProtection?: BranchProtectionService;
  /**
   * Agent mailbox-identity provisioner seam (Requirement 10.3). Defaults to the
   * minimal namespaced-address provisioner; Task 19.2 injects the real one.
   */
  identityProvisioner?: AgentIdentityProvisioner;
  /**
   * Agent email bus seam (design §"INTERFACE AgentEmailBus") used by `supervise`
   * to OBSERVE the `agent-bus` traffic for routing + stall/loop/budget detection
   * (Req 12.5). Defaults to a Prisma-backed {@link AgentEmailBus}.
   */
  emailBus?: AgentEmailBus;
  /** Detection thresholds for `supervise` (defaults to {@link DEFAULT_SUPERVISION_CONFIG}). */
  supervision?: Partial<SupervisionConfig>;
  /**
   * Credit-backed org-budget reservation seam (Requirement 21.1). When wired,
   * `provisionWorkspace` reserves the org `budgetCap` in credits from the CEO's
   * `CreditWallet` and FAILS CLOSED (rejecting provisioning) when the CEO's
   * reservable balance is below the cap. The real adapter
   * ({@link createCreditWalletOrgBudgetReservation}) consumes Billing only via
   * the billing module barrel. Left UNSET, provisioning skips the reservation
   * (the budget stays an in-memory ceiling, as before this seam landed) — so
   * the credit backing is opt-in via injection without rewriting callers.
   */
  orgBudgetReservation?: OrgBudgetReservationPort;
}

/** Maps a lowercase role key to the Prisma `AgentRoleKey` enum value. */
const PRISMA_ROLE: Record<
  AgentRoleKey,
  'PLANNER' | 'CODER' | 'REVIEWER' | 'TESTER' | 'DEBUGGER' | 'UPGRADER' | 'DEVOPS'
> = {
  planner: 'PLANNER',
  coder: 'CODER',
  reviewer: 'REVIEWER',
  tester: 'TESTER',
  debugger: 'DEBUGGER',
  upgrader: 'UPGRADER',
  devops: 'DEVOPS',
};

/** Default hard org budget ceiling (credits) when the caller omits one. */
export const DEFAULT_BUDGET_CAP = 1000;
/** Default org iteration ceiling when the caller omits one. */
export const DEFAULT_MAX_ITERATIONS = 100;

/**
 * Bus message types that represent forward PROGRESS on a work item. A worker
 * emitting only non-progress chatter (everything else — `status`/`escalation`)
 * is a stall signal.
 */
const PROGRESS_MSG_TYPES: ReadonlySet<AgentBusMsgType> = new Set<AgentBusMsgType>([
  'task_assign',
  'pr_ready',
  'change_request',
  'ci_result',
  'done',
]);

/** Worker statuses that are still "live" and therefore supervisable. */
const SUPERVISABLE_WORKER_STATUSES: ReadonlySet<string> = new Set([
  'SPAWNING',
  'ACTIVE',
]);

/** Round a non-negative amount DOWN to whole cents (two decimals). */
function floorToCents(amount: number): number {
  return Math.floor(amount * 100) / 100;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class CompanyOrchestrator {
  private readonly roleCatalog: RoleCatalog;
  private readonly planner: OrgPlanner;
  private readonly tenantOwnership: TenantOwnershipPort;
  private readonly repoAccess: RepoAccessPort;
  private readonly branchProtection: BranchProtectionService;
  private readonly identityProvisioner: AgentIdentityProvisioner;
  private readonly emailBus: AgentEmailBus;
  private readonly supervisionConfig: SupervisionConfig;
  private readonly orgBudgetReservation?: OrgBudgetReservationPort;

  constructor(
    private readonly prisma: PrismaClient,
    options: CompanyOrchestratorOptions = {},
  ) {
    this.roleCatalog = options.roleCatalog ?? new RoleCatalog();
    this.planner = options.planner ?? defaultOrgPlanner;
    this.tenantOwnership =
      options.tenantOwnership ?? createPrismaTenantOwnership(prisma);
    this.repoAccess = options.repoAccess ?? ownerOnlyAccess;
    this.branchProtection =
      options.branchProtection ?? new BranchProtectionService(prisma);
    this.identityProvisioner =
      options.identityProvisioner ?? createPrismaAgentIdentityProvisioner(prisma);
    this.emailBus = options.emailBus ?? new AgentEmailBus(prisma);
    this.supervisionConfig = {
      ...DEFAULT_SUPERVISION_CONFIG,
      ...(options.supervision ?? {}),
    };
    this.orgBudgetReservation = options.orgBudgetReservation;
  }

  /**
   * Intake a CEO goal and create an `AgentOrg` in `PLANNING` status bound to the
   * CEO's tenant.
   *
   * @throws 400 GOAL_REQUIRED          when `goalText` is empty/whitespace.
   * @throws 400 INVALID_BUDGET_CAP     when `budgetCap` is negative/non-finite.
   * @throws 403 NOT_TENANT_OWNER       when the caller is not an authenticated
   *                                    tenant owner (NO AgentOrg is created).
   */
  async intakeGoal(
    ceoUserId: string,
    goalText: string,
    options: IntakeGoalOptions = {},
  ): Promise<AgentOrg> {
    // ----- 0. Validate the goal -------------------------------------------
    if (typeof goalText !== 'string' || goalText.trim().length === 0) {
      throw createAppError('A goal description is required', 400, 'GOAL_REQUIRED');
    }

    const budgetCap = options.budgetCap ?? DEFAULT_BUDGET_CAP;
    if (!Number.isFinite(budgetCap) || budgetCap < 0) {
      throw createAppError(
        'budgetCap must be a non-negative number',
        400,
        'INVALID_BUDGET_CAP',
      );
    }
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    if (!Number.isInteger(maxIterations) || maxIterations <= 0) {
      throw createAppError(
        'maxIterations must be a positive integer',
        400,
        'INVALID_MAX_ITERATIONS',
      );
    }

    // ----- 1. AUTHZ GATE (Requirements 9.1, 9.2) ---------------------------
    // Only an authenticated tenant owner may intake a goal. Resolve BEFORE any
    // write so a non-owner causes NO AgentOrg to be created.
    const tenantId = await this.tenantOwnership.resolveOwnedTenant(ceoUserId);
    if (tenantId == null) {
      throw createAppError(
        'Only an authenticated tenant owner may submit a company goal',
        403,
        'NOT_TENANT_OWNER',
      );
    }

    // ----- 2. Create the AgentOrg in PLANNING status, bound to the tenant ---
    const org = await this.prisma.agentOrg.create({
      data: {
        ceoUserId,
        tenantId,
        goalText: goalText.trim(),
        status: 'PLANNING',
        workspaceRepoId: null,
        budgetCap,
        costSpent: 0,
        maxIterations,
        totalIterations: 0,
      },
    });

    return org;
  }

  /**
   * Plan the org: decide roles + headcount (sized to the goal, via the injected
   * planner), then attach each role's default model, tool scope, and a budget
   * share. The per-role shares are allocated by worker-count weight and rounded
   * DOWN to the cent so their SUM is guaranteed `<= org.budgetCap`
   * (Requirement 9.4).
   *
   * @throws 404 ORG_NOT_FOUND   when the org does not exist.
   * @throws 500 EMPTY_PLAN      when the planner produced no staffable role.
   * @throws 422 MODEL_NOT_ROUTABLE  (from RoleCatalog) when a role's resolved
   *                                  model is not routable (fail closed).
   */
  async planOrg(orgId: string, options: PlanOrgOptions = {}): Promise<OrgPlan> {
    // ----- 0. Load the org -------------------------------------------------
    const org = await this.prisma.agentOrg.findUnique({ where: { id: orgId } });
    if (!org) {
      throw createAppError('Agent org not found', 404, 'ORG_NOT_FOUND');
    }

    // ----- 1. Decide roles + headcount (via @quant/ai-backed planner) ------
    const rawAllocations = await this.planner.plan({
      orgId: org.id,
      goalText: org.goalText,
      budgetCap: org.budgetCap,
    });
    const allocations = this.normalizeAllocations(rawAllocations);
    if (allocations.length === 0) {
      throw createAppError(
        'Org planner produced no staffable roles',
        500,
        'EMPTY_PLAN',
      );
    }

    // ----- 2. Allocate budget shares by worker-count weight ----------------
    // share_i = floorToCents(budgetCap * count_i / totalCount). Flooring each
    // share guarantees SUM(shares) <= budgetCap (Requirement 9.4) by
    // construction, since the un-floored shares sum to exactly budgetCap.
    const totalCount = allocations.reduce((sum, a) => sum + a.count, 0);
    const overrides = options.ceoOverrides ?? {};

    const roles: OrgPlanRole[] = allocations.map((alloc) => {
      const defaultModel = this.roleCatalog.resolveModel(
        org.id,
        alloc.roleKey,
        overrides,
      );
      const toolScope = this.roleCatalog.getRole(alloc.roleKey).defaultToolScope;
      const budgetShare =
        totalCount > 0
          ? floorToCents((org.budgetCap * alloc.count) / totalCount)
          : 0;
      return {
        role: alloc.roleKey,
        count: alloc.count,
        defaultModel,
        toolScope: [...toolScope],
        budgetShare,
      };
    });

    const totalBudget = floorToCents(
      roles.reduce((sum, r) => sum + r.budgetShare, 0),
    );

    // Defence-in-depth: assert the invariant the construction guarantees.
    if (totalBudget > org.budgetCap) {
      throw createAppError(
        `Planned role budgets (${totalBudget}) exceed the org budget cap (${org.budgetCap})`,
        500,
        'BUDGET_SUM_EXCEEDED',
      );
    }

    return {
      orgId: org.id,
      budgetCap: org.budgetCap,
      totalBudget,
      roles,
    };
  }

  /**
   * Provision the org's workspace repository (design §"PROCEDURE
   * provisionWorkspace"). Either ATTACH an existing repo (the CEO MUST hold
   * write scope — Requirement 10.1) or CREATE a new repo owned by the CEO. In
   * both cases the repo ends up with a default branch and a branch-protection
   * rule guarding it (Requirement 10.2). The org is bound to the repo
   * (`workspaceRepoId`) and advanced to `PROVISIONING`.
   *
   * @throws 404 ORG_NOT_FOUND         when the org does not exist.
   * @throws 404 REPO_NOT_FOUND        when attaching a non-existent repo.
   * @throws 403 WRITE_SCOPE_REQUIRED  when the CEO lacks write scope on an
   *                                   attached repo (Requirement 10.1).
   * @throws 400 REPO_NAME_REQUIRED    when creating a repo with no name.
   */
  async provisionWorkspace(
    orgId: string,
    input: ProvisionWorkspaceInput,
  ): Promise<Workspace> {
    // ----- 0. Load the org -------------------------------------------------
    const org = await this.prisma.agentOrg.findUnique({ where: { id: orgId } });
    if (!org) {
      throw createAppError('Agent org not found', 404, 'ORG_NOT_FOUND');
    }

    // ----- 0.5 RESERVE the org budget in credits (Requirement 21.1) --------
    // Reserve `budgetCap` credits from the CEO's wallet BEFORE any provisioning
    // side effect, so a CEO whose reservable balance is below the cap causes
    // NOTHING to be provisioned (no repo created, no branch protection, no
    // binding). Keyed idempotently by the org id, so re-provisioning the same
    // org never double-reserves. Skipped when no reservation seam is wired.
    if (this.orgBudgetReservation) {
      await this.orgBudgetReservation.reserve({
        orgId: org.id,
        budgetCap: org.budgetCap ?? 0,
        ceoUserId: org.ceoUserId,
        tenantId: org.tenantId,
      });
    }

    // ----- 1. Resolve (attach) or create the repo -------------------------
    let repo: Repository;
    let attached: boolean;

    if (input.mode === 'attach') {
      const existing = await this.prisma.repository.findUnique({
        where: { id: input.repoId },
      });
      if (!existing) {
        throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
      }
      // WRITE-SCOPE GATE (Requirement 10.1): the CEO must hold write scope on
      // the target repo. Evaluated BEFORE any binding so a non-writable repo
      // leaves the org untouched.
      const writeAllowed = await this.repoAccess.hasWriteScope(existing, org.ceoUserId);
      if (!writeAllowed) {
        throw createAppError(
          'The CEO must hold write scope on the repository being attached',
          403,
          'WRITE_SCOPE_REQUIRED',
        );
      }
      repo = existing;
      attached = true;
    } else {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length === 0) {
        throw createAppError(
          'A repository name is required to create a workspace',
          400,
          'REPO_NAME_REQUIRED',
        );
      }
      repo = await this.prisma.repository.create({
        data: {
          name,
          description: input.description ?? null,
          visibility: input.visibility ?? 'PRIVATE',
          defaultBranch: input.defaultBranch ?? 'main',
          // The CEO owns the workspace repo, so the owner-only write-scope
          // policy grants the CEO (and the fleet, via scoped APIs) write access.
          ownerId: org.ceoUserId,
        },
      });
      attached = false;
    }

    // ----- 2. Ensure branch protection guards the default branch (Req 10.2) -
    // The repo already carries a default branch (`Repository.defaultBranch`).
    // Ensure a branch-protection rule matches it; create one if absent. This
    // goes through the QuantCode module's `BranchProtectionService` (SRP
    // boundary) rather than touching protection tables directly.
    const defaultBranch = repo.defaultBranch;
    let rule = await this.branchProtection.getMatchingRule(repo.id, defaultBranch);
    if (!rule) {
      rule = await this.branchProtection.createRule({
        repoId: repo.id,
        branchPattern: defaultBranch,
        requiredApprovals: 1,
        requireStatusChecks: true,
      });
    }

    // ----- 3. Bind the workspace + advance status to PROVISIONING ----------
    await this.prisma.agentOrg.update({
      where: { id: org.id },
      data: { workspaceRepoId: repo.id, status: 'PROVISIONING' },
    });

    return {
      orgId: org.id,
      repoId: repo.id,
      defaultBranch,
      attached,
      branchProtectionRuleId: rule.id,
    };
  }

  /**
   * Spawn the agent fleet for an approved plan (design §"PROCEDURE
   * spawnFleet"). Creates one `AgentWorker` per planned headcount so the worker
   * count matches the approved plan (Requirement 10.4). For each worker:
   *   - the model is resolved via `RoleCatalog.resolveModel`, applying the CEO's
   *     per-worker override (matched by the worker's slot key) then per-role
   *     override, else the role default (Requirement 10.5), FAILING CLOSED with
   *     422 MODEL_NOT_ROUTABLE when the chosen model is not routable by
   *     `@quant/ai` (Requirement 10.6);
   *   - a unique, tenant-scoped mailbox identity is provisioned through the
   *     injectable `AgentIdentityProvisioner` seam (the real provisioner is
   *     Task 19.2) and recorded on the worker;
   *   - the worker is tenant-scoped (`tenantId == org.tenantId`) and receives an
   *     even split of its role's budget share (so SUM(worker shares) stays
   *     within the role share and therefore within the org budget cap).
   *
   * @throws 404 ORG_NOT_FOUND                when the org does not exist.
   * @throws 409 WORKSPACE_NOT_PROVISIONED    when no workspace has been bound.
   * @throws 422 MODEL_NOT_ROUTABLE           when a worker's model is not
   *                                          routable (FAIL CLOSED, Req 10.6).
   */
  async spawnFleet(
    orgId: string,
    plan: OrgPlan,
    options: SpawnFleetOptions = {},
  ): Promise<AgentWorker[]> {
    // ----- 0. Load the org + precondition ----------------------------------
    const org = await this.prisma.agentOrg.findUnique({ where: { id: orgId } });
    if (!org) {
      throw createAppError('Agent org not found', 404, 'ORG_NOT_FOUND');
    }
    if (org.workspaceRepoId == null) {
      throw createAppError(
        'The org workspace must be provisioned before spawning the fleet',
        409,
        'WORKSPACE_NOT_PROVISIONED',
      );
    }

    // ----- 0.5 Enforce SUM(worker budgetShare) <= budgetCap (Req 21.3) -----
    // Project the per-worker shares this spawn would assign (each role share is
    // split evenly across its workers, floored to the cent) and reject the
    // spawn when their sum would exceed the credit-backed org budget cap, so the
    // fleet can never be funded beyond what was reserved.
    const projectedWorkerBudget = floorToCents(
      plan.roles.reduce((sum, roleLine) => {
        const count = Math.max(0, Math.floor(roleLine.count));
        const perWorkerShare =
          count > 0 ? floorToCents(roleLine.budgetShare / count) : 0;
        return sum + perWorkerShare * count;
      }, 0),
    );
    const cap = org.budgetCap ?? 0;
    if (projectedWorkerBudget > cap + 1e-9) {
      throw createAppError(
        `Planned worker budget shares (${projectedWorkerBudget}) exceed the org budget cap (${cap})`,
        400,
        'BUDGET_SUM_EXCEEDED',
      );
    }

    const overrides = options.ceoOverrides ?? {};
    const workers: AgentWorker[] = [];

    // ----- 1. Spawn workers matching the approved plan (Requirement 10.4) --
    for (const roleLine of plan.roles) {
      const count = Math.max(0, Math.floor(roleLine.count));
      // Split the role's budget share evenly across its workers, floored to the
      // cent so the per-worker shares never sum above the role share.
      const perWorkerShare =
        count > 0 ? floorToCents(roleLine.budgetShare / count) : 0;

      for (let i = 0; i < count; i++) {
        // Stable, human-readable slot (e.g. `coder-3`) used both as the
        // per-worker model-override match key and the identity namespace.
        const workerSlot = `${roleLine.role}-${i + 1}`;

        // MODEL RESOLUTION (Requirements 10.5/10.6): per-worker override →
        // per-role override → role default; FAIL CLOSED if not routable.
        const model: ModelRef = this.roleCatalog.resolveModel(
          org.id,
          roleLine.role,
          overrides,
          { workerId: workerSlot },
        );

        // MAILBOX IDENTITY (Requirement 10.3): provisioned via the injectable
        // seam, scoped to the org's single tenant.
        const identity = await this.identityProvisioner.provision({
          orgId: org.id,
          tenantId: org.tenantId,
          workerSlot,
          roleKey: roleLine.role,
          toolScope: roleLine.toolScope,
        });

        const worker = await this.prisma.agentWorker.create({
          data: {
            orgId: org.id,
            // Workers are tenant-scoped: tenantId equals the org's tenantId.
            tenantId: org.tenantId,
            role: PRISMA_ROLE[roleLine.role],
            modelRef: model.id,
            mailboxIdentityId: identity.mailboxIdentityId,
            toolScope: roleLine.toolScope,
            status: 'SPAWNING',
            budgetShare: perWorkerShare,
            costSpent: 0,
          },
        });

        workers.push(worker);
      }
    }

    return workers;
  }

  /**
   * Supervise a running org for ONE tick (design §"PROCEDURE supervise"):
   * OBSERVE the agent-bus traffic, reconcile the org's hard caps, and
   * pause/retire any worker that is over budget, stalled, or looping.
   *
   * Behaviour (Requirements 12.5, 13.1, 13.2, 13.3, 13.4):
   *   1. Observe every `agent-bus` message for the org (Req 12.5) — the routing
   *      + audit view used for stall/loop/budget-pressure detection.
   *   2. Reconcile the org caps from the workforce: aggregate worker `costSpent`
   *      and an iteration signal (the observed message count), then persist
   *      `org.costSpent`/`org.totalIterations` CLAMPED to the caps so the
   *      invariants `costSpent <= budgetCap` and `totalIterations <=
   *      maxIterations` ALWAYS hold (Req 13.1, 13.2).
   *   3. If the org reached/exceeded its budget cap → RETIRE every live worker
   *      (revoking its mailbox identity) so it cannot continue spending; if it
   *      reached/exceeded its iteration cap → PAUSE every live worker (Req 13.3).
   *   4. Otherwise, per worker: RETIRE an over-budget worker (own spend >= its
   *      share), PAUSE a stalled or looping worker (Req 13.4). Budget pressure
   *      (approaching the share) is flagged but, on its own, does not stop a
   *      worker.
   *
   * Pausing sets `status = PAUSED` (recoverable); retiring sets `status =
   * RETIRED` and revokes the worker's agent mailbox identity for audit. Already
   * paused/retired workers are left untouched. The pass is idempotent.
   *
   * @throws 404 ORG_NOT_FOUND when the org does not exist.
   */
  async supervise(orgId: string): Promise<SupervisionTick> {
    const id = typeof orgId === 'string' ? orgId.trim() : '';
    if (id.length === 0) {
      throw createAppError('An org id is required', 400, 'ORG_ID_REQUIRED');
    }

    // ----- 0. Load the org -------------------------------------------------
    const org = await this.prisma.agentOrg.findUnique({ where: { id } });
    if (!org) {
      throw createAppError('Agent org not found', 404, 'ORG_NOT_FOUND');
    }

    const { loopThreshold, stallThreshold, budgetPressureRatio } =
      this.supervisionConfig;

    // ----- 1. OBSERVE the agent-bus (Req 12.5) -----------------------------
    const messages = await this.emailBus.observe(org.id);

    // ----- 2. Load the workforce + reconcile org caps ----------------------
    const workers = await this.prisma.agentWorker.findMany({
      where: { orgId: org.id },
    });

    // Aggregate spend across the WHOLE workforce (spend already incurred by a
    // since-retired worker still counts against the org cap).
    const aggregateCost = workers.reduce(
      (sum, w) => sum + (Number.isFinite(w.costSpent) ? w.costSpent : 0),
      0,
    );
    const rawCost = Math.max(org.costSpent ?? 0, aggregateCost);
    const budgetCap = org.budgetCap ?? 0;
    const budgetCapReached = budgetCap > 0 && rawCost >= budgetCap;
    // CLAMP so the persisted invariant `costSpent <= budgetCap` always holds.
    const costSpent =
      budgetCap > 0 ? Math.min(rawCost, budgetCap) : rawCost;
    const budgetPressure =
      budgetCap > 0 && rawCost >= budgetPressureRatio * budgetCap;

    // The observed message volume is the org's iteration signal; reconcile
    // monotonically and CLAMP to the iteration cap (Req 13.2).
    const maxIterations = org.maxIterations ?? 0;
    const iterationSignal = Math.max(org.totalIterations ?? 0, messages.length);
    const iterationCapReached =
      maxIterations > 0 && iterationSignal >= maxIterations;
    const totalIterations =
      maxIterations > 0 ? Math.min(iterationSignal, maxIterations) : iterationSignal;

    // ----- 3. Per-worker signal analysis from the bus ----------------------
    const messagesByWorker = groupMessagesBySender(messages);
    const stalledWorkerIds: string[] = [];
    const loopingWorkerIds: string[] = [];

    const actions: SupervisionWorkerAction[] = [];
    const pausedWorkerIds: string[] = [];
    const retiredWorkerIds: string[] = [];

    for (const worker of workers) {
      // Only live workers are actionable; already paused/retired ones are left
      // as-is (idempotent).
      if (!SUPERVISABLE_WORKER_STATUSES.has(String(worker.status))) {
        continue;
      }

      const workerMessages = messagesByWorker.get(worker.id) ?? [];
      const looping = detectLoop(workerMessages, loopThreshold);
      const stalled = detectStall(workerMessages, stallThreshold);
      if (looping) loopingWorkerIds.push(worker.id);
      if (stalled) stalledWorkerIds.push(worker.id);

      const share = Number.isFinite(worker.budgetShare) ? worker.budgetShare : 0;
      const overBudget = share > 0 && (worker.costSpent ?? 0) >= share;

      // Decide the action + reasons. Retire dominates pause; org cap dominates
      // per-worker signals.
      const reasons: SupervisionReason[] = [];
      let action: 'paused' | 'retired' | null = null;

      if (budgetCapReached) {
        // Org out of money → stop ALL spend by retiring live workers (Req 13.3).
        action = 'retired';
        reasons.push('budget_cap');
      } else if (overBudget) {
        // This worker exhausted its own share → retire it (Req 13.4).
        action = 'retired';
        reasons.push('over_budget');
      } else if (iterationCapReached) {
        // Org hit its iteration ceiling → pause live workers (Req 13.3).
        action = 'paused';
        reasons.push('iteration_cap');
      } else if (stalled || looping) {
        // Stalled/looping worker → pause it (Req 13.4).
        action = 'paused';
        if (stalled) reasons.push('stall');
        if (looping) reasons.push('loop');
      }

      if (action == null) {
        continue;
      }

      if (action === 'retired') {
        await this.retireWorker(worker);
        retiredWorkerIds.push(worker.id);
      } else {
        await this.prisma.agentWorker.update({
          where: { id: worker.id },
          data: { status: 'PAUSED' },
        });
        pausedWorkerIds.push(worker.id);
      }
      actions.push({ workerId: worker.id, action, reasons });
    }

    // ----- 4. Persist the reconciled (clamped) org caps --------------------
    if (costSpent !== (org.costSpent ?? 0) || totalIterations !== (org.totalIterations ?? 0)) {
      await this.prisma.agentOrg.update({
        where: { id: org.id },
        data: { costSpent, totalIterations },
      });
    }

    return {
      orgId: org.id,
      costSpent,
      budgetCap,
      totalIterations,
      maxIterations,
      budgetCapReached,
      iterationCapReached,
      budgetPressure,
      messagesObserved: messages.length,
      pausedWorkerIds,
      retiredWorkerIds,
      stalledWorkerIds,
      loopingWorkerIds,
      actions,
    };
  }

  /**
   * Retire a worker: mark it `RETIRED` and revoke its agent mailbox identity
   * (archived for audit) via the injected provisioner. The status flip happens
   * even if the worker has no identity or the provisioner exposes no `revoke`.
   */
  private async retireWorker(worker: AgentWorker): Promise<void> {
    await this.prisma.agentWorker.update({
      where: { id: worker.id },
      data: { status: 'RETIRED' },
    });
    if (worker.mailboxIdentityId && typeof this.identityProvisioner.revoke === 'function') {
      await this.identityProvisioner.revoke(worker.mailboxIdentityId);
    }
  }

  /**
   * duplicate role keys (summing counts), and guarantee a Planner is present
   * (every org needs the coordination backbone). Order is preserved by first
   * appearance, with an injected Planner placed first when missing.
   */
  private normalizeAllocations(raw: RoleAllocation[]): RoleAllocation[] {
    const merged = new Map<AgentRoleKey, number>();
    for (const a of raw) {
      if (!a || typeof a.count !== 'number' || !Number.isFinite(a.count)) continue;
      const count = Math.floor(a.count);
      if (count <= 0) continue;
      merged.set(a.roleKey, (merged.get(a.roleKey) ?? 0) + count);
    }

    if (merged.size === 0) {
      return [];
    }

    if (!merged.has('planner')) {
      // Re-key with planner first.
      const withPlanner = new Map<AgentRoleKey, number>([['planner', 1]]);
      for (const [k, v] of merged) withPlanner.set(k, v);
      return Array.from(withPlanner, ([roleKey, count]) => ({ roleKey, count }));
    }

    return Array.from(merged, ([roleKey, count]) => ({ roleKey, count }));
  }
}

// ---------------------------------------------------------------------------
// Supervision detection helpers (pure — Requirements 12.5, 13.4)
// ---------------------------------------------------------------------------

/**
 * Group observed bus messages by their sender worker id, preserving the
 * oldest-first order `observe` returns (so trailing-run analysis is valid).
 */
function groupMessagesBySender(
  messages: AgentBusMessage[],
): Map<string, AgentBusMessage[]> {
  const byWorker = new Map<string, AgentBusMessage[]>();
  for (const m of messages) {
    const sender = typeof m.fromWorkerId === 'string' ? m.fromWorkerId : '';
    if (sender.length === 0) continue;
    const list = byWorker.get(sender);
    if (list) list.push(m);
    else byWorker.set(sender, [m]);
  }
  return byWorker;
}

/**
 * LOOP detection (Req 13.4): a worker is looping when it has emitted the SAME
 * message signature — `(msgType, workItemId)` — at least `threshold` times
 * (repeated identical messages / oscillation on one work item).
 */
function detectLoop(messages: AgentBusMessage[], threshold: number): boolean {
  if (threshold <= 0 || messages.length < threshold) return false;
  const counts = new Map<string, number>();
  for (const m of messages) {
    const signature = `${m.msgType}|${m.workItemId}`;
    const next = (counts.get(signature) ?? 0) + 1;
    counts.set(signature, next);
    if (next >= threshold) return true;
  }
  return false;
}

/**
 * STALL detection (Req 13.4): a worker is stalled when its MOST RECENT run of
 * messages contains no forward progress — i.e. the trailing run of consecutive
 * NON-PROGRESS messages (anything outside {@link PROGRESS_MSG_TYPES}) since the
 * last progress message is at least `threshold` long.
 */
function detectStall(messages: AgentBusMessage[], threshold: number): boolean {
  if (threshold <= 0 || messages.length < threshold) return false;
  let trailingNonProgress = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgType = messages[i].msgType as AgentBusMsgType;
    if (PROGRESS_MSG_TYPES.has(msgType)) break;
    trailingNonProgress++;
    if (trailingNonProgress >= threshold) return true;
  }
  return false;
}

