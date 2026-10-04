// ============================================================================
// quant_core - M4 delta-sync service (W3)
// ============================================================================
//
// Applies the staged `GET /emails/changes?since=` delta feed (see
// [EmailChangesApi] in `../threads_api.dart`) onto the thread list cache
// ([ThreadListCache], `../cache/thread_cache.dart`, owned by W1).
//
// Staged-contract assumptions (backend P0-1 NOT merged) are flagged
// TODO(UNVERIFIED) below — keep them consistent with the TODO(UNVERIFIED)
// block in `threads_api.dart`.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../cache/cache_providers.dart';
import '../cache/thread_cache.dart';
import '../mail_providers.dart';
import '../models/email.dart';
import '../models/thread.dart';
import '../outbox/outbox_providers.dart';
import '../threads_api.dart';

/// Outcome of one [MailSyncService.syncNow] run.
///
/// Partial progress is always preserved: [appliedUpserts]/[appliedDeletes]
/// count what actually landed in the cache before the run stopped (either
/// because the change feed ended, the page cap hit, or an error occurred).
class SyncResult {
  /// Creates a sync result.
  const SyncResult({
    required this.appliedUpserts,
    required this.appliedDeletes,
    this.nextSince,
    this.didFullResync = false,
    this.error,
  });

  /// Upserts applied to the thread cache this run.
  final int appliedUpserts;

  /// Tombstone deletes applied to the thread cache this run.
  final int appliedDeletes;

  /// Last cursor persisted via [ThreadListCache.writeSyncCursor], when any.
  final String? nextSince;

  /// `true` when the run fell back to the full-resync path
  /// (`INVALID_CURSOR`/410).
  final bool didFullResync;

  /// The failure that stopped the run, `null` when the run completed.
  final ApiError? error;

  /// Whether the run finished without an error.
  bool get succeeded => error == null;

  @override
  String toString() =>
      'SyncResult(upserts: $appliedUpserts, deletes: $appliedDeletes, '
      'didFullResync: $didFullResync, error: $error)';
}

/// Delta-sync engine: pulls `GET /emails/changes` pages and applies them to
/// the thread list cache.
///
/// - Upserts: an [EmailChange] with an email payload is mapped to a
///   [ThreadSummary] (see [_summaryForEmail]) and written via
///   [ThreadListCache.upsertThread].
/// - Tombstones (`deleted: true`, no payload): dropped from the thread cache
///   via [ThreadListCache.deleteThread]. The [MailCache] email row is left
///   alone on purpose — [MailCache] (mail_providers.dart) exposes no
///   deleteEmail, and the thread row is what the inbox renders; the stale
///   email row is overwritten on the next fetchEmail and evicted on
///   cache clear.
/// - The opaque cursor is persisted after every successfully applied page,
///   so a crash/retry resumes where it left off.
class MailSyncService {
  /// Creates the service. Reads the cache and API seams lazily per call via
  /// [ref] so tests can override the providers.
  MailSyncService(this._ref);

  final Ref _ref;

  /// Safety cap on change pages per run: 20 pages x 100 items covers a
  /// very large backlog; beyond that the next sync continues.
  static const int _maxPagesPerRun = 20;

  /// Page size used for the full-resync seed fetch (spec clamp 1..100).
  static const int _fullResyncPageSize = 100;

  /// In-flight [syncNow] future, or `null` when idle.
  ///
  /// P2-1 (zero-defect): the reconnect watcher debounces at 500ms, but
  /// each debounced fire still ran a FULL `syncNow()` (up to 20 pages x
  /// 100 items) `unawaited` — tunnel/elevator flapping amplified into
  /// server + local-DB storms. Concurrent `syncNow()` calls now share the
  /// one in-flight run: read and written with no `await` in between, so
  /// the check-and-set is atomic on Dart's single-threaded event loop
  /// (same pattern as [OutboxDrainer.drain]). Sequential calls still run
  /// fully — the guard clears when the run completes.
  Future<SyncResult>? _syncInflight;

