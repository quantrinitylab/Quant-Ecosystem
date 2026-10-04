// ============================================================================
// quant_core - search providers (Search slice: W1, quant_core lane)
// ============================================================================
//
// Riverpod wiring for mail search, mirroring the `mail_providers.dart`
// naming style (`*_apiProvider`, `*_repositoryProvider`):
//
// - [searchApiProvider] — thin [SearchApi] on the shared authenticated
//   [apiClientProvider].
// - [searchRepositoryProvider] — session-cached [SearchRepository].
// - [searchQueryTextProvider] — the raw text in the search field.
// - [parsedSearchQueryProvider] — SYNCHRONOUS local parse of the text.
//   Instant chips with zero network: the local parse is the
//   always-available truth; the server `parseQuery` only enhances.
// - [mailSearchResultsProvider] — debounced (250ms) server search on the
//   query text; blank queries short-circuit to an empty page (no request).
// - [recentSearchesProvider] — in-memory, most-recent-first, max 20.
//   Disk persistence is deliberately NOT done here: it is a schema-v3
//   decision (new drift table), out of scope for this slice.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/core_providers.dart';
import '../models/email.dart';
import '../models/pagination.dart';
import 'search_api.dart';
import 'search_query.dart';
import 'search_repository.dart';

/// Keystroke debounce before a server search fires (Superhuman bar:
/// keypress-to-visual < 50ms locally via [parsedSearchQueryProvider];
/// server results may follow at 250ms + network).
const Duration searchDebounce = Duration(milliseconds: 250);

/// Thin search API surface on the shared authenticated client.
final searchApiProvider = Provider<SearchApi>(
  (ref) => SearchApi(ref.watch(apiClientProvider)),
  name: 'searchApiProvider',
);

/// Session-cached search repository.
final searchRepositoryProvider = Provider<SearchRepository>(
  (ref) => SearchRepository(ref.watch(searchApiProvider)),
  name: 'searchRepositoryProvider',
);

/// Raw text currently in the search field.
final searchQueryTextProvider = StateProvider<String>(
  (ref) => '',
  name: 'searchQueryTextProvider',
);

/// Synchronous local parse of [searchQueryTextProvider] — instant operator
/// chips with zero network. Recomputes on every keystroke; the parse is
/// pure and cheap.
final parsedSearchQueryProvider = Provider<SearchQuery>(
  (ref) => SearchQuery.parse(ref.watch(searchQueryTextProvider)),
  name: 'parsedSearchQueryProvider',
);

/// In-memory recent searches, most-recent-first, capped at
/// [RecentSearchesNotifier.maxEntries].
///
/// Disk persistence is NOT implemented — that is a schema-v3 decision (new
/// drift table + migration), documented here so nobody "fixes" it quietly.
final recentSearchesProvider =
    NotifierProvider<RecentSearchesNotifier, List<String>>(
  RecentSearchesNotifier.new,
  name: 'recentSearchesProvider',
);

/// Owns the recent-search list: dedupe (re-record moves to front),
/// most-recent-first, hard cap.
class RecentSearchesNotifier extends Notifier<List<String>> {
  /// Maximum retained entries.
  static const int maxEntries = 20;

  @override
  List<String> build() => const <String>[];

  /// Records [query] (trimmed): moves to front, dedupes, caps at
  /// [maxEntries]. Blank queries are ignored.
  void record(String query) {
    final q = query.trim();
    if (q.isEmpty) return;
    final next = <String>[q];
    for (final existing in state) {
      if (existing != q && next.length < maxEntries) next.add(existing);
    }
    state = List.unmodifiable(next);
  }

  /// Clears all recent searches.
  void clear() => state = const <String>[];
}

/// Immutable UI state for the mail search results.
class MailSearchState {
  /// Creates the mail search state.
  const MailSearchState({
    this.emails = const [],
    this.pageInfo = const PageInfo(),
    this.hasMore = false,
    this.errorMessage,
  });

  /// Emails on the current page.
  final List<Email> emails;

  /// Pagination metadata from the backend.
  final PageInfo pageInfo;

  /// True when another page can be fetched.
  final bool hasMore;

  /// Non-null only when the last fetch failed and there is nothing to show.
  final String? errorMessage;
}

/// Debounced server search driven by [searchQueryTextProvider].
///
/// `ref.watch(mailSearchResultsProvider)` gives
/// `AsyncValue<MailSearchState>`:
/// - blank query -> immediate empty state (no network — the endpoint
///   requires `q` minLength 1);
/// - non-blank -> 250ms debounce, then [SearchRepository.search]; success
///   records the query in [recentSearchesProvider].
final mailSearchResultsProvider =
    AsyncNotifierProvider<MailSearchNotifier, MailSearchState>(
  MailSearchNotifier.new,
  name: 'mailSearchResultsProvider',
);

/// Owns the debounced mail search.
class MailSearchNotifier extends AsyncNotifier<MailSearchState> {
  /// Pending debounce timer, cancelled on query change / dispose.
  Timer? _debounce;

  /// The build future's completer — completed early by [refreshNow] so the
  /// build future never hangs when the debounce is bypassed.
  Completer<MailSearchState>? _pending;

  SearchRepository get _repository => ref.read(searchRepositoryProvider);

  @override
  Future<MailSearchState> build() async {
    final text = ref.watch(searchQueryTextProvider);
    ref.onDispose(() {
      _debounce?.cancel();
      _debounce = null;
    });
    final trimmed = text.trim();
    if (trimmed.isEmpty) {
      // Blank: immediate empty state, zero network.
      return const MailSearchState();
    }
    _debounce?.cancel();
    final completer = Completer<MailSearchState>();
    _pending = completer;
    _debounce = Timer(searchDebounce, () async {
      _pending = null;
      completer.complete(await _doSearch(trimmed));
    });
    return completer.future;
  }

  /// Runs one search and maps it to [MailSearchState]. Never throws —
  /// failures become error state.
  Future<MailSearchState> _doSearch(String trimmed) async {
    if (trimmed.isEmpty) return const MailSearchState();
    try {
      final result = await _repository.searchRaw(trimmed);
      if (result.success && result.data != null) {
        final page = result.data!;
        ref.read(recentSearchesProvider.notifier).record(trimmed);
        return MailSearchState(
          emails: page.emails,
          pageInfo: page.pageInfo,
          hasMore: page.hasMore,
        );
      }
      return MailSearchState(
        errorMessage: result.error?.message ?? 'Search failed',
      );
    } catch (e) {
      // Defensive: the repository promises no raw throws, but a timer
      // callback must never die unobserved — surface as error state.
      return MailSearchState(errorMessage: e.toString());
    }
  }

  /// Forces an immediate search of the current query text (pull-to-refresh
  /// on the results list): bypasses the debounce and completes the pending
  /// build future so no future is left hanging.
  Future<void> refreshNow() async {
    state = const AsyncValue.loading();
    _debounce?.cancel();
    _debounce = null;
    final text = ref.read(searchQueryTextProvider).trim();
    final result = await _doSearch(text);
    final pending = _pending;
    _pending = null;
    if (pending != null && !pending.isCompleted) pending.complete(result);
    state = AsyncData(result);
  }
}
