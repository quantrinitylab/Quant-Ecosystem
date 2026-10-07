-- AlterTable: attribute a click to the publisher that displayed the ad and
-- track whether it has been paid out (so payouts are idempotent at the event
-- level — a click is paid at most once).
ALTER TABLE "ad_click_events" ADD COLUMN "publisherId" TEXT;
ALTER TABLE "ad_click_events" ADD COLUMN "paidOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: drive the publisher-payout aggregation (unpaid billable clicks
-- per publisher).
CREATE INDEX "ad_click_events_publisherId_billable_paidOut_idx" ON "ad_click_events"("publisherId", "billable", "paidOut");

-- CreateTable: durable daily publisher-payout batch record (one run per UTC day).
CREATE TABLE "publisher_payout_runs" (
    "id" TEXT NOT NULL,
    "utcDay" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "publishersConsidered" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "totalCreditsPaid" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "publisher_payout_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "publisher_payout_runs_utcDay_key" ON "publisher_payout_runs"("utcDay");
