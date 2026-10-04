// ============================================================================
// quant_core - thread list cache seam (M4: drift persistence layer)
// ============================================================================
//
// Abstract offline-cache seam for the inbox thread list and the email sync
// cursor. M4's [DriftThreadCache] (drift_thread_cache.dart) is the SQLite
// implementation; repositories and sync logic program against this interface
// so the storage backend can be swapped without changing call sites.

import '../models/thread.dart';

/// Abstract offline-cache seam for thread lists and the sync cursor.
///
/// Implemented by [DriftThreadCache] with drift/SQLite. Thread pages are
/// stored per (page, pageSize, folder) key; individual threads are stored
/// by id so upserts/deletes (e.g. from `GET /emails/changes?since=`) stay
/// consistent across all cached pages.
abstract class ThreadListCache {
  /// Returns the cached thread page for the exact (page, pageSize, folder)
  /// key, or `null` when nothing is cached under that key.
  Future<CachedThreadPage?> readThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
  });

  /// Stores a page under the exact (page, pageSize, folder) key, replacing
  /// any previous entry for that key. Each thread in [threads] is also
  /// upserted individually by id so later upserts stay page-consistent.
  Future<void> writeThreadPage({
    required int page,
    required int pageSize,
    String? folderId,
    required List<ThreadSummary> threads,
    required bool hasMore,
  });

  /// Inserts or updates a single thread by id.
  Future<void> upsertThread(ThreadSummary thread);

  /// Removes a thread from the cache (delete tombstone) and from every
  /// cached page that references it.
  Future<void> deleteThread(String threadId);

  /// Returns the last stored sync cursor (for `GET /emails/changes?since=`),
  /// or `null` when no sync has been recorded yet.
  Future<String?> readSyncCursor();

  /// Returns the cached summary for [threadId], or `null` when nothing is
  /// cached under that id.
  ///
  /// Single-thread lookup for the M6 cross-session offline tier:
  /// [ThreadDetailRepository.getCachedThread] restores the summary (subject,
  /// read state, counts) without a session-scoped index hit. Implemented by
  /// [DriftThreadCache] as a `CachedThreads` row lookup.
  Future<ThreadSummary?> readThread(String threadId);

  /// Persists the sync cursor returned by the changes endpoint.
  Future<void> writeSyncCursor(String cursor);

  /// Drops all cached thread data, including the sync cursor. Used on
  /// sign-out / account switch.
  Future<void> clear();
}

/// A cached thread-list page.
class CachedThreadPage {
  /// Creates a cached page.
  const CachedThreadPage({
    required this.threads,
    required this.hasMore,
  });

  /// Threads on this page, in the order they were cached.
  final List<ThreadSummary> threads;

  /// Whether another page follows this one.
  final bool hasMore;
}
