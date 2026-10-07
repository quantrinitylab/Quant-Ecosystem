// ============================================================================
// Test support — integration-test backend selector (deployability bar, Task 25)
// Spec: quantchat-launch-readiness, Tasks 25.1 / 25.2 / 25.3
// Requirements 18.2, 18.3, 18.4.
//
// The design's Testing Strategy calls for the deployability-bar verification
// tests to run against `testcontainers` (a real PostgreSQL for the prekey-claim
// test, and two backend instances + Redis for the cross-backplane and
// offline-push tests). A live Postgres/Redis is NOT available in this sandbox,
// so — following the repo's established pattern (the in-memory `fake-*.ts`
// harnesses that drive the REAL services) — these integration tests default to
// an in-memory harness that exercises the exact same production code paths and
// therefore RUN here, while being structured so they can target real
// testcontainers when one is available.
//
// HOW TO TARGET REAL CONTAINERS
// -----------------------------
// Set `QUANTCHAT_INTEGRATION_BACKEND=testcontainers` (and provision the
// `testcontainers` + `pg`/`ioredis` dev deps and a Docker daemon). Each
// integration test has a single, clearly-marked wiring point where the
// real-container fixture is constructed; until those deps/daemon exist the
// helper below fails loudly so the flag can never silently pass on a fake.
//
// With the flag UNSET (the default, and the only mode that runs in this
// sandbox), every test uses its in-memory harness and the real services under
// test — the assertions are identical in both modes.
// ============================================================================

/** The two integration backends a Task-25 test can run against. */
export type IntegrationBackend = 'in-memory' | 'testcontainers';

/**
 * Selected integration backend. Defaults to `in-memory` so the suite runs in
 * the sandbox (and in CI without Docker). Set
 * `QUANTCHAT_INTEGRATION_BACKEND=testcontainers` to opt into real containers.
 */
export const INTEGRATION_BACKEND: IntegrationBackend =
  process.env.QUANTCHAT_INTEGRATION_BACKEND === 'testcontainers' ? 'testcontainers' : 'in-memory';

/** True when the suite has been asked to target real testcontainers. */
export const USE_TESTCONTAINERS = INTEGRATION_BACKEND === 'testcontainers';

/**
 * Guard for the real-container wiring point. Real Postgres/Redis containers are
 * not provisioned in this environment, so opting into them via the env flag
 * fails loudly here rather than silently falling back to the in-memory harness
 * (which would let a green run hide a missing real-container path). Each
 * integration test calls this at its documented container-wiring point.
 *
 * @throws always, when {@link USE_TESTCONTAINERS} is set, with guidance on what
 *   the real-container fixture must provide.
 */
export function requireTestcontainers(detail: string): never {
  throw new Error(
    `[integration-harness] QUANTCHAT_INTEGRATION_BACKEND=testcontainers was requested but ` +
      `real containers are not provisioned in this environment. Wire ${detail} here ` +
      `(start a testcontainers PostgreSQL/Redis, run prisma migrate deploy, and return a ` +
      `real client) before enabling the flag. Default in-memory harness exercises the same ` +
      `production code paths and runs without Docker.`,
  );
}
