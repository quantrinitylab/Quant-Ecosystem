// ============================================================================
// quant_core - drift-backed ThreadListCache (M4: drift persistence layer)
// ============================================================================
//
// SQLite implementation of the [ThreadListCache] seam from
// thread_cache.dart. Thread payloads live individually in `CachedThreads`
// (JSON by thread id); page *membership* — the ordered thread ids for one
// (page, pageSize, folder) key — lives in `ThreadPages`. This keeps
// upserts and deletes consistent across every cached page without
// rewriting full payloads: a delete removes the row and its id from all
// page memberships, an upsert touches only the one payload row.
//
// Decision log: see M4_CACHE_DECISIONS.md in this directory.

import 'dart:convert';

import 'package:drift/drift.dart';

import '../models/thread.dart';
import 'mail_database.dart';
import 'thread_cache.dart';

/// SQLite-backed [ThreadListCache], built on [MailDatabase].
class DriftThreadCache implements ThreadListCache {
  /// Creates a cache backed by [db].
  DriftThreadCache(this._db);

  final MailDatabase _db;

  /// Sync-state key for the `GET /emails/changes?since=` cursor.
  static const syncCursorKey = 'emails_since';

  /// Page-membership lookup key: `tp:<page>:<pageSize>:<folder>`.
  static String pageKey({
    required int page,
    required int pageSize,
    String? folderId,
  }) =>
      'tp:$page:$pageSize:${folderId ?? 'inbox'}';

  @override
  Future<CachedThreadPage?> readThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
  }) async {
    final key = pageKey(page: page, pageSize: pageSize, folderId: folderId);
    final pageRow = await (_db.select(_db.threadPages)
          ..where((t) => t.pageKey.equals(key)))
        .getSingleOrNull();
    if (pageRow == null) return null;

    final decodedIds = jsonDecode(pageRow.threadIdsJson);
    if (decodedIds is! List) return null;
    final ids = decodedIds.map((e) => e.toString()).toList();

    // Resolve each id against CachedThreads. Rows deleted since the page
    // was written (delete tombstones) are skipped rather than failing
    // the whole page.
    final threads = <ThreadSummary>[];
    for (final id in ids) {
      final threadRow = await (_db.select(_db.cachedThreads)
            ..where((t) => t.threadId.equals(id)))
          .getSingleOrNull();
      if (threadRow == null) continue;
      final decoded = jsonDecode(threadRow.payloadJson);
      if (decoded is Map<String, dynamic>) {
        threads.add(ThreadSummary.fromJson(decoded));
      }
    }
    return CachedThreadPage(threads: threads, hasMore: pageRow.hasMore);
  }

  @override
  Future<void> writeThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
    required List<ThreadSummary> threads,
    required bool hasMore,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final thread in threads) {
      await _upsertThreadRow(thread, now);
    }
    final key = pageKey(page: page, pageSize: pageSize, folderId: folderId);
    await _db.into(_db.threadPages).insertOnConflictUpdate(
          ThreadPagesCompanion(
            pageKey: Value(key),
            threadIdsJson:
                Value(jsonEncode(threads.map((t) => t.id).toList())),
            hasMore: Value(hasMore),
          ),
        );
  }

  @override
  Future<void> upsertThread(ThreadSummary thread) async {
    await _upsertThreadRow(
        thread, DateTime.now().millisecondsSinceEpoch);
  }

  Future<void> _upsertThreadRow(ThreadSummary thread, int nowEpoch) async {
    await _db.into(_db.cachedThreads).insertOnConflictUpdate(
          CachedThreadsCompanion(
            threadId: Value(thread.id),
            payloadJson: Value(jsonEncode(thread.toJson())),
            updatedAtEpoch: Value(nowEpoch),
          ),
        );
  }

  @override
  Future<void> deleteThread(String threadId) async {
    await (_db.delete(_db.cachedThreads)
          ..where((t) => t.threadId.equals(threadId)))
        .go();
    // Remove the id from every page membership that references it, so
    // deleted threads stop appearing in cached pages.
    final pages = await _db.select(_db.threadPages).get();
    for (final page in pages) {
      final decoded = jsonDecode(page.threadIdsJson);
      if (decoded is! List) continue;
      final ids = decoded.map((e) => e.toString()).toList();
      if (!ids.remove(threadId)) continue;
      await (_db.update(_db.threadPages)
            ..where((t) => t.pageKey.equals(page.pageKey)))
          .write(
            ThreadPagesCompanion(
              threadIdsJson: Value(jsonEncode(ids)),
            ),
          );
    }
  }

  @override
  Future<ThreadSummary?> readThread(String threadId) async {
    // Single-thread lookup against CachedThreads (threadId primary key),
    // decoding the same JSON payload written by [_upsertThreadRow]. Reads
    // only this table, so it is unaffected by the schema-version-2
    // migration (new tables) landing in mail_database.dart.
    final row = await (_db.select(_db.cachedThreads)
          ..where((t) => t.threadId.equals(threadId)))
        .getSingleOrNull();
    if (row == null) return null;
    final decoded = jsonDecode(row.payloadJson);
    if (decoded is! Map<String, dynamic>) return null;
    return ThreadSummary.fromJson(decoded);
  }

  @override
  Future<String?> readSyncCursor() async {
    final row = await (_db.select(_db.syncState)
          ..where((t) => t.key.equals(syncCursorKey)))
        .getSingleOrNull();
    return row?.value;
  }

  @override
  Future<void> writeSyncCursor(String cursor) async {
    await _db.into(_db.syncState).insertOnConflictUpdate(
          SyncStateCompanion(
            key: const Value(syncCursorKey),
            value: Value(cursor),
          ),
        );
  }

  @override
  Future<void> clear() async {
    // Sign-out / account-switch semantics: drop thread rows, page
    // memberships, mail rows, mail pages, and the sync cursor.
    await _db.delete(_db.cachedThreads).go();
    await _db.delete(_db.threadPages).go();
    await _db.delete(_db.cachedEmails).go();
    await _db.delete(_db.emailPages).go();
    await _db.delete(_db.syncState).go();
  }
}
