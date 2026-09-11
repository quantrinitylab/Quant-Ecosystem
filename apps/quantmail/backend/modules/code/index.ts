// ============================================================================
// QuantCode module — SRP-extracted developer platform (Pillar 2)
// quantmail-superhub · Task 9.1 (Requirements 6.1, 6.2)
// ============================================================================
//
// PURPOSE
//   Groups the developer-platform concern (repos, pull-requests, issues, code
//   review, branch protection, and CI) into a single cohesive module mounted
//   under the canonical `/api/code/*` route prefix (Requirement 6.1). The repo
//   /PR/issue/review/branch-protection services and the git/pull-requests/
//   issues/reviews/ci route handlers all live under `modules/code/` so the
//   developer platform is independently testable and independently extractable
//   later (design AD-1 / AD-2).
//
// MODULE BOUNDARY CONTRACT (Requirement 6.2 — enforced structurally)
//   * The QuantCode module MUST NOT import any mail-domain service
//     (email/thread/folder/contact/attachment/outbound/inbound/etc.).
//   * The mail domain MUST NOT import any QuantCode service; mail code must go
//     through this module's public surface (the exports below) or its HTTP API,
//     never reach into `modules/code/services/*` directly.
//   The two domains share only neutral packages (`@quant/server-core`,
//   `@prisma/client`, `zod`). Task 9.2 adds an automated test asserting no
//   cross-imports exist in either direction.
//
// BEHAVIOR PRESERVATION
//   The module is mounted twice: once at the canonical `/api/code` prefix and
//   once at the legacy `/api/v1` prefix, so every endpoint that previously
//   existed at `/api/v1/git/*` and `/api/v1/:owner/:name/ci/*` keeps responding
//   at exactly the same path (backward-compatibility alias) while the canonical
//   QuantCode surface becomes available under `/api/code/*`.

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import gitRoutes from './routes/git';
import gitTransportRoutes from './routes/git-transport';
import pullRequestRoutes from './routes/pull-requests';
import reviewRoutes from './routes/reviews';
import issueRoutes from './routes/issues';
import ciRoutes from './routes/ci';

// ---------------------------------------------------------------------------
// Public service surface of the QuantCode module. Consumers that legitimately
// need a QuantCode service (e.g. the Agent Runtime in Pillar 3) import it from
// the module barrel — never by reaching into `modules/code/services/*`.
// ---------------------------------------------------------------------------
export {
  PullRequestService,
  CreatePRInputSchema,
  MergePRInputSchema,
} from './services/pr.service';
export type { CreatePRInput, MergePRInput, PRFilters } from './services/pr.service';

export {
  ReviewService,
  SubmitReviewInputSchema,
  AddCommentInputSchema,
} from './services/review.service';

export {
  MergeEligibilityService,
} from './services/merge-eligibility.service';
export type {
  MergeDecision,
  MergeEligibilityOptions,
} from './services/merge-eligibility.service';

export {
  PipelineService,
  noopCiRunner,
  createQueueCiRunnerPort,
} from './services/pipeline.service';
export type {
  PipelineRun,
  PipelineTrigger,
  PipelineTriggerType,
  RunStatus,
  CiRunnerPort,
  CiRunnerDispatch,
  CiRunQueueLike,
  PipelineServiceOptions,
} from './services/pipeline.service';

export { IssueService, CreateIssueInputSchema } from './services/issue.service';

export {
  BranchProtectionService,
  CreateProtectionRuleInputSchema,
  UpdateProtectionRuleInputSchema,
} from './services/branch-protection.service';
export type {
  CreateProtectionRuleInput,
  UpdateProtectionRuleInput,
  EnforceResult,
} from './services/branch-protection.service';

export {
  GitService,
  LocalGitServerPort,
  ownerOnlyAccess,
} from './services/git.service';
export type {
  RefUpdate,
  RefUpdateOutcome,
  RefUpdateResult,
  GitServerPort,
  RepoAccessPort,
  GitServiceOptions,
} from './services/git.service';

/**
 * The QuantCode route surface as a single encapsulated Fastify plugin.
 *
 * Repo / PR / review / issue endpoints live under a `/git` sub-prefix (matching
 * their pre-extraction layout), while CI endpoints are namespaced per-repo at
 * the module root (`/:owner/:name/ci/*`). Mounting this plugin under a parent
 * prefix yields the full route tree for that prefix.
 */
const quantCodeRoutes: FastifyPluginAsync = async (app) => {
  await app.register(gitRoutes, { prefix: '/git' });
  await app.register(gitTransportRoutes, { prefix: '/git' });
  await app.register(pullRequestRoutes, { prefix: '/git' });
  await app.register(reviewRoutes, { prefix: '/git' });
  await app.register(issueRoutes, { prefix: '/git' });
  await app.register(ciRoutes);
};

/**
 * Register the QuantCode module on the server-core app factory.
 *
 * - Canonical mount: `/api/code/*` (Requirement 6.1).
 * - Backward-compat alias: `/api/v1/*`, reproducing the exact legacy paths
 *   (`/api/v1/git/*` and `/api/v1/:owner/:name/ci/*`) so existing callers keep
 *   working with no behavior change.
 */
export async function registerQuantCodeModule(app: FastifyInstance): Promise<void> {
  await app.register(quantCodeRoutes, { prefix: '/api/code' });
  await app.register(quantCodeRoutes, { prefix: '/api/v1' });
}

export default registerQuantCodeModule;
