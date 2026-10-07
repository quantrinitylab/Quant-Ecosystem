// ============================================================================
// quant_core - drift mail database (M4: drift persistence layer)
// ============================================================================
//
// SQLite backing store for the offline mail caches. Schema v2:
//
// - `CachedThreads`  — one row per thread summary, JSON payload by threadId
// - `CachedEmails`   — one row per email message, JSON payload by id
// - `EmailPages`     — cached `PaginatedEmails` pages keyed by
//                      (page, pageSize, folder)
// - `ThreadPages`    — cached thread-list page *membership*: the ordered
//                      thread ids for a (page, pageSize, folder) key. Threads
//                      themselves live in `CachedThreads`; keeping membership
//                      separate means a thread upsert/delete stays
//                      consistent across every cached page without rewriting
//                      full payloads.
// - `SyncState`      — small key/value store (e.g. the
//                      `GET /emails/changes?since=` cursor under 'emails_since')
// - `OutboxOperations` (v2, M6) — persistent modifier-queue: one row per
//                      deferred server mutation, drained in enqueue order.
//
// Migration note: this is schemaVersion 2. v1 was the initial release;
// v1 → v2 adds `OutboxOperations` via a `MigrationStep` in [migration]
// (new table only — existing data untouched). Any future column/table
// addition must bump [schemaVersion] and add a `MigrationStep` in
// [migration]; never silently widen a released version.

import 'package:drift/drift.dart';

import 'database_connection.dart';

part 'mail_database.g.dart';

/// One cached thread summary, stored as JSON by thread id.
@DataClassName('CachedThread')
class CachedThreads extends Table {
  /// Stable backend thread identifier (primary key).
  TextColumn get threadId => text()();

  /// `ThreadSummary.toJson()` serialized — the source of truth on read.
  TextColumn get payloadJson => text()();

  /// Last write time, milliseconds since epoch, for LRU/eviction policies.
  IntColumn get updatedAtEpoch => integer()();

  @override
  Set<Column> get primaryKey => {threadId};
}

/// One cached email message, stored as JSON by id.
@DataClassName('CachedEmail')
class CachedEmails extends Table {
  /// Stable backend email identifier (primary key).
  TextColumn get id => text()();

  /// `Email.toJson()` serialized — the source of truth on read.
  TextColumn get payloadJson => text()();

  @override
  Set<Column> get primaryKey => {id};
}

/// One cached email-list page, keyed by the exact (page, pageSize, folder)
/// lookup string built by [DriftMailCache].
@DataClassName('EmailPage')
class EmailPages extends Table {
  /// Page key, e.g. `p:1:50:inbox` (primary key).
  TextColumn get pageKey => text()();

  /// `PaginatedEmails` serialized as the API envelope
  /// `{success, data, pagination}` — parseable by
  /// `PaginatedEmails.fromJson`.
  TextColumn get payloadJson => text()();

  @override
  Set<Column> get primaryKey => {pageKey};
}

/// Page membership for cached thread lists.
///
/// Each row records the ordered thread ids belonging to one
/// (page, pageSize, folder) key; the thread payloads live in
/// [CachedThreads]. On read the ids are resolved against
/// [CachedThreads]; ids with no matching row (deleted since) are skipped.
@DataClassName('ThreadPage')
class ThreadPages extends Table {
  /// Page key, e.g. `tp:1:50:inbox` (primary key).
  TextColumn get pageKey => text()();

  /// JSON-encoded ordered list of thread ids for this page.
  TextColumn get threadIdsJson => text()();

  /// Whether another page follows this one (SQLite has no bool column).
  BoolColumn get hasMore => boolean()();

  @override
  Set<Column> get primaryKey => {pageKey};
}

/// Small key/value store for sync metadata (sync cursors, watermarks).
@DataClassName('SyncStateEntry')
class SyncState extends Table {
  /// Entry key, e.g. `emails_since` (primary key).
  TextColumn get key => text()();