  /// Runs one delta-sync pass.
  ///
  /// [pageLimit] is clamped by [EmailChangesApi.fetchChanges] to the staged
  /// contract's 1..500 range.
  ///
  /// Concurrent calls collapse into the single in-flight run and share its
  /// future (RefreshMutex-style dedupe, not serialization). Callers with a
  /// different [pageLimit] still share the first call's run — sync is a
  /// catch-up pass, not a paged query, so coalescing is correct.
  Future<SyncResult> syncNow({int pageLimit = 100}) {
    final current = _syncInflight;
    if (current != null) return current;
    final future = _syncNowInner(pageLimit: pageLimit);
    _syncInflight = future;
    // The derived future must never surface an unhandled async error:
    // swallow its outcome, then clear the guard. (Waiters on the shared
    // future still observe the real outcome — value or error — exactly as
    // a direct call would.)
    future.then<void>((_) {}, onError: (_) {}).whenComplete(() {
      if (identical(_syncInflight, future)) _syncInflight = null;
    });
    return future;
  }

  /// The actual sync implementation; see [syncNow] (single-flight wrapper).
  Future<SyncResult> _syncNowInner({required int pageLimit}) async {
    final cache = _ref.read(threadListCacheProvider);
    final changesApi = _ref.read(emailChangesApiProvider);

    var appliedUpserts = 0;
    var appliedDeletes = 0;
    String? since = await cache.readSyncCursor();
    // TODO(UNVERIFIED): cursor semantics — staged contract says `since` is an
    // opaque base64url cursor, never parsed client-side, omitted (null) on
    // first sync. readSyncCursor() returning null/empty is treated as
    // "first sync" here; re-verify what the merged backend expects for a
    // missing cursor before trusting a full first sync.
    String? nextSince;

    for (var page = 0; page < _maxPagesPerRun; page++) {
      final result =
          await changesApi.fetchChanges(since: since, limit: pageLimit);
      if (!result.success) {
        final error = result.error ??
            const ApiError(
              code: 'UNKNOWN_ERROR',
              message: 'fetchChanges failed with no error detail',
              statusCode: 0,
            );
        if (_isInvalidCursor(error)) {
          return _fullResync(
            cache,
            appliedUpserts: appliedUpserts,
            appliedDeletes: appliedDeletes,
            cause: error,
          );
        }
        // Any other failure: keep partial progress, report the error.
        return SyncResult(
          appliedUpserts: appliedUpserts,
          appliedDeletes: appliedDeletes,
          nextSince: nextSince,
          error: error,
        );
      }

      final data = result.data;
      // TODO(UNVERIFIED): page-end semantics — staged contract ends the feed
      // when `nextCursor` is absent; an empty `changes` list is treated the
      // same defensively. Re-verify against the merged backend.
      if (data == null || data.changes.isEmpty) {
        break;
      }

      for (final change in data.changes) {
        if (change.deleted) {
          // Tombstone: prefer the change's `threadId` (parsed from the staged
          // contract's `threadId` field) so deletes hit real (non-lazy)
          // threads; fall back to the email id for lazy threads where both
          // are the same.
          // TODO(UNVERIFIED): re-verify `threadId` presence against the
          // merged backend (`GET /emails/changes` P0-1).
          await cache.deleteThread(change.threadId ?? change.id);
          appliedDeletes++;
        } else {
          final email = change.email;
          if (email == null) {
            continue;
          }
          await cache.upsertThread(_summaryForEmail(email));
          appliedUpserts++;
        }
      }

      nextSince = data.nextSince;
      if (nextSince == null || nextSince.isEmpty) {
        break;
      }
      await cache.writeSyncCursor(nextSince);
      since = nextSince;
    }

    return SyncResult(
      appliedUpserts: appliedUpserts,
      appliedDeletes: appliedDeletes,
      nextSince: nextSince,
    );
  }

