// ============================================================================
// Agent module — bounded, branch-isolated Agent Runtime (Pillar 3)
// quantmail-superhub · Task 12.1 (Requirements 7.1, 7.2)
// ============================================================================
//
// PURPOSE
//   Implements the entry point of the AgentRuntime interface
//   (design §"INTERFACE AgentRuntime"):
//
//       PROCEDURE startTask(userId, repoId, instruction) RETURNS AgentSession
//         PRECONDITION:  user has write scope on repoId; budget available
//         POSTCONDITION: session created with status 'planning'
//
//   Two preconditions are enforced here (Requirements 7.1, 7.2):
//     1. WRITE-SCOPE GATE — the caller must hold write scope on the target repo
//        (the repo owner, or an authorized collaborator once a role model
//        exists). A caller without write scope is rejected with 403 and *no*
//        AgentSession is created. This reuses the QuantCode module's
//        `RepoAccessPort`/`ownerOnlyAccess` write-scope policy (consumed via the
//        module barrel) so the agent runtime and QuantCode agree on "who may
//        write to a repo" — the SRP boundary is respected: the agent runtime is
//        a *consumer* of QuantCode's public surface, never a peer that reaches
//        into `modules/code/services/*`.
//     2. BUDGET GATE — the session must have an available budget: a positive
//        iteration bound (`maxIterations > 0`) AND a positive cost budget
//        (`costBudget > 0`). Without budget the request is rejected and no
//        session is created. The decision is behind an injectable `BudgetPort`
//        seam so Task 13.1 can swap in the real `UsageGate`/`CreditMeter`
//        wallet check without touching this code; the default seam enforces the
//        positive-budget rule.
//
//   On success an `AgentSession` is created with status `PLANNING` on an
//   ISOLATED agent branch. `branchRef` is derived from the session id
//   (`agent/<sessionId>`) and is guaranteed to differ from the repository's
//   default branch (Requirement 7.2 invariant `branchRef != repo.defaultBranch`)
//   so the agent can never be configured to write to the base branch.
//
//   SCOPE: this file implements ONLY `startTask`. The `step()` tool-execution
//   loop, tool side-effects, and PR/merge landing are Tasks 12.2 and 12.4.

import type {
  PrismaClient,
  Repository,
  AgentSession,
  AgentTranscript,
} from '@prisma/client';
import { createAppError } from '@quant/server-core';
// QuantCode public surface (SRP boundary): the agent runtime reuses the
// developer platform's write-scope policy rather than re-deriving it.
import { ownerOnlyAccess, type RepoAccessPort } from '../../code';
// Cross-cutting ownership filter + observability (Task 23.1, Req 22.1/22.2/23.2).
// The agent runtime INHERITS the mail-domain ownership rule via an injectable
// port (Req 22.3) and emits a span per agent step (Req 23.2). Imported from
// neutral shared infra, so no module boundary is crossed.
import {
  ownerOnlyAuthz,
  type OwnershipAuthzPort,
  type OwnershipPrincipal,
  type OwnedResource,
} from '../../../shared/ownership-authz';
import { noopSpanPort, withSpan, type SpanPort } from '../../../shared/observability';
import {
  noopToolExecutionLoop,
  type ToolExecutionLoop,
  type ToolCall,
  type Observation,
  type AgentStepState,
  type AgentTranscriptRole,
} from './tool-execution-loop';

// Status union for an AgentSession (mirrors the Prisma `AgentSessionStatus`
// enum). Declared locally because the generated client surfaces the enum only
// as an input-field union, not as a re-exported named type.
type AgentSessionStatus =
  | 'PLANNING'
  | 'RUNNING'
  | 'AWAITING_REVIEW'
  | 'DONE'
  | 'FAILED'
  | 'CANCELLED';

// ---------------------------------------------------------------------------
// Budget contract + seam
// ---------------------------------------------------------------------------

/** The bounds that make a session's autonomy finite (Requirement 7.2/7.3). */
export interface AgentBudget {
  /** Hard upper bound on tool-execution iterations. MUST be > 0. */
  maxIterations: number;
  /** Credit budget reserved for the session's AI spend. MUST be > 0. */
  costBudget: number;
}

