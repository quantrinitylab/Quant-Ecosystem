// ============================================================================
// quant_core - inbox providers (M4: W4)
// ============================================================================
//
// Riverpod state management for the inbox list screen (quant_app's
// `inbox_screen.dart`, built by W2 this shift on the contract below):
//
// - [threadListRepositoryProvider] — the cache-through [ThreadListRepository]
//   over [threadsApiProvider] + W1's [threadListCacheProvider].
// - [InboxListState] — immutable UI state for the list.
// - [inboxProvider] — [AsyncNotifierProvider] owning pagination, refresh and
//   the post-first-paint backend sync (W3's [MailSyncService]).
//
// Contract for W2 (inbox_screen.dart):
//   `ref.watch(inboxProvider)` gives `AsyncValue<InboxListState>`:
//   - `data.threads` .......... threads to render (never null)
//   - `data.hasMore` .......... true -> show "load more" affordance
//   - `data.isLoadingMore` .... true -> next page is fetching
//   - `data.errorMessage` ..... non-null -> show error (only set when
//                               `threads` is empty, i.e. nothing to show)
//   Call `ref.read(inboxProvider.notifier).refresh()` for pull-to-refresh and
//   `.loadMore()` when the list reaches the end.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'cache/cache_providers.dart';
import 'mail_providers.dart';
import 'models/thread.dart';
import 'sync/sync.dart';
import 'thread_list_repository.dart';

/// Page size used by the inbox notifier (matches the API's `pageSize` clamp
/// range 1..100 and the repository default of 50).
const int _inboxPageSize = 50;

/// Cache-through thread-list repository for the inbox, wired to the W1 cache
/// via [threadListCacheProvider]. Until the drift implementation lands, the
/// provider serves network-only (the cache provider returns `null` / an
/// unbound cache — see `cache/cache.dart`).
final threadListRepositoryProvider = Provider<ThreadListRepository>(
  (ref) => ThreadListRepository(
    ref.watch(threadsApiProvider),
    ref.watch(threadListCacheProvider),
  ),
  name: 'threadListRepositoryProvider',
);

/// Immutable UI state for the inbox thread list.
class InboxListState {
  /// Creates the inbox list state. All fields are final.
  const InboxListState({
    this.threads = const [],
    this.isLoadingMore = false,
    this.hasMore = false,
    this.errorMessage,
  });

  /// Threads currently shown, newest page appended at the end.
  final List<ThreadSummary> threads;

  /// True while a `loadMore()` page fetch is in flight.
  final bool isLoadingMore;

  /// True when the backend reported (or we derived) that more pages exist.
  final bool hasMore;

  /// Non-null only when there is nothing else to show ([threads] is empty)
  /// and the last fetch failed.
  final String? errorMessage;

