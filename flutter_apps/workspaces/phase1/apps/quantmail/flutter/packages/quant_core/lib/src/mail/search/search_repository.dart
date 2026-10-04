// ============================================================================
// quant_core - search repository (Search slice: W1, quant_core lane)
// ============================================================================
//
// [SearchRepository]: session-scoped search over [SearchApi] with an LRU
// result cache (max 50 distinct queries) and in-flight dedupe — rapid
// keystroke-driven re-searches never fire duplicate requests.
//
// Contract:
//   * Blank queries short-circuit to an empty (successful) page — no
//     network, no error. `GET /search/emails` requires `q` (minLength 1),
//     so sending a blank query would be a guaranteed 400.
//   * Errors propagate as [ApiResult.failure]; this class never throws
//     (a throw inside would be a defect — ApiResult is the error channel).

import 'dart:collection';

import 'package:quant_core/src/mail/models/pagination.dart';
import 'package:quant_core/src/mail/search/search_api.dart';
import 'package:quant_core/src/mail/search/search_query.dart';
import 'package:quant_foundation/quant_foundation.dart';

/// Session-scoped mail search with LRU caching and in-flight dedupe.
class SearchRepository {
  /// Creates a repository over [api]. Not const: the cache and in-flight
  /// maps are per-instance session state.
  SearchRepository(this._api);

  /// Maximum distinct queries retained in the session LRU cache.
  static const int maxCachedQueries = 50;

  final SearchApi _api;

  /// LRU cache of successful results, keyed by `q|page|pageSize`.
  final LinkedHashMap<String, ApiResult<PaginatedEmails>> _cache =
      LinkedHashMap<String, ApiResult<PaginatedEmails>>();

  /// In-flight requests, keyed identically — concurrent identical searches
  /// share one future (keystroke debounce fires these back-to-back).
  final Map<String, Future<ApiResult<PaginatedEmails>>> _inFlight =
      <String, Future<ApiResult<PaginatedEmails>>>{};

  /// Searches mail for [query].
  ///
  /// Blank queries ([SearchQuery.isEmpty]) return an empty successful page
  /// without touching the network (the endpoint requires `q` minLength 1).
  /// Identical concurrent calls share one in-flight future; completed
  /// results are LRU-cached (max [maxCachedQueries]).
  Future<ApiResult<PaginatedEmails>> search(
    SearchQuery query, {
    int page = 1,
    int pageSize = 25,
  }) {
    if (query.isEmpty) {
      return Future.value(
        ApiResult<PaginatedEmails>.ok(
          const PaginatedEmails(
            emails: <Never>[],
            pageInfo: PageInfo(),
            success: true,
          ),
        ),
      );
    }
    return searchRaw(query.raw, page: page, pageSize: pageSize);
  }

  /// Searches mail for raw [queryText] (convenience for call sites that
  /// already hold the text, e.g. the debounced provider).
  Future<ApiResult<PaginatedEmails>> searchRaw(
    String queryText, {
    int page = 1,
    int pageSize = 25,
  }) {
    final key = '${queryText.trim()}|$page|$pageSize';
    final cached = _cache[key];
    if (cached != null) {
      // LRU touch: re-insert to mark most-recently-used.
      _cache
        ..remove(key)
        ..[key] = cached;
      return Future.value(cached);
    }
    final inFlight = _inFlight[key];
    if (inFlight != null) return inFlight;
    final future = _api
        .searchMail(queryText, page: page, pageSize: pageSize)
        .then<ApiResult<PaginatedEmails>>((result) {
      _inFlight.remove(key);
      if (result.success) {
        _cache[key] = result;
        while (_cache.length > maxCachedQueries) {
          _cache.remove(_cache.keys.first);
        }
      }
      return result;
    });
    _inFlight[key] = future;
    return future;
  }

  /// Clears the session cache (used on sign-out / account switch).
  void clear() {
    _cache.clear();
    _inFlight.clear();
  }

  /// Number of cached queries — exposed for tests/diagnostics only.
  int get cacheSize => _cache.length;
}
