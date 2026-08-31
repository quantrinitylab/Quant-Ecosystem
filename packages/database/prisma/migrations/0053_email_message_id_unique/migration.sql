-- Make inbound delivery idempotent: one copy of a message per mailbox.
--
-- SNS delivers at least once. A retry, a redrive from the DLQ, or an operator
-- replaying the bucket all hand the same message to the ingest pipeline again, and
-- until now nothing stopped a second row being written. The old webhook tried to
-- de-duplicate on `(userId, subject, fromAddress)` with no time bound, which is
-- worse than nothing: it does not catch a genuine redelivery whose subject was
-- re-encoded, and it *does* silently discard a real second message in any thread
-- where someone replies twice with the same subject. That was mail loss.
--
-- `Message-ID` is the right key. It is assigned once by the originating server and
-- travels with the message, so it identifies the message rather than describing it.
--
-- Multiple NULLs are permitted by a Postgres unique index, which matters because
-- `messageId` is nullable: a message that arrives without the header, and every row
-- written before this column was populated, must all still coexist.

-- The lookup in `InboundIngestAdapter.ingest` is `WHERE "userId" = $1 AND
-- "messageId" = $2`, so the index serves the pre-check as well as enforcing the
-- constraint.
--
-- The index is *attempted*, not forced. If earlier redeliveries already wrote
-- duplicate rows, `CREATE UNIQUE INDEX` fails, and a migration that aborts here
-- would block every later migration on that database — while the alternative,
-- deleting the offending rows, is destructive and not something a schema migration
-- should decide on an operator's behalf. So a duplicate-key failure is reported and
-- a non-unique index is created instead: lookups stay fast, the application-level
-- pre-check still prevents new duplicates, and the warning names the work needed to
-- earn the constraint.
DO $$
DECLARE
  duplicate_rows bigint;
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS "emails_userId_messageId_key"
      ON "emails" ("userId", "messageId");
  EXCEPTION
    WHEN unique_violation OR duplicate_table THEN
      SELECT COALESCE(SUM(n - 1), 0) INTO duplicate_rows
        FROM (
          SELECT COUNT(*) AS n
            FROM "emails"
           WHERE "messageId" IS NOT NULL
           GROUP BY "userId", "messageId"
          HAVING COUNT(*) > 1
        ) AS dupes;

      RAISE WARNING
        'emails: % duplicate (userId, messageId) row(s) block the unique index. Created a non-unique index instead. De-duplicate, then run: CREATE UNIQUE INDEX "emails_userId_messageId_key" ON "emails" ("userId", "messageId");',
        duplicate_rows;

      CREATE INDEX IF NOT EXISTS "emails_userId_messageId_idx"
        ON "emails" ("userId", "messageId");
  END;
END
$$;
