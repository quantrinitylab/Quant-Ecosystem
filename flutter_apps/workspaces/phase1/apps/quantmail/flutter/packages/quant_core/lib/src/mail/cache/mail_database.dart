// ============================================================================
// quant_core - drift mail database (M4: drift persistence layer)
// ============================================================================
//
// SQLite backing store for the offline mail caches. Schema v1:
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
//
// Migration note: this is schemaVersion 1 (initial release). Any future
// column/table addition must bump [schemaVersion] and add a `MigrationStep`
// in [migration]; never silently widen v1.

import 'dart:io';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

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

/// Opens the on-disk mail database at `<app-documents>/quantmail.db`.
///
/// Deferred via [LazyDatabase] so path_provider is only touched on first
/// query (never at provider-construction time).
LazyDatabase _openConnection() => LazyDatabase(() async {
      final dir = await getApplicationDocumentsDirectory();
      final file = File(p.join(dir.path, 'quantmail.db'));
      return NativeDatabase(file);
    });

/// The drift database backing the offline mail caches.
@DriftDatabase(
  tables: [CachedThreads, CachedEmails, EmailPages, ThreadPages, SyncState],
)
class MailDatabase extends _$MailDatabase {
  /// Injectable constructor: pass any [QueryExecutor].
  MailDatabase(super.executor);

  /// Production constructor: opens the on-disk database
  /// (`<app-documents>/quantmail.db`) via a lazy connection.
  MailDatabase.disk() : super(_openConnection());

  /// In-memory database for unit tests — no filesystem, no path_provider.
  MailDatabase.memory() : super(NativeDatabase.memory());

  /// Initial release of the offline mail schema (see module doc for the
  /// migration note).
  @override
  int get schemaVersion => 1;
}
