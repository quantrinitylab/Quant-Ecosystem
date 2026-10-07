// ============================================================================
// Agent module — QuantCode-scoped agent tools + human-gated PR landing (Pillar 3)
// quantmail-superhub · Task 12.4 (Requirements 7.5, 7.6)
// ============================================================================
//
// PURPOSE
//   Defines the five concrete tools the bounded Agent Runtime may invoke and
//   confines EVERY side-effect to the QuantCode module's scoped public APIs
//   (consumed via the `modules/code` barrel — never by reaching into
//   `modules/code/services/*`). This is the implementation of the design
//   invariant (design §"INTERFACE ToolExecutionLoop"):
//
//       PROCEDURE execute(ToolCall) RETURNS Observation
//         POSTCONDITION: side effects confined to the QuantCode module's scoped APIs
//
//   The five tools (design §"FUNCTION availableTools()"):
//     - read_file   (read-only)  — read a file at the agent branch
//     - search_repo (read-only)  — search the repo at the agent branch
//     - edit_file   (write)      — push an edit to the AGENT branch via GitService
//     - open_pr     (write)      — open a PR from the agent branch to the base
//                                  (NEVER merges — leaves it OPEN for a human)
//     - run_ci      (write)      — trigger a pipeline + report status; on a
//                                  failing run, propose a fix via ai-ci-fix
//
//   SAFETY INVARIANTS ENFORCED HERE
//   --------------------------------------------------------------------------
//   * BRANCH ISOLATION (Req 7.2, reinforced by the 12.2 runtime guard): every
//     mutating tool writes ONLY to `state.branchRef` (the isolated agent
//     branch). `edit_file` derives its ref from the agent branch and reports
//     `mutatedBranch = <agent branch>` so the runtime's isolation guard passes;
//     no tool ever derives a ref from, or writes to, the repo's default branch.
//
//   * HUMAN-GATED MERGE (Req 7.5): NO tool calls a merge API. `open_pr` creates
//     an OPEN pull request and (read-only) consults `MergeEligibilityService`
//     purely to INFORM the human reviewer — the actual merge stays a human
//     action (the QuantCode `mergePR` endpoint, triggered by a person). The
//     tool signals `done` so the runtime parks the session in `AWAITING_REVIEW`
//     until a human acts.
//
//   * SCOPED SIDE-EFFECTS (Req 7.6): writes/pushes go through `GitService`,
//     PRs through `PullRequestService`, CI through `PipelineService`, all from
//     the QuantCode barrel. Failing-pipeline remediation is wired through
//     `ai-ci-fix.service.ts` (injected behind a structural port) which only
//     PROPOSES a fix the agent can apply on its branch — it never merges.
//
//   The tools surface iteration metadata (`mutatedBranch`, `mutatedFiles`,
//   `done`, `tokensUsed`, `costDelta`) on the `AIToolResult.data` object; the
//   `createAssistantToolExecutionLoop` adapter (Task 12.2) lifts those onto the
//   `Observation` the runtime consumes.

import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { QuantApp } from '@quant/common';
import { ToolRegistry } from '@quant/ai';
import type { AITool, AIToolResult, AssistantContext } from '@quant/ai';
// QuantCode public surface (SRP boundary): every code side-effect flows through
// these scoped services imported from the module barrel.
import {
  GitService,
  PullRequestService,
  PipelineService,
  MergeEligibilityService,
} from '../../code';
// Human-approval gate (Task 22.1): the OPTIONAL seam through which `open_pr`
// records a PENDING merge `AgentActionAudit`, so a merge stays pending until a
// human approves it (Req 14.1, 14.3). Imported as a structural port only — the
// concrete `AgentApprovalGate` is injected by the caller.
import type { MergeApprovalPort } from './approval-gating.service';

// ---------------------------------------------------------------------------
// Injectable ports / dependencies
// ---------------------------------------------------------------------------

/**
 * Failing-pipeline remediation seam (Req 7.6). `ai-ci-fix.service.ts`'s
 * `AICIFixService` satisfies this structurally — production injects the real
 * service so a failing `run_ci` can propose a fix the agent applies on its
 * branch. The port returns a *suggestion only*; it never mutates code or merges.
 */
export interface CiFixSuggestion {
  diagnosis: string;
  rootCause: string;
  suggestedFix: string;
  confidence: number;
}

