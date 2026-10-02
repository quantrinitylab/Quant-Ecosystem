// ============================================================================
// quant_core - thread-list repository (M4: W4)
// ============================================================================
//
// Cache-through access to the thread-listing API, following the same pattern
// as [EmailRepository] in `mail_providers.dart`:
//
// - cache-first unless [forceRefresh];
// - successful network results are written back to the cache;
// - on network failure with a warm cache, the stale cached page is served;
// - on network failure with a cold cache, the [ApiResult.failure] propagates.
//
// Empty-overwrite decision (documented contract):
// `ThreadsApi.listThreads` deliberately degrades to an empty list when the
// backend returns an unknown `data` shape (see `threads_api.dart`). Writing
// that defensive empty list into the cache would delete the user's offline
// inbox. So: on network success we only overwrite a cached page when either
// the fresh list is non-empty, or the cached page is empty/absent. A fresh
// empty list over an existing non-empty cached page keeps the cached page
// and is returned as-is to the caller (the caller decides what the UI shows).

import 'package:quant_foundation/quant_foundation.dart';

import 'cache/thread_cache.dart';
import 'threads_api.dart';

/// Cache-through repository for thread-list pages.
///
/// Accepts an optional [ThreadListCache] (second constructor argument). When
/// no cache is bound, every fetch goes straight to the network — the M3
/// default until W1's drift implementation is wired into
/// `threadListCacheProvider`.
class ThreadListRepository {
  /// Creates a repository. [_cache] is optional: omit (or pass `null`) for
  /// the M3 network-only behavior; M4 injects the drift implementation.
  const ThreadListRepository(this._api, [this._cache]);

  final ThreadsApi _api;
  final ThreadListCache? _cache;

  /// Fetches one thread-list page, cache-first unless [forceRefresh].
  ///
  /// Returns a [CachedThreadPage] so callers can update pagination state
  /// (`hasMore`) without knowing where the page came from. `hasMore` is
  /// derived from the network result: a full page (length == [pageSize])
  /// means more pages may exist. Cached pages carry their stored `hasMore`;
  /// when the network fails and we serve a stale cached page, its stored
  /// `hasMore` is returned unchanged.
  Future<ApiResult<CachedThreadPage>> fetchPage({
    int page = 1,
    int pageSize = 50,
    String? folderId,
    bool forceRefresh = false,
  }) async {
    final cache = _cache;
    CachedThreadPage? cached;
    if (cache != null) {
      cached = await cache.readThreadPage(
        page: page,
        pageSize: pageSize,
        folderId: folderId,
      );
      if (cached != null && !forceRefresh) return ApiResult.ok(cached);
    }

    final result = await _api.listThreads(
      page: page,
      pageSize: pageSize,
      folderId: folderId,
    );

    if (result.success && result.data != null) {
      final threads = result.data!;
      final fresh = CachedThreadPage(
        threads: threads,
        // A full page suggests the backend has more; a partial (or empty)
        // page means we have reached the end.
        hasMore: threads.length == pageSize,
      );
      if (cache != null) {
        // Empty-overwrite guard: never let the API's defensive empty list
        // (unknown `data` shape) wipe a warm cache. See the file doc above.
        final keepCached = threads.isEmpty &&
            cached != null &&
            cached.threads.isNotEmpty;
        if (!keepCached) {
          await cache.writeThreadPage(
            page: page,
            pageSize: pageSize,
            folderId: folderId,
            threads: threads,
            hasMore: fresh.hasMore,
          );
        }
      }
      return ApiResult.ok(fresh);
    }

    if (!result.success && cached != null) return ApiResult.ok(cached);
    return ApiResult.failure(
      result.error ??
          const ApiError(
            code: 'UNKNOWN_ERROR',
            message: 'fetchPage failed with no error detail',
            statusCode: 0,
          ),
    );
  }
}