/**
 * Budget-availability decision seam. The default implementation enforces only
 * that the requested budget is positive (a self-contained precondition). When
 * the credit economy lands (Task 13.1 `UsageGate`/`CreditMeter`), swap in an
 * adapter that also verifies the user's wallet can fund `costBudget` — and
 * `startTask` itself does not change.
 */
export interface BudgetPort {
  hasAvailableBudget(userId: string, budget: AgentBudget): boolean | Promise<boolean>;
}

/** Default budget policy: a session needs a positive iteration + cost budget. */
export const positiveBudgetOnly: BudgetPort = {
  hasAvailableBudget(_userId, budget) {
    return (
      Number.isFinite(budget.maxIterations) &&
      budget.maxIterations > 0 &&
      Number.isFinite(budget.costBudget) &&
      budget.costBudget > 0
    );
  },
};

// ---------------------------------------------------------------------------
// Resource-ownership seam (Task 23.1, Req 22.1/22.2)
// ---------------------------------------------------------------------------

/**
 * Resolves the owner (and tenant) of the resource an agent session acts upon —
 * its target repository. The runtime uses it to ENFORCE, at every step, that
 * the session principal is still authorized to act on that resource, applying
 * the cross-cutting ownership filter to agent TOOL ACTIONS (Req 22.1/22.2), not
 * only at `startTask` time. This is the defence-in-depth re-check that catches a
 * repo whose ownership changed after the session was created, or a session
 * pointed at a resource the principal does not own.
 *
 * When NO resolver is wired, step-level ownership re-checking is skipped (the
 * `startTask` write-scope gate and the QuantCode scoped tool APIs remain the
 * enforcement). Production wires a prisma-backed resolver of
 * `Repository.ownerId`.
 */
export interface ResourceOwnershipPort {
  resolveRepoOwner(
    repoId: string,
  ): Promise<{ ownerId: string; tenantId?: string } | null> | { ownerId: string; tenantId?: string } | null;
}

// ---------------------------------------------------------------------------
// Inputs / options
// ---------------------------------------------------------------------------

export interface StartTaskOptions {
  /** Iteration bound for the session. Defaults to {@link DEFAULT_MAX_ITERATIONS}. */
  maxIterations?: number;
  /** Credit budget for the session. Defaults to {@link DEFAULT_COST_BUDGET}. */
  costBudget?: number;
  /**
   * Prefix for the isolated agent branch. Defaults to `agent/`. The final
   * `branchRef` is `${branchPrefix}${sessionId}` and is always made distinct
   * from the repo's default branch.
   */
  branchPrefix?: string;
}

export interface AgentRuntimeOptions {
  /** Write-scope policy. Defaults to QuantCode's owner-only policy. */
  access?: RepoAccessPort;
  /** Budget-availability policy. Defaults to the positive-budget rule. */
  budget?: BudgetPort;
  /** Session-id generator seam (overridable in tests for determinism). */
  generateId?: () => string;
  /**
   * Tool-execution loop seam driven by {@link AgentRuntime.step}. Defaults to a
   * no-op loop that selects no tool (so a bare runtime finalizes the session on
   * the first step). The production wiring injects an adapter backed by
   * `@quant/ai` (`createAssistantToolExecutionLoop`).
   */
  loop?: ToolExecutionLoop;
  /**
   * Cross-cutting ownership filter (Task 23.1, Req 22.1/22.2/22.3). Decides
   * whether the session principal may act on the session's target resource;
   * defaults to {@link ownerOnlyAuthz} — the same owner-only rule the mail
   * domain enforces. Only consulted when {@link resourceOwnership} is wired.
   */
  authz?: OwnershipAuthzPort;
  /**
   * Resolver for the session resource's owner (Task 23.1). When wired, every
   * `step` re-checks that the session principal owns the target repo via {@link
   * authz} and FAILS CLOSED on a cross-owner/cross-tenant action. When omitted,
   * step-level ownership re-checking is skipped (the `startTask` gate + scoped
   * tool APIs remain the enforcement).
   */
  resourceOwnership?: ResourceOwnershipPort;
  /**
   * Optional observability span port (Task 23.1, Req 23.2). When wired, each
   * `step` emits an `agent.step` span; defaults to a no-op.
   */
  tracer?: SpanPort;
}

