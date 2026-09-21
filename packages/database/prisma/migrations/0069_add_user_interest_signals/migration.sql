-- Migration 0069: cross-app interest signals (event-spine projection)
--
-- Additive only: one new table, no column added to or altered on any existing
-- one, so rolling it back is a DROP TABLE and nothing else is affected.
--
-- `event_id` is UNIQUE because spine delivery is at-least-once: services/cdc-relay
-- publishes before it marks a row published, so a transport failure replays the
-- batch. The constraint is what makes the projector idempotent rather than
-- double-counting a like on every redelivery.
CREATE TABLE IF NOT EXISTS "user_interest_signals" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "creator_id" TEXT,
    "category" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "event_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_interest_signals_pkey" PRIMARY KEY ("id")
);

-- Idempotency key for at-least-once redelivery.
CREATE UNIQUE INDEX IF NOT EXISTS "user_interest_signals_event_id_key"
    ON "user_interest_signals" ("event_id");

-- "what has this user done lately" — the recency read every scorer starts from.
CREATE INDEX IF NOT EXISTS "user_interest_signals_user_id_occurred_at_idx"
    ON "user_interest_signals" ("user_id", "occurred_at");

-- "what topics does this user care about" — the cross-app read.
CREATE INDEX IF NOT EXISTS "user_interest_signals_user_id_category_idx"
    ON "user_interest_signals" ("user_id", "category");

-- creator affinity, which a follow graph cannot express on its own.
CREATE INDEX IF NOT EXISTS "user_interest_signals_creator_id_idx"
    ON "user_interest_signals" ("creator_id");
