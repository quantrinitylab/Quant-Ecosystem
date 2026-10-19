-- fix/qm-quantgit-dismiss-stale-approvals (2026-10-19): GitHub parity for
-- "Dismiss stale pull request approvals when new commits are pushed".
--
-- Before this change an approval survived later pushes: an author could get
-- approved, push new unreviewed code, and merge without re-review, because
-- both enforcement points (the merge route's approval count and
-- merge-eligibility.service.ts) counted every APPROVED review ever, with zero
-- commit awareness.
--
-- Additive and safe:
--   * branch_protections.dismissStaleApprovals defaults false — existing rules
--     keep their current behavior until an admin opts in.
--   * reviews.dismissed defaults false — existing approvals keep counting
--     until a push actually dismisses them; nothing is retroactively revoked.
--   * reviews.reviewedCommitSha is nullable — reviews recorded before this
--     column existed stay NULL (unknown), and the push path treats NULL as
--     "cannot prove freshness" only when it dismisses on a real push.
ALTER TABLE "branch_protections" ADD COLUMN "dismissStaleApprovals" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "reviews" ADD COLUMN "reviewedCommitSha" TEXT;
ALTER TABLE "reviews" ADD COLUMN "dismissed" BOOLEAN NOT NULL DEFAULT false;
