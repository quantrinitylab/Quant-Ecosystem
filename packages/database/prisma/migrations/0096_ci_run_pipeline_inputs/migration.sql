-- PR (fix/qm-quantgit-ci-runs): persist the pipeline inputs on the CiRun row.
--
-- Before this migration the trigger payload (configYaml + variables) lived
-- only in the in-memory dispatch call, so a FAILED run could never be
-- retried faithfully: the retry path had nothing to re-dispatch with and the
-- run sat PENDING forever. Both columns are nullable — pre-existing rows and
-- config-less triggers re-dispatch with an empty config.
ALTER TABLE "ci_runs" ADD COLUMN "configYaml" TEXT;
ALTER TABLE "ci_runs" ADD COLUMN "variables" JSONB;
