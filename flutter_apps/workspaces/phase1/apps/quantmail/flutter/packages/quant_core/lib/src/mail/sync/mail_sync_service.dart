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

  /// Runs one delta-sync pass.
  ///
  /// [pageLimit] is clamped by [EmailChangesApi.fetchChanges] to the staged
  /// contract's 1..500 range.
  Future<SyncResult> syncNow({int pageLimit = 100}) async {
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
          // TODO(UNVERIFIED): tombstone shape — `{deleted: true, id}` with NO
          // message payload. `id` here is the *email* id from the changes
          // feed, but the thread cache is keyed by thread id; the W1
          // implementation must resolve email-id -> thread-id (or fall back
          // to the email id, matching the lazy-thread deep-link rule in
          // ThreadsApi.resolveThread) — re-verify at merge time.
          await cache.deleteThread(change.id);
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