  /// Copies this state with the given fields replaced.
  InboxListState copyWith({
    List<ThreadSummary>? threads,
    bool? isLoadingMore,
    bool? hasMore,
    String? errorMessage,
    bool clearError = false,
  }) {
    return InboxListState(
      threads: threads ?? this.threads,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      hasMore: hasMore ?? this.hasMore,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// Notifier behind [inboxProvider]: inbox pagination, pull-to-refresh and the
/// post-first-paint backend sync.
final inboxProvider =
    AsyncNotifierProvider<InboxListNotifier, InboxListState>(
  InboxListNotifier.new,
  name: 'inboxProvider',
);

/// Owns inbox list state.
///
/// - [build] fetches page 1 cache-first so the first paint is instant
///   (offline: cached inbox stays readable); once that state is set it kicks
///   off [_syncAndRefresh] in the background so the backend sync does not
///   block the first paint.
/// - [refresh] forces a network fetch of page 1 (pull-to-refresh), keeping
///   the existing list visible.
/// - [loadMore] appends the next page, guarded against concurrent calls.
class InboxListNotifier extends AsyncNotifier<InboxListState> {
  /// Highest page number currently merged into state (private pagination
  /// cursor; reset to 1 whenever page 1 is re-fetched).
  int _currentPage = 1;

  /// Re-entrancy guard for [loadMore] (in addition to the `isLoadingMore`
  /// state flag, so two frames racing past the guard still serialize).
  bool _loadingMore = false;

  ThreadListRepository get _repository =>
      ref.read(threadListRepositoryProvider);

  MailSyncService get _syncService => ref.read(mailSyncServiceProvider);

  @override
  Future<InboxListState> build() async {
    _currentPage = 1;
    final result = await _repository.fetchPage(
      page: 1,
      pageSize: _inboxPageSize,
    );
    // First paint is cache-first; the backend sync runs afterwards so the
    // user sees the cached inbox immediately (offline: still readable).
    unawaited(_syncAndRefresh());
    if (result.success && result.data != null) {
      return InboxListState(
        threads: result.data!.threads,
        hasMore: result.data!.hasMore,
      );
    }
    // Failure here means the cache was cold: nothing to show.
    return InboxListState(
      errorMessage: result.error?.message ?? 'Could not load the inbox.',
    );
  }

  /// Runs W3's [MailSyncService.syncNow], then re-reads page 1 from the
  /// repository (which now serves the freshly synced cache) and updates
  /// state. Sync errors are swallowed — the cache-first state from [build]
  /// is already on screen; [errorMessage] is set only when [threads] is
  /// empty (nothing else to show).
  Future<void> _syncAndRefresh() async {
    try {
      await _syncService.syncNow();
    } on Object {
      // Sync failed (offline, backend down, ...): the cached list stays.
      return;
    }
    final result = await _repository.fetchPage(
      page: 1,
      pageSize: _inboxPageSize,
    );
    if (result.success && result.data != null) {
      _currentPage = 1;
      final current = state.valueOrNull ?? const InboxListState();
      state = AsyncValue.data(
        current.copyWith(
          threads: result.data!.threads,
          hasMore: result.data!.hasMore,
          clearError: true,
        ),
      );
      return;
    }
    final current = state.valueOrNull;
    if (current == null || current.threads.isEmpty) {
      state = AsyncValue.data(
        (current ?? const InboxListState()).copyWith(
          errorMessage:
              result.error?.message ?? 'Could not sync the inbox.',
        ),
      );
    }
  }

  /// Pull-to-refresh: forces a network fetch of page 1.
  ///
  /// The existing list stays visible (no loading state) and any error is
  /// cleared before the fetch; [errorMessage] is re-set only when the refresh
  /// fails and there is nothing to show.
  Future<void> refresh() async {
    final current = state.valueOrNull ?? const InboxListState();
    state = AsyncValue.data(current.copyWith(clearError: true));
    final result = await _repository.fetchPage(
      page: 1,
      pageSize: _inboxPageSize,
      forceRefresh: true,
    );
    if (result.success && result.data != null) {
      _currentPage = 1;
      state = AsyncValue.data(
        InboxListState(
          threads: result.data!.threads,
          hasMore: result.data!.hasMore,
        ),
      );
      return;
    }
    final latest = state.valueOrNull ?? const InboxListState();
    state = AsyncValue.data(
      latest.copyWith(
        errorMessage: latest.threads.isEmpty
            ? (result.error?.message ?? 'Could not refresh the inbox.')
            : null,
        clearError: latest.threads.isNotEmpty,
      ),
    );
  }

  /// Appends the next page. No-ops while a page fetch is in flight or when
  /// there are no more pages ([hasMore] is false).
  Future<void> loadMore() async {
    final current = state.valueOrNull;
    if (_loadingMore ||
        current == null ||
        current.isLoadingMore ||
        !current.hasMore) {
      return;
    }
    _loadingMore = true;
    state = AsyncValue.data(current.copyWith(isLoadingMore: true));
    try {
      final result = await _repository.fetchPage(
        page: _currentPage + 1,
        pageSize: _inboxPageSize,
      );
      final latest = state.valueOrNull ?? current;
      if (result.success && result.data != null) {
        _currentPage += 1;
        state = AsyncValue.data(
          latest.copyWith(
            threads: [...latest.threads, ...result.data!.threads],
            hasMore: result.data!.hasMore,
            isLoadingMore: false,
          ),
        );
      } else {
        // Pagination failure: keep the pages already loaded, just drop the
        // spinner. (The repository already served a stale page when warm, so
        // this path is mainly the cold-network case for page N+1 — the
        // earlier pages remain usable.)
        state = AsyncValue.data(latest.copyWith(isLoadingMore: false));
      }
    } finally {
      _loadingMore = false;
    }
  }
}
