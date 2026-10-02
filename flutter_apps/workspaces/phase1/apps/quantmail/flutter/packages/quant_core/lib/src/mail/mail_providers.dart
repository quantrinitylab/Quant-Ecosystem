// ============================================================================
// quant_core - mail providers, repositories and offline-cache seam
// ============================================================================
//
// Riverpod wiring for the M3 API client (emails / threads / changes):
//
// - `*_apiProvider` — thin API surfaces built on the shared, authenticated
//   [apiClientProvider]. Import cycle: this file lives in `src/mail/` and
//   imports `../providers/core_providers.dart`; both are library-only files
//   (no `part` directives), so the cycle is legal Dart.
// - [MailCache] — abstract offline-cache seam. M4 implements it with
//   drift/SQLite; repositories accept it as an optional second constructor
//   argument and run network-only when it is absent (the M3 default).
// - [EmailRepository]/[ThreadRepository] — cache-through data access so
//   M4 (offline) and M6 (outbox modifier-queue) can land without changing
//   UI call sites.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_foundation/quant_foundation.dart';

import '../providers/core_providers.dart';
import 'emails_api.dart';
import 'models/email.dart';
import 'models/pagination.dart';
import 'threads_api.dart';

/// Thin email API surface on the shared authenticated client.
final emailsApiProvider = Provider<EmailsApi>(
  (ref) => EmailsApi(ref.watch(apiClientProvider)),
  name: 'emailsApiProvider',
);

/// Thin thread API surface on the shared authenticated client.
final threadsApiProvider = Provider<ThreadsApi>(
  (ref) => ThreadsApi(ref.watch(apiClientProvider)),
  name: 'threadsApiProvider',
);

/// Thin delta/changes API surface on the shared authenticated client
/// (powers the M2 sync story: `GET /emails/changes?since=`).
final emailChangesApiProvider = Provider<EmailChangesApi>(
  (ref) => EmailChangesApi(ref.watch(apiClientProvider)),
  name: 'emailChangesApiProvider',
);

/// Offline-cache seam for mail data.
///
/// M4 implements this with drift/SQLite. Until then repositories are built
/// without a cache (see [emailRepositoryProvider]) and run network-only —
/// every nullable-cache branch in [EmailRepository]/[ThreadRepository] treats
/// "no cache bound" as the normal M3 path, not an error.
abstract class MailCache {
  /// Returns the cached page for the exact (page, pageSize, folder) key,
  /// or `null` when nothing is cached under that key.
  Future<PaginatedEmails?> readCachedPage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
  });

  /// Stores a page under the exact (page, pageSize, folder) key, replacing
  /// any previous entry for that key.
  Future<void> writePage({
    required int page,
    required int pageSize,
    String? folderId,
    FolderType? folderType,
    required PaginatedEmails result,
  });

  /// Returns the cached email with [id], or `null`.
  Future<Email?> readEmail(String id);

  /// Stores (or replaces) a single email by id.
  Future<void> writeEmail(Email email);

  /// Drops all cached mail data (used on sign-out / account switch).
  Future<void> clear();
}

/// Cache-through access to the email API.
///
/// Read pattern: serve the cached page/email first (unless [forceRefresh]),
/// write successful network results back to the cache, and — when the
/// network fails but a cache entry exists — degrade to the stale entry
/// instead of surfacing an error. Only a network failure with no cache
/// entry propagates the [ApiResult.failure].
class EmailRepository {
  /// Creates a repository. [_cache] is optional: pass `null` (or omit) for
  /// the M3 network-only behavior; M4 injects the drift implementation.
  const EmailRepository(this._api, [this._cache]);

  final EmailsApi _api;
  final MailCache? _cache;

  /// Fetches one inbox/folder page, cache-first unless [forceRefresh].
  Future<ApiResult<PaginatedEmails>> fetchPage({
    int page = 1,
    int pageSize = 50,
    String? folderId,
    FolderType? folderType,
    bool forceRefresh = false,
  }) async {
    final cache = _cache;
    PaginatedEmails? cached;
    if (cache != null) {
      cached = await cache.readCachedPage(
        page: page,
        pageSize: pageSize,
        folderId: folderId,
        folderType: folderType,
      );
      if (cached != null && !forceRefresh) return ApiResult.ok(cached);
    }
    final result = await _api.listEmails(
      page: page,
      pageSize: pageSize,
      folderId: folderId,
      folderType: folderType,
    );
    if (result.success && result.data != null && cache != null) {
      await cache.writePage(
        page: page,
        pageSize: pageSize,
        folderId: folderId,
        folderType: folderType,
        result: result.data!,
      );
    }
    if (!result.success && cached != null) return ApiResult.ok(cached);
    return result;
  }