export interface CiFixPort {
  suggestFix(
    input: { logs: string; sourceCode?: string; jobName?: string },
    userId: string,
  ): Promise<CiFixSuggestion>;
}

/**
 * Read seam for the read-only tools (`read_file`, `search_repo`). Repo content
 * lives in the `git-server` infra service, so reads are abstracted behind this
 * port (production wires a git-server-backed reader). The default is a safe
 * no-op that reports "not wired" rather than fabricating content — keeping the
 * read tools honest and offline-testable. Reads never mutate state.
 */
export interface RepoReadPort {
  readFile(input: {
    repoId: string;
    ref: string;
    path: string;
  }): Promise<{ found: boolean; content: string }>;
  search(input: {
    repoId: string;
    ref: string;
    query: string;
  }): Promise<Array<{ path: string; snippet: string }>>;
}

/** Default reader: returns no content (production swaps a git-server reader). */
export const noopRepoReader: RepoReadPort = {
  async readFile() {
    return { found: false, content: '' };
  },
  async search() {
    return [];
  },
};

/** Everything the QuantCode-scoped agent tools need, all via scoped APIs. */
export interface QuantCodeAgentToolDeps {
  /** Used only to resolve neutral repo metadata (the base/default branch). */
  prisma: PrismaClient;
  /** Ref transport — the ONLY write path for edits (agent branch only). */
  git: GitService;
  /** PR creation — opens an OPEN PR; never merges. */
  pullRequests: PullRequestService;
  /** CI trigger/status. */
  pipelines: PipelineService;
  /** Read-only merge informer surfaced to the human reviewer. */
  mergeEligibility: MergeEligibilityService;
  /** Failing-pipeline remediation (ai-ci-fix.service.ts). Optional. */
  ciFix?: CiFixPort;
  /** Read seam for read_file/search_repo. Defaults to {@link noopRepoReader}. */
  repoReader?: RepoReadPort;
  /**
   * OPTIONAL human-approval gate (Task 22.1). When provided, `open_pr` records a
   * PENDING merge `AgentActionAudit` so the resulting merge stays pending until
   * a human (CEO/owner) approves it (Req 14.1, 14.3). The agent still NEVER
   * merges — this only audits the to-be-approved merge alongside the OPEN PR.
   */
  approvalGate?: MergeApprovalPort;
  /**
   * Resolve a repo's base (default) branch. Defaults to a prisma lookup of
   * `Repository.defaultBranch`. `open_pr` targets this when no explicit
   * `targetBranch` is provided.
   */
  resolveBaseBranch?: (repoId: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The agent scope a tool acts within, lifted from the assistant context. */
interface AgentScope {
  repoId: string;
  /** The isolated agent branch (short name) — the ONLY writable branch. */
  branchRef: string;
  sessionId?: string;
  /** Tenant for audit scoping; defaults to the acting user (user owns tenant). */
  tenantId?: string;
  /** Company-OS org id, when the agent runs inside an org. */
  orgId?: string;
  /** The acting worker id, when the agent runs inside an org. */
  workerId?: string;
}

/**
 * Extract the agent scope the runtime threaded onto `context.crossAppState`
 * (see `createAssistantToolExecutionLoop`). A tool with no agent scope is a
 * misconfiguration — the tools fail closed rather than guess a branch.
 */
function agentScope(context: AssistantContext): AgentScope {
  const state = (context.crossAppState ?? {}) as Record<string, unknown>;
  const repoId = typeof state['repoId'] === 'string' ? (state['repoId'] as string) : '';
  const branchRef = typeof state['branchRef'] === 'string' ? (state['branchRef'] as string) : '';
  const sessionId =
    typeof state['agentSessionId'] === 'string' ? (state['agentSessionId'] as string) : undefined;
  const tenantId = typeof state['tenantId'] === 'string' ? (state['tenantId'] as string) : undefined;
  const orgId = typeof state['orgId'] === 'string' ? (state['orgId'] as string) : undefined;
  const workerId = typeof state['workerId'] === 'string' ? (state['workerId'] as string) : undefined;
  return { repoId, branchRef, sessionId, tenantId, orgId, workerId };
}

/** Build the full ref for a short branch name (`x` → `refs/heads/x`). */
function toHeadRef(branch: string): string {
  return branch.startsWith('refs/heads/') ? branch : `refs/heads/${branch}`;
}

/** Resolve a short branch name from a possibly-full ref. */
function toShortBranch(ref: string): string {
  return ref.startsWith('refs/heads/') ? ref.slice('refs/heads/'.length) : ref;
}

/** Deterministic content sha used when the planner does not supply a commit sha. */
function contentSha(path: string, content: string): string {
  return createHash('sha1').update(`${path}\0${content}`).digest('hex');
}

/** CI run statuses that mean the pipeline failed (trigger remediation). */
const FAILING_CI_STATUSES = new Set(['FAILED', 'FAILURE', 'ERROR', 'CANCELLED']);

function readString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/**
 * Build the five QuantCode-scoped agent tools. Each tool's side-effects flow
 * exclusively through the QuantCode scoped services in {@link deps}; reads flow
 * through the {@link RepoReadPort} seam. No tool merges.
 */
export function createQuantCodeAgentTools(deps: QuantCodeAgentToolDeps): AITool[] {
  const reader = deps.repoReader ?? noopRepoReader;
  const resolveBaseBranch =
    deps.resolveBaseBranch ??
    (async (repoId: string) => {
      const repo = await deps.prisma.repository.findUnique({ where: { id: repoId } });
      return repo?.defaultBranch ?? 'main';
    });

  // -------- read_file (read-only) ------------------------------------------
  const readFile: AITool = {
    name: 'read_file',
    description: 'Read the contents of a file in the repository at the agent branch.',
    parameters: {
      path: { type: 'string', description: 'Repo-relative file path to read', required: true },
    },
    async handler(args, context): Promise<AIToolResult> {
      const { repoId, branchRef } = agentScope(context);
      const path = readString(args, 'path');
      if (!repoId || !branchRef) {
        return {
          success: false,
          error: 'MISSING_AGENT_SCOPE',
          displayMessage: 'read_file requires an active agent session scope.',
        };
      }
      if (!path) {
        return {
          success: false,
          error: 'PATH_REQUIRED',
          displayMessage: 'read_file requires a file path.',
        };
      }
      const result = await reader.readFile({ repoId, ref: toHeadRef(branchRef), path });
      return {
        success: result.found,
        // Read-only: no mutatedBranch/mutatedFiles → the runtime treats this as
        // a non-mutating observation.
        data: { path, found: result.found, content: result.content, mutatedBranch: undefined },
        error: result.found ? undefined : 'FILE_NOT_FOUND',
        displayMessage: result.found
          ? `Read ${path} from ${branchRef}.`
          : `File ${path} was not found on ${branchRef}.`,
      };
    },
  };

  // -------- search_repo (read-only) ----------------------------------------
  const searchRepo: AITool = {
    name: 'search_repo',
    description: 'Search the repository contents at the agent branch for a query string.',
    parameters: {
      query: { type: 'string', description: 'Text/code to search for', required: true },
    },
    async handler(args, context): Promise<AIToolResult> {
      const { repoId, branchRef } = agentScope(context);
      const query = readString(args, 'query');
      if (!repoId || !branchRef) {
        return {
          success: false,
          error: 'MISSING_AGENT_SCOPE',
          displayMessage: 'search_repo requires an active agent session scope.',
        };
      }
      if (!query) {
        return {
          success: false,
          error: 'QUERY_REQUIRED',
          displayMessage: 'search_repo requires a query.',
        };
      }
      const matches = await reader.search({ repoId, ref: toHeadRef(branchRef), query });
      return {
        success: true,
        data: { query, matches, mutatedBranch: undefined },
        displayMessage: `Found ${matches.length} match(es) for "${query}" on ${branchRef}.`,
      };
    },
  };

  // -------- edit_file (write — agent branch ONLY) --------------------------
  const editFile: AITool = {
    name: 'edit_file',
    description:
      'Apply an edit to a file and push it to the isolated agent branch (never the base branch).',
    parameters: {
      path: { type: 'string', description: 'Repo-relative file path to write', required: true },
      content: { type: 'string', description: 'New full file contents', required: true },
      message: { type: 'string', description: 'Commit message', required: false },
      newSha: {
        type: 'string',
        description: 'Resulting commit SHA (derived from content if omitted)',
        required: false,
      },
    },
    async handler(args, context): Promise<AIToolResult> {
      const { repoId, branchRef } = agentScope(context);
      const path = readString(args, 'path');
      const content = typeof args['content'] === 'string' ? (args['content'] as string) : undefined;
      if (!repoId || !branchRef) {
        return {
          success: false,
          error: 'MISSING_AGENT_SCOPE',
          displayMessage: 'edit_file requires an active agent session scope.',
        };
      }
      if (!path || content === undefined) {
        return {
          success: false,
          error: 'PATH_AND_CONTENT_REQUIRED',
          displayMessage: 'edit_file requires a path and content.',
        };
      }

      // SAFETY: the ref is derived from the AGENT branch only — never the base.
      const ref = toHeadRef(branchRef);
      const newSha = readString(args, 'newSha') ?? contentSha(path, content);

      // Side-effect flows exclusively through the QuantCode GitService, which
      // also enforces write-scope + branch protection.
      const result = await deps.git.pushRefs(context.userId, repoId, [{ ref, newSha }]);
      const outcome = result.updates[0];

      if (!result.ok || !outcome || outcome.status !== 'advanced') {
        return {
          success: false,
          error: 'PUSH_REJECTED',
          // No mutatedBranch on a rejected push.
          data: { path, rejected: true, reason: outcome?.reason ?? 'push rejected' },
          displayMessage: `Could not write ${path}: ${outcome?.reason ?? 'push rejected'}.`,
        };
      }

      return {
        success: true,
        data: {
          path,
          newSha: outcome.newSha,
          mutatedFiles: [path],
          // Report the agent branch so the runtime's isolation guard passes.
          mutatedBranch: outcome.branch,
        },
        displayMessage: `Wrote ${path} on ${outcome.branch}.`,
      };
    },
  };

  // -------- open_pr (write — opens an OPEN PR, NEVER merges) ----------------
  const openPr: AITool = {
    name: 'open_pr',
    description:
      'Open a pull request from the agent branch to the base branch for human review. Does NOT merge.',
    parameters: {
      title: { type: 'string', description: 'Pull request title', required: true },
      body: { type: 'string', description: 'Pull request description', required: false },
      targetBranch: {
        type: 'string',
        description: 'Base branch to merge into (defaults to the repo default branch)',
        required: false,
      },
    },
    async handler(args, context): Promise<AIToolResult> {
      const { repoId, branchRef, tenantId, orgId, workerId } = agentScope(context);
      const title = readString(args, 'title');
      if (!repoId || !branchRef) {
        return {
          success: false,
          error: 'MISSING_AGENT_SCOPE',
          displayMessage: 'open_pr requires an active agent session scope.',
        };
      }
      if (!title) {
        return {
          success: false,
          error: 'TITLE_REQUIRED',
          displayMessage: 'open_pr requires a title.',
        };
      }

      const sourceBranch = toShortBranch(branchRef);
      const targetBranch = readString(args, 'targetBranch') ?? (await resolveBaseBranch(repoId));

      // Never open a PR from the agent branch onto itself.
      if (targetBranch === sourceBranch) {
        return {
          success: false,
          error: 'INVALID_BASE_BRANCH',
          displayMessage: 'open_pr cannot target the agent branch itself.',
        };
      }

      // Scoped side-effect: create an OPEN PR. The agent NEVER calls mergePR —
      // the merge is a human action (Req 7.5).
      const pr = await deps.pullRequests.createPR({
        repoId,
        title,
        body: readString(args, 'body'),
        authorId: context.userId,
        sourceBranch,
        targetBranch,
      });

      // INFORM the human reviewer of merge readiness (read-only; does NOT merge).
      const decision = await deps.mergeEligibility.evaluateMergeEligibility(pr.id);

      // HUMAN-APPROVAL GATE (Task 22.1, Req 14.1/14.3): when a gate is wired,
      // record a PENDING merge `AgentActionAudit` so the resulting merge stays
      // pending until a human (CEO/owner) approves it. The agent never merges;
      // this only audits the to-be-approved merge alongside the OPEN PR.
      let mergeAuditId: string | undefined;
      if (deps.approvalGate) {
        const audit = await deps.approvalGate.requestApproval({
          tenantId: tenantId ?? context.userId,
          actionType: 'MERGE',
          targetRef: pr.id,
          orgId: orgId ?? null,
          actorWorkerId: workerId ?? null,
          sensitivity: 'HIGH',
          metadata: {
            prNumber: pr.number,
            sourceBranch,
            targetBranch,
            mergeable: decision.mergeable,
          },
        });
        mergeAuditId = audit.id;
      }

      return {
        success: true,
        data: {
          prId: pr.id,
          number: pr.number,
          sourceBranch,
          targetBranch,
          status: pr.status,
          mergeDecision: decision,
          // The pending human-approval audit for the eventual merge (if wired).
          mergeAuditId,
          // The session is parked for human review; the agent does not merge.
          done: true,
          // No file mutation here → no mutatedBranch.
        },
        displayMessage:
          `Opened PR #${pr.number} from ${sourceBranch} into ${targetBranch}. ` +
          `Merge requires explicit human approval` +
          (decision.mergeable ? ' (currently eligible).' : `: ${decision.reasons.join('; ')}.`),
      };
    },
  };

  // -------- run_ci (write — triggers a pipeline; remediates failures) ------
  const runCi: AITool = {
    name: 'run_ci',
    description:
      'Trigger a CI pipeline on the agent branch and report its status. On failure, proposes a fix.',
    parameters: {
      prId: { type: 'string', description: 'PR to associate the run with', required: false },
      commitSha: { type: 'string', description: 'Commit SHA to build', required: false },
      ref: {
        type: 'string',
        description: 'Ref to build (defaults to the agent branch)',
        required: false,
      },
      logs: {
        type: 'string',
        description: 'CI logs to analyze for remediation when the run has failed',
        required: false,
      },
      jobName: { type: 'string', description: 'Failing job name (for remediation)', required: false },
    },
    async handler(args, context): Promise<AIToolResult> {
      const { repoId, branchRef } = agentScope(context);
      if (!repoId || !branchRef) {
        return {
          success: false,
          error: 'MISSING_AGENT_SCOPE',
          displayMessage: 'run_ci requires an active agent session scope.',
        };
      }

      // Default to the AGENT branch — CI never targets the base on the agent's behalf.
      const ref = readString(args, 'ref') ?? toHeadRef(branchRef);
      const run = await deps.pipelines.triggerPipeline(repoId, ref, {
        type: 'AGENT',
        triggeredBy: context.userId,
        prId: readString(args, 'prId'),
        commitSha: readString(args, 'commitSha'),
      });

      const status = await deps.pipelines.getRunStatus(run.id);

      // Failing-pipeline remediation (Req 7.6): propose a fix the agent can
      // apply on its branch in a later edit_file step. NEVER auto-merges.
      let remediation: CiFixSuggestion | undefined;
      if (FAILING_CI_STATUSES.has(status.status) && deps.ciFix) {
        const logs =
          readString(args, 'logs') ??
          `CI run ${status.runId} on ${status.branch} failed with status ${status.status}. ` +
            `Jobs: ${status.jobs.map((j) => `${j.name}=${j.status}`).join(', ')}`;
        const fix = await deps.ciFix.suggestFix(
          { logs, jobName: readString(args, 'jobName') },
          context.userId,
        );
        remediation = fix;
      }

      return {
        success: true,
        data: {
          runId: status.runId,
          status: status.status,
          branch: status.branch,
          jobs: status.jobs,
          remediation,
          // run_ci does not mutate working-tree files → no mutatedBranch.
        },
        displayMessage:
          `CI run ${status.runId} on ${status.branch} is ${status.status}.` +
          (remediation ? ' A remediation suggestion is available.' : ''),
      };
    },
  };

  return [readFile, searchRepo, editFile, openPr, runCi];
}

// ---------------------------------------------------------------------------
// Registry wiring
// ---------------------------------------------------------------------------

/** App namespace the agent's QuantCode tools register under. */
export const AGENT_TOOLS_APP: QuantApp = 'quantmail';

/**
 * Build a {@link ToolRegistry} containing ONLY the QuantCode-scoped agent tools,
 * registered under {@link AGENT_TOOLS_APP}. Pair this with an `ActionExecutor`
 * and `createAssistantToolExecutionLoop` (Task 12.2) so `AgentRuntime.step` can
 * select + execute these tools, with every side-effect confined to QuantCode.
 */
export function buildQuantCodeAgentToolRegistry(
  deps: QuantCodeAgentToolDeps,
  app: QuantApp = AGENT_TOOLS_APP,
): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerApp(app, createQuantCodeAgentTools(deps));
  return registry;
}

/**
 * Register the QuantCode-scoped agent tools onto an existing {@link ToolRegistry}.
 */
export function registerQuantCodeAgentTools(
  registry: ToolRegistry,
  deps: QuantCodeAgentToolDeps,
  app: QuantApp = AGENT_TOOLS_APP,
): void {
  registry.registerApp(app, createQuantCodeAgentTools(deps));
}
