// ============================================================================
// signal-projector — Postgres signal store
// ============================================================================
import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';
import pino from 'pino';
import type { SignalStore } from './consumer.js';
import type { InterestSignal } from './projection.js';

const logger = pino({ name: 'signal-store' });

/**
 * TLS is on by default, and that is load-bearing rather than defensive: RDS here
 * runs with forced SSL and `pg` connects in the clear unless told otherwise, so
 * the first build of the sibling cdc-relay failed every query with SQLSTATE 28000
 * — which reads like bad credentials and is actually "no encryption".
 *
 * Verification is a separate question from encryption. With `DATABASE_CA_CERT` the
 * server certificate is checked; without it the connection is encrypted but the
 * server is NOT authenticated, so an in-path attacker presenting any certificate
 * is still trusted. Fine for an in-VPC staging worker, not fine for production,
 * hence the warning instead of a silent default.
 */
export function buildPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const connectionString = env['DATABASE_URL'];
  const ca = env['DATABASE_CA_CERT'];
  if (ca) return { connectionString, ssl: { ca, rejectUnauthorized: true } };
  logger.warn(
    'DATABASE_CA_CERT is not set: the Postgres connection is encrypted but the server certificate is not verified. Set it before production.',
  );
  return { connectionString, ssl: { rejectUnauthorized: false } };
}

// ON CONFLICT on the unique event_id is what makes folding idempotent. Spine
// delivery is at-least-once (cdc-relay publishes before it marks rows published,
// so a transport failure replays the batch), and the consumer also leaves failed
// writes unacked on purpose so they are redelivered. Without this, one like would
// be counted once per redelivery.
const INSERT_SQL = `
  INSERT INTO "user_interest_signals"
    ("id","user_id","app","event_type","subject_type","subject_id",
     "creator_id","category","weight","occurred_at","event_id")
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
  ON CONFLICT ("event_id") DO NOTHING
`;

export class PostgresSignalStore implements SignalStore {
  private readonly pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool ?? new Pool(buildPoolConfig());
  }

  /** Returns true when a row was inserted, false when the event was already folded. */
  async save(signal: InterestSignal): Promise<boolean> {
    const result = await this.pool.query(INSERT_SQL, [
      randomUUID(),
      signal.userId,
      signal.app,
      signal.eventType,
      signal.subjectType,
      signal.subjectId,
      signal.creatorId,
      signal.category,
      signal.weight,
      signal.occurredAt,
      signal.eventId,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