  /// Fetches a single email, cache-first unless [forceRefresh].
  Future<ApiResult<Email>> fetchEmail(
    String id, {
    bool forceRefresh = false,
  }) async {
    final cache = _cache;
    Email? cached;
    if (cache != null) {
      cached = await cache.readEmail(id);
      if (cached != null && !forceRefresh) return ApiResult.ok(cached);
    }
    final result = await _api.getEmail(id);
    if (result.success && result.data != null && cache != null) {
      await cache.writeEmail(result.data!);
    }
    if (!result.success && cached != null) return ApiResult.ok(cached);
    return result;
  }

  // -- Mutations -----------------------------------------------------------
  //
  // Network primitives only. Optimistic updates + the M6 outbox
  // (modifier-queue) layer sit above these — they are deliberately
  // pass-through so the outbox can wrap them unchanged.

  /// Marks an email as read on the backend.
  Future<ApiResult<void>> markRead(String id) => _api.markRead(id);

  /// Marks an email as unread on the backend.
  Future<ApiResult<void>> markUnread(String id) => _api.markUnread(id);

  /// Archives an email.
  Future<ApiResult<void>> archive(String id) => _api.archive(id);

  /// Moves an email out of archive back to the inbox.
  Future<ApiResult<void>> unarchive(String id) => _api.unarchive(id);

  /// Stars an email.
  Future<ApiResult<void>> star(String id) => _api.star(id);

  /// Moves an email to another folder.
  Future<ApiResult<void>> move(
    String id, {
    String? folderId,
    FolderType? folderType,
  }) =>
      _api.move(id, folderId: folderId, folderType: folderType);

  /// Snoozes an email until [until].
  Future<ApiResult<void>> snooze(String id, DateTime until) =>
      _api.snooze(id, until);

  /// Cancels a snooze.
  Future<ApiResult<void>> unsnooze(String id) => _api.unsnooze(id);

  /// Deletes an email (backend trash semantics).
  Future<ApiResult<void>> deleteEmail(String id) => _api.deleteEmail(id);

  /// Marks every email in a folder as read.
  Future<ApiResult<void>> markAllRead({
    String? folderId,
    FolderType? folderType,
  }) =>
      _api.markAllRead(folderId: folderId, folderType: folderType);

  /// Runs bulk email actions (see [EmailsApi.batch] for the operation shape).
  ///
  /// Returns the per-action results under the `results` key.
  Future<ApiResult<Map<String, dynamic>>> batch(
    List<Map<String, dynamic>> operations,
  ) =>
      _api.batch(operations);
}

/// Cache-through access to the thread API.
///
/// [fetchThread] accepts either a thread id or an email id: when the id
/// resolves to a cached email, the real thread id is resolved from that
/// email first. Successful thread fetches write every message back to the
/// cache via [MailCache.writeEmail] so thread content is available offline.
class ThreadRepository {
  /// Creates a repository. [_cache] is optional — see [EmailRepository].
  const ThreadRepository(this._api, [this._cache]);

  final ThreadsApi _api;
  final MailCache? _cache;

  /// Fetches a full thread by thread id or email id.
  Future<ApiResult<ThreadDetail>> fetchThread(
    String idOrEmailId, {
    bool forceRefresh = false,
  }) async {
    final cache = _cache;
    String threadId = idOrEmailId;
    if (cache != null && !forceRefresh) {
      final cachedEmail = await cache.readEmail(idOrEmailId);
      final resolved = cachedEmail?.threadId;
      if (resolved != null && resolved.isNotEmpty) {
        threadId = resolved;
      }
    }
    final result = await _api.resolveThread(threadId);
    if (result.success && result.data != null && cache != null) {
      for (final email in result.data!.messages) {
        await cache.writeEmail(email);
      }
    }
    return result;
  }
}

/// Email repository provider. No [MailCache] is wired yet — M4 implements
/// the drift-backed cache and overrides this provider (or introduces a
/// `mailCacheProvider`) to inject it. Until then, repositories run
/// network-only, which is the documented M3 behavior.
final emailRepositoryProvider = Provider<EmailRepository>(
  (ref) => EmailRepository(ref.watch(emailsApiProvider)),
  name: 'emailRepositoryProvider',
);

/// Thread repository provider. Same no-cache-yet story as
/// [emailRepositoryProvider].
final threadRepositoryProvider = Provider<ThreadRepository>(
  (ref) => ThreadRepository(ref.watch(threadsApiProvider)),
  name: 'threadRepositoryProvider',
);