// ---------------------------------------------------------------------------
// step() result
// ---------------------------------------------------------------------------

/**
 * Outcome of a single {@link AgentRuntime.step} call:
 *   - `executed`  — a tool ran and the session advanced one iteration.
 *   - `completed` — the loop selected no further tool; the session was finalized
 *                   for human review.
 *   - `stopped`   — the iteration/cost bound was reached (or the session was
 *                   already terminal), so no further tool was executed.
 */
export type StepOutcome = 'executed' | 'completed' | 'stopped';

export interface StepResult {
  /** The session row after the step (with updated counters/status). */
  session: AgentSession;
  outcome: StepOutcome;
  /** The tool the loop selected this step (absent when none was selected). */
  toolCall?: ToolCall;
  /** The observation from executing the tool (absent when none ran). */
  observation?: Observation;
  /** The transcript entry appended for this step (absent for a terminal no-op). */
  transcript?: AgentTranscript;
  /** Human-readable reason a session was stopped/finalized. */
  reason?: string;
}

/** Default iteration bound when the caller does not specify one. */
export const DEFAULT_MAX_ITERATIONS = 10;
/** Default session cost budget (credits) when the caller does not specify one. */
export const DEFAULT_COST_BUDGET = 100;

const DEFAULT_BRANCH_PREFIX = 'agent/';

/**
 * A session is steppable only while it is actively planning or running. Once it
 * is awaiting human review or has terminated (done/failed/cancelled) the loop
 * stops — `step` becomes a no-op that reports `stopped`.
 */