  /// Opaque string value.
  TextColumn get value => text()();

  @override
  Set<Column> get primaryKey => {key};
}

/// Persistent outbox for offline-first mutations (M6: modifier queue).
///
/// Every row is one deferred server mutation, written BEFORE the network
/// call is attempted (write-ahead): the app can be killed between the
/// local optimistic flip and the drain, and the mutation still reaches the
/// server on the next drain. Rows are drained in [createdAtEpoch] order
/// (per-thread FIFO falls out of the idempotency-key + timestamp design),
/// retried on transient failures, and moved to `failed` on permanent
/// (4xx) failures for user-visible retry/discard — never silently dropped.
///
/// `state` is one of `pending` / `dispatched` / `failed`. `dispatched` rows
/// are reaped by the drainer once recorded; `failed` rows stay until the
/// user retries or discards them via [ThreadMutationService].
@DataClassName('OutboxOperation')
class OutboxOperations extends Table {
  /// Client-generated uuid v4, primary key.
  TextColumn get opId => text()();

  /// [OutboxAction] name (e.g. `markRead`) — the enum's `name`, NOT the
  /// wire name; the drainer maps it to the wire action at send time.
  TextColumn get action => text()();

  /// JSON array of target email ids, e.g. `["m1","m2"]`.
  TextColumn get emailIds => text()();

  /// Optional JSON object of extra batch parameters (e.g.
  /// `{"folderId": "...", "hard": true}` for delete). Nullable.
  TextColumn get payloadJson => text().nullable()();

  /// Dedupe key, unique: enqueue with an existing key is a no-op
  /// (returns the existing op). Default shape is `"<threadId>:<action>"`.
  TextColumn get idempotencyKey => text().unique()();

  /// Enqueue time, milliseconds since epoch — the drain order.
  IntColumn get createdAtEpoch => integer()();

  /// Failed attempt count; the drainer escalates to `failed` past
  /// [OutboxDrainer.maxAttempts] (poison-op guard).
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  /// `pending` | `dispatched` | `failed`.
  TextColumn get state => text().withDefault(const Constant('pending'))();

  @override
  Set<Column> get primaryKey => {opId};
}

/// The drift database backing the offline mail caches.
///
/// The platform connection comes from the [database_connection] seam
/// (conditional import): native sqlite on IO platforms, documented
/// limitation on web (see `database_connection_web.dart`).
@DriftDatabase(
  tables: [
    CachedThreads,
    CachedEmails,
    EmailPages,
    ThreadPages,
    SyncState,
    OutboxOperations,
  ],
)
class MailDatabase extends _$MailDatabase {
  /// Injectable constructor: pass any [QueryExecutor].
  MailDatabase(super.executor);

  /// Production constructor: opens the platform database connection
  /// (`<app-documents>/quantmail.db` on IO) via the [database_connection]
  /// seam. Opening is lazy — the file is only touched on first query,
  /// never at construction time.
  MailDatabase.disk() : super(openDatabaseConnection());

  /// In-memory database for unit tests — no filesystem, no path_provider.
  /// Routed through the seam (IO: `NativeDatabase.memory()`).
  MailDatabase.memory() : super(openInMemoryDatabaseConnection());

  /// Schema v2: v1 (initial release) + the M6 [OutboxOperations] table.
  ///
  /// Any future column/table addition must bump this again and add a
  /// `MigrationStep` in [migration]; never silently widen a released
  /// version.
  @override
  int get schemaVersion => 2;

  /// Creates the full schema fresh; upgrades additively per version.
  ///
  /// v1 → v2: creates [OutboxOperations] (new table only — existing data
  /// untouched; covered by `test/outbox_migration_test.dart`).
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (Migrator m) => m.createAll(),
        onUpgrade: (Migrator m, int from, int to) async {
          if (from < 2) {
            await m.createTable(outboxOperations);
          }
        },
      );
}