  /// Explicitly drains the persistent outbox ([OutboxDrainer.drain]).
  ///
  /// Safe to call any time — a no-op when nothing is pending, and
  /// concurrent calls collapse into one in-flight drain.
  ///
  /// Auto-trigger on reconnect is RESOLVED (M6, W1): `connectivityWatcherProvider`
  /// (`sync_providers.dart`) starts from [AppBootstrap.warmUp] and fires
  /// `syncNow()` → `drainOutbox()` on debounced offline→online transitions,
  /// guarded by [isSessionAuthenticatedProvider] (a signed-out drain would
  /// burn pending ops to `failed` via the 401→permanent `_classify` rule).
  /// // TODO(UNVERIFIED): (a) no auto-trigger INSIDE [syncNow] — deliberate
  /// design decision, kept: the seam is awkward (firing the drain inside
  /// syncNow constructs the real outboxDrainerProvider (disk database) in
  /// unit tests, and drift's LazyDatabase reports the binding-less open
  /// failure to the test zone at container teardown — outside anything the
  /// drainer can catch, verified by experiment). The drain stays an
  /// explicit call site (reconnect wiring, mutation paths, this method).
  /// (b) The outbox↔delta-sync conflict policy (what happens when a remote
  /// change arrives for an item with a pending local op) is still unverified
  /// against the live backend — re-verify in Phase 2 once the P0-1 merge
  /// lands.
  Future<void> drainOutbox() => _ref.read(outboxDrainerProvider).drain();

  /// Full-resync fallback after an invalid/expired cursor.
  ///
  /// Clears the cursor and seeds the cache from a plain thread list fetch
  /// (`GET /threads`, page 1). Only page 1 is rewritten — older cached pages
  /// stay until the next normal sync or an explicit [ThreadListCache.clear].
  Future<SyncResult> _fullResync(
    ThreadListCache cache, {
    required int appliedUpserts,
    required int appliedDeletes,
    required ApiError cause,
  }) async {
    // Clear the cursor first: an empty cursor is the "first sync" marker
    // (see the TODO(UNVERIFIED) in [syncNow]); a crash between here and the
    // page write therefore retries the resync rather than resuming mid-feed.
    await cache.writeSyncCursor('');

    final threadsApi = _ref.read(threadsApiProvider);
    final result = await threadsApi.listThreads(
      page: 1,
      pageSize: _fullResyncPageSize,
    );
    if (!result.success) {
      return SyncResult(
        appliedUpserts: appliedUpserts,
        appliedDeletes: appliedDeletes,
        didFullResync: true,
        error: result.error ??
            const ApiError(
              code: 'UNKNOWN_ERROR',
              message: 'full resync listThreads failed with no error detail',
              statusCode: 0,
            ),
      );
    }

    final threads = result.data ?? const <ThreadSummary>[];
    // TODO(UNVERIFIED): `GET /threads` carries no hasMore flag; a full page
    // is the only signal more rows may exist. Re-verify against the merged
    // backend (or the delta-sync NOTES.md contract) before trusting this.
    await cache.writeThreadPage(
      page: 1,
      pageSize: _fullResyncPageSize,
      threads: threads,
      hasMore: threads.length >= _fullResyncPageSize,
    );

    return SyncResult(
      appliedUpserts: appliedUpserts,
      appliedDeletes: appliedDeletes,
      didFullResync: true,
      error: ApiError(
        code: cause.code,
        message:
            'Sync cursor was invalid (${cause.code}); performed full resync '
            'from GET /threads instead.',
        statusCode: cause.statusCode,
      ),
    );
  }

  /// Derives an inbox-row [ThreadSummary] from a single email payload.
  ///
  /// The backend creates threads lazily ([ThreadsApi.resolveThread] doc), so
  /// `threadId` may be null — the email id is used as the thread key then,
  /// exactly like the `/thread/:id` deep-link rule.
  ThreadSummary _summaryForEmail(Email email) => ThreadSummary(
        id: email.threadId?.isNotEmpty == true ? email.threadId! : email.id,
        subject: email.subject,
        snippet: email.snippet,
        lastMessageDate: email.date,
        isRead: email.isRead,
        participantNames: [email.from.name ?? email.from.email],
        raw: <String, dynamic>{'emailId': email.id},
      );

  /// `true` when [error] means the stored cursor is unusable.
  ///
  /// TODO(UNVERIFIED): staged contract reports a malformed cursor as 400
  /// `INVALID_CURSOR`; 410 (Gone) is the defensive catch-all for an
  /// expired cursor. Both are staged-contract claims — re-verify the exact
  /// code/status pair against the merged backend.
  bool _isInvalidCursor(ApiError error) =>
      error.code == 'INVALID_CURSOR' || error.statusCode == 410;
}