function isSteppable(status: string): boolean {
  return status === 'PLANNING' || status === 'RUNNING';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AgentRuntime {
  private readonly access: RepoAccessPort;
  private readonly budget: BudgetPort;
  private readonly generateId: () => string;
  private readonly loop: ToolExecutionLoop;
  private readonly authz: OwnershipAuthzPort;
  private readonly resourceOwnership?: ResourceOwnershipPort;
  private readonly tracer: SpanPort;

  constructor(
    private readonly prisma: PrismaClient,
    options: AgentRuntimeOptions = {},
  ) {
    this.access = options.access ?? ownerOnlyAccess;
    this.budget = options.budget ?? positiveBudgetOnly;
    this.loop = options.loop ?? noopToolExecutionLoop;
    this.authz = options.authz ?? ownerOnlyAuthz;
    this.resourceOwnership = options.resourceOwnership;
    this.tracer = options.tracer ?? noopSpanPort;
    this.generateId =
      options.generateId ??
      (() => {
        // Lazy, dependency-free unique id. `crypto.randomUUID` is available in
        // the Node runtime this backend targets.
        return globalThis.crypto.randomUUID();
      });
  }

  /**
   * Start an autonomous coding task against a repository.
   *
   * Enforces the write-scope and budget preconditions, then creates an
   * `AgentSession` with status `PLANNING` on an isolated agent branch.
   *
   * @throws 400 INSTRUCTION_REQUIRED  when `instruction` is empty/whitespace.
   * @throws 404 REPO_NOT_FOUND        when the repo does not exist.
   * @throws 403 WRITE_SCOPE_REQUIRED  when the caller lacks write scope.
   * @throws 402 BUDGET_REQUIRED       when no budget is available.
   */
  async startTask(
    userId: string,
    repoId: string,
    instruction: string,
    options: StartTaskOptions = {},
  ): Promise<AgentSession> {
    // ----- 0. Validate the instruction ------------------------------------
    if (typeof instruction !== 'string' || instruction.trim().length === 0) {
      throw createAppError(
        'An agent task requires a non-empty instruction',
        400,
        'INSTRUCTION_REQUIRED',
      );
    }

    // ----- 1. Resolve repo -------------------------------------------------
    const repo: Repository | null = await this.prisma.repository.findUnique({
      where: { id: repoId },
    });
    if (!repo) {
      throw createAppError('Repository not found', 404, 'REPO_NOT_FOUND');
    }

    // ----- 2. WRITE-SCOPE GATE (Requirement 7.1) ---------------------------
    const writeAllowed = await this.access.hasWriteScope(repo, userId);
    if (!writeAllowed) {
      throw createAppError(
        'Write scope required to start an agent task on this repository',
        403,
        'WRITE_SCOPE_REQUIRED',
      );
    }

    // ----- 3. BUDGET GATE (Requirement 7.1) --------------------------------
    const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
    const costBudget = options.costBudget ?? DEFAULT_COST_BUDGET;
    const budgetAvailable = await this.budget.hasAvailableBudget(userId, {
      maxIterations,
      costBudget,
    });
    if (!budgetAvailable) {
      throw createAppError(
        'An available budget (positive iteration and cost budget) is required to start an agent task',
        402,
        'BUDGET_REQUIRED',
      );
    }

    // ----- 4. Derive an ISOLATED branch (Requirement 7.2) ------------------
    // branchRef is built from the session id and guaranteed != defaultBranch so
    // the agent can never be pointed at the repository's base branch.
    const sessionId = this.generateId();
    const branchRef = this.isolatedBranchRef(
      sessionId,
      options.branchPrefix ?? DEFAULT_BRANCH_PREFIX,
      repo.defaultBranch,
    );

    // ----- 5. Create the session in 'planning' status ----------------------
    const session = await this.prisma.agentSession.create({
      data: {
        id: sessionId,
        userId,
        repoId: repo.id,
        instruction,
        status: 'PLANNING',
        branchRef,
        maxIterations,
        iterationCount: 0,
        costBudget,
        costSpent: 0,
        linkedPrId: null,
      },
    });

    return session;
  }

  /**
   * Run ONE iteration of the agent's bounded tool-execution loop
   * (design §"PROCEDURE step"): SELECT a tool → EXECUTE it → OBSERVE the result
   * → append an auditable transcript entry → advance the iteration counter.
   *
   * Invariants enforced here (Requirements 7.2–7.4):
   *   - 7.3 BOUNDED AUTONOMY: `iterationCount <= maxIterations` always holds. If
   *     the bound is already reached (or the session is otherwise non-steppable)
   *     NO further tool runs and the session is stopped (status
   *     `AWAITING_REVIEW`). After an iteration runs, reaching the bound stops the
   *     session too — so the counter can never exceed `maxIterations`.
   *   - 7.2 BRANCH ISOLATION: if the executed tool reports a file mutation on any
   *     branch other than `session.branchRef`, the step FAILS CLOSED — the
   *     attempt is recorded, the session is marked `FAILED`, and the runtime
   *     throws. No mutation off the agent branch is ever accepted.
   *   - 7.4 AUDITABILITY: every step appends an `AgentTranscript` entry with a
   *     monotonic `seq`, the tool name, an auditable payload, and tokens used.
   *
   * @throws 404 SESSION_NOT_FOUND            when the session does not exist.
   * @throws 403 OWNERSHIP_AUTHZ_DENIED       when the session principal is not
   *   authorized to act on the session's target resource (when an ownership
   *   resolver is wired).
   * @throws 409 BRANCH_ISOLATION_VIOLATION   when a tool mutates off-branch.
   */
  async step(sessionId: string): Promise<StepResult> {
    // Every agent step emits a span (Req 23.2). The span ends `error` if the
    // step throws (branch-isolation / ownership / not-found) and `ok` otherwise.
    return withSpan(
      this.tracer,
      'agent.step',
      { 'agent.session_id': sessionId },
      async (span) => {
        const result = await this.stepInner(sessionId);
        span.setAttributes({
          'agent.outcome': result.outcome,
          'agent.iteration_count': result.session.iterationCount,
          'agent.status': result.session.status,
          ...(result.toolCall ? { 'agent.tool': result.toolCall.toolName } : {}),
        });
        return result;
      },
    );
  }

  private async stepInner(sessionId: string): Promise<StepResult> {
    // ----- 0. Load the session --------------------------------------------
    const session = await this.prisma.agentSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw createAppError('Agent session not found', 404, 'SESSION_NOT_FOUND');
    }

    // ----- 1a. Terminal / non-steppable sessions stop immediately ----------
    if (!isSteppable(session.status)) {
      return {
        session,
        outcome: 'stopped',
        reason: `session is ${session.status}`,
      };
    }

    // ----- 1b. INVARIANT (Req 7.3): never exceed the iteration bound -------
    // If the bound is already reached, stop the session and run no further
    // tool. This keeps `iterationCount <= maxIterations` by construction.
    if (session.iterationCount >= session.maxIterations) {
      const stopped = await this.transition(session.id, 'AWAITING_REVIEW');
      return { session: stopped, outcome: 'stopped', reason: 'maxIterations reached' };
    }

    const state: AgentStepState = {
      sessionId: session.id,
      userId: session.userId,
      repoId: session.repoId,
      instruction: session.instruction,
      branchRef: session.branchRef,
      iterationCount: session.iterationCount,
      maxIterations: session.maxIterations,
    };

    // ----- 1c. OWNERSHIP FILTER on the tool action (Req 22.1/22.2) ---------
    // Re-check, every step, that the session principal is still authorized to
    // act on the session's target resource via the inherited mail-domain
    // ownership filter. FAILS CLOSED (records the rejection, marks the session
    // FAILED, throws 403) on a cross-owner/cross-tenant action. Skipped when no
    // ownership resolver is wired (startTask gate + scoped tool APIs enforce).
    await this.assertResourceOwnership(session);

    // ----- 2. SELECT a tool for this iteration -----------------------------
    const call = await this.loop.selectTool(state);
    if (!call) {
      // Plan complete — record a MESSAGE entry and finalize for human review.
      await this.appendTranscript(session.id, {
        role: 'MESSAGE',
        toolName: null,
        payload: { note: 'no tool selected; plan complete' },
        tokensUsed: 0,
      });
      const stopped = await this.transition(session.id, 'AWAITING_REVIEW');
      return { session: stopped, outcome: 'completed', reason: 'no tool selected' };
    }

    // ----- 3. EXECUTE + OBSERVE -------------------------------------------
    const observation = await this.loop.execute(call, state);

    // ----- 3a. INVARIANT (Req 7.2): mutations only on the agent branch -----
    if (observation.mutatedBranch != null && observation.mutatedBranch !== session.branchRef) {
      await this.appendTranscript(session.id, {
        role: 'OBSERVATION',
        toolName: call.toolName,
        payload: {
          rejected: true,
          reason: 'branch isolation violation',
          attemptedBranch: observation.mutatedBranch,
          allowedBranch: session.branchRef,
        },
        tokensUsed: observation.tokensUsed ?? 0,
      });
      await this.transition(session.id, 'FAILED');
      throw createAppError(
        `Agent attempted to mutate '${observation.mutatedBranch}' but is confined to its agent branch '${session.branchRef}'`,
        409,
        'BRANCH_ISOLATION_VIOLATION',
      );
    }

    // ----- 4. APPEND an auditable transcript entry (Req 7.4) ---------------
    const transcript = await this.appendTranscript(session.id, {
      role: call.role ?? 'TOOL_CALL',
      toolName: call.toolName,
      payload: {
        args: call.args,
        ok: observation.ok,
        output: observation.output ?? null,
        error: observation.error ?? null,
        mutatedFiles: observation.mutatedFiles ?? [],
        // The mutation (if any) is on the agent branch — asserted just above.
        mutatedBranch: observation.mutatedBranch ?? null,
      },
      tokensUsed: observation.tokensUsed ?? 0,
    });

    // ----- 5. Advance counters + enforce the bound on the way out ----------
    const iterationCount = session.iterationCount + 1;
    const costSpent = session.costSpent + (observation.costDelta ?? 0);

    // A live session is RUNNING once its first tool executes.
    let status: AgentSessionStatus =
      session.status === 'PLANNING' ? 'RUNNING' : (session.status as AgentSessionStatus);
    let reason: string | undefined;
    if (observation.done) {
      status = 'AWAITING_REVIEW';
      reason = 'agent reported completion';
    } else if (iterationCount >= session.maxIterations) {
      // INVARIANT (Req 7.3): bound reached — stop so the count can't grow past it.
      status = 'AWAITING_REVIEW';
      reason = 'maxIterations reached';
    } else if (costSpent >= session.costBudget) {
      status = 'AWAITING_REVIEW';
      reason = 'cost budget exhausted';
    }

    const updated = await this.prisma.agentSession.update({
      where: { id: session.id },
      data: { iterationCount, costSpent, status },
    });

    return {
      session: updated,
      outcome: reason ? 'stopped' : 'executed',
      toolCall: call,
      observation,
      transcript,
      reason,
    };
  }

  /** Set a session's status and return the updated row. */
  private transition(sessionId: string, status: AgentSessionStatus): Promise<AgentSession> {
    return this.prisma.agentSession.update({
      where: { id: sessionId },
      data: { status },
    });
  }

  /**
   * Enforce the cross-cutting ownership filter on a step's tool action
   * (Req 22.1/22.2): resolve the session resource's owner and confirm the
   * session principal is authorized via the inherited mail-domain ownership
   * rule. A no-op when no {@link ResourceOwnershipPort} is wired. FAILS CLOSED
   * on a denial (and on an unresolvable resource): records an auditable
   * rejection, marks the session `FAILED`, and throws 403.
   *
   * @throws 403 OWNERSHIP_AUTHZ_DENIED  when the principal is not authorized to
   *   act on the resource, or the resource owner cannot be resolved.
   */
  private async assertResourceOwnership(session: AgentSession): Promise<void> {
    if (!this.resourceOwnership) return;

    const owner = await this.resourceOwnership.resolveRepoOwner(session.repoId);

    // The session principal owns its own tenant boundary by convention (the
    // user is the tenant), mirroring how the agent tools default tenantId to
    // the acting user.
    const principal: OwnershipPrincipal = {
      principalId: session.userId,
      tenantId: session.userId,
    };
    const resource: OwnedResource = {
      ownerId: owner?.ownerId ?? '',
      tenantId: owner?.tenantId,
      kind: 'repository',
      resourceId: session.repoId,
    };

    if (!owner || !this.authz.isAuthorized(principal, resource)) {
      await this.appendTranscript(session.id, {
        role: 'OBSERVATION',
        toolName: null,
        payload: {
          rejected: true,
          reason: 'ownership authorization denied',
          principal: session.userId,
          resourceOwner: owner?.ownerId ?? null,
          repoId: session.repoId,
        },
        tokensUsed: 0,
      });
      await this.transition(session.id, 'FAILED');
      throw createAppError(
        `Agent session principal '${session.userId}' is not authorized to act on repository '${session.repoId}'`,
        403,
        'OWNERSHIP_AUTHZ_DENIED',
      );
    }
  }

  /**
   * Append a transcript entry with the next monotonic per-session `seq`
   * (Requirement 7.4). `seq` starts at 1 and increases by one per entry; the
   * `@@unique([sessionId, seq])` constraint guards against duplicates.
   */
  private async appendTranscript(
    sessionId: string,
    entry: {
      role: AgentTranscriptRole;
      toolName: string | null;
      payload: Record<string, unknown>;
      tokensUsed: number;
    },
  ): Promise<AgentTranscript> {
    const last = await this.prisma.agentTranscript.findFirst({
      where: { sessionId },
      orderBy: { seq: 'desc' },
    });
    const seq = (last?.seq ?? 0) + 1;

    return this.prisma.agentTranscript.create({
      data: {
        sessionId,
        seq,
        role: entry.role,
        toolName: entry.toolName,
        payload: entry.payload as never,
        tokensUsed: entry.tokensUsed,
      },
    });
  }

  /**
   * Build an isolated agent branch ref from a session id, guaranteeing it
   * differs from the repository's default branch (Requirement 7.2 invariant).
   * The `agent/<uuid>` shape cannot collide with a normal default branch in
   * practice; the explicit guard makes the invariant hold by construction even
   * in a pathological configuration.
   */
  private isolatedBranchRef(
    sessionId: string,
    branchPrefix: string,
    defaultBranch: string,
  ): string {
    const ref = `${branchPrefix}${sessionId}`;
    return ref === defaultBranch ? `${ref}-session` : ref;
  }
}
