import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/mail_exception.dart';
import '../../data/models/mail_models.dart';
import '../../data/repositories/repositories.dart';

/// State of one mail list. The in-memory copy of the last successful fetch
/// stays visible when a later refresh fails (offline banner, no persistence in
/// milestone 1).
class MailListState {
  const MailListState({
    this.items = const <MailMessage>[],
    this.nextCursor,
    this.lastSyncedAt,
    this.isLoading = false,
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.error,
    this.loadMoreError,
    this.unreadCount,
    this.totalCount,
  });

  final List<MailMessage> items;
  final String? nextCursor;

  /// Time of the last SUCCESSFUL fetch; null = nothing fetched successfully yet.
  final DateTime? lastSyncedAt;
  final bool isLoading;
  final bool isRefreshing;
  final bool isLoadingMore;

  /// Failure of the last load or refresh (cleared by the next success).
  final MailException? error;
  final MailException? loadMoreError;
  final int? unreadCount;
  final int? totalCount;

  /// A fetch has succeeded at least once, so [items] reflect the server.
  bool get hasLoaded => lastSyncedAt != null;

  /// First load in progress: skeleton rows, never an empty claim.
  bool get showSkeleton => !hasLoaded && error == null;

  /// Nothing to show and the fetch failed: full-screen error with Retry.
  bool get showFullError => !hasLoaded && error != null;

  /// Cached content is visible and the last refresh failed: banner above it.
  bool get showErrorBanner => hasLoaded && error != null;

  /// The ONLY condition for "Nothing left to read.": a fetch succeeded, the
  /// server returned zero items, and nothing failed or is loading since.
  bool get showEmpty => hasLoaded && items.isEmpty && error == null && !isLoading && !isRefreshing;

  /// Last failure was connectivity (no answer from the server).
  bool get isOffline => error?.isConnectivity ?? false;

  bool get hasMore => nextCursor != null;

  MailListState copyWith({
    List<MailMessage>? items,
    String? nextCursor,
    bool clearCursor = false,
    DateTime? lastSyncedAt,
    bool? isLoading,
    bool? isRefreshing,
    bool? isLoadingMore,
    MailException? error,
    bool clearError = false,
    MailException? loadMoreError,
    bool clearLoadMoreError = false,
    int? unreadCount,
    int? totalCount,
  }) {
    return MailListState(
      items: items ?? this.items,
      nextCursor: clearCursor ? null : (nextCursor ?? this.nextCursor),
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      error: clearError ? null : (error ?? this.error),
      loadMoreError: clearLoadMoreError ? null : (loadMoreError ?? this.loadMoreError),
      unreadCount: unreadCount ?? this.unreadCount,
      totalCount: totalCount ?? this.totalCount,
    );
  }
}

/// Loads a [MailView] page by page through [MailRepository]. Rebuilt (and so
/// reset) when the repository changes, for example when the sample switch is
/// toggled, or when the user signs out.
class MailListController extends Notifier<MailListState> {
  MailListController(this.view);

  final MailView view;
  static const int pageSize = 30;

  late MailRepository _repo;

  @override
  MailListState build() {
    _repo = ref.watch(mailRepositoryProvider);
    ref.watch(sessionStateProvider.select((s) => s.isSignedIn));
    return const MailListState();
  }

  /// First load, or reload from page one. Replaces the items on success; on
  /// failure the previous items stay.
  Future<void> load() async {
    if (state.isLoading || state.isRefreshing) return;
    final bool first = !state.hasLoaded;
    state = state.copyWith(isLoading: first, isRefreshing: !first, clearError: true);
    final MailRepository repo = _repo;
    try {
      final MailPage page = await repo.list(view, pageSize: pageSize);
      if (!ref.mounted || !identical(repo, _repo)) return;
      state = MailListState(
        items: page.items,
        nextCursor: page.nextCursor,
        lastSyncedAt: DateTime.now(),
        unreadCount: page.unreadCount,
        totalCount: page.totalCount,
      );
    } on MailException catch (e) {
      if (!ref.mounted || !identical(repo, _repo)) return;
      state = state.copyWith(isLoading: false, isRefreshing: false, error: e);
    }
  }

  Future<void> refresh() => load();

  /// Next page by cursor. A failure is kept apart (`loadMoreError`) so the
  /// list stays usable and shows "Couldn't load more. Retry".
  Future<void> loadMore() async {
    if (state.isLoadingMore || state.isLoading || state.isRefreshing || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true, clearLoadMoreError: true);
    final MailRepository repo = _repo;
    try {
      final MailPage page = await repo.list(view, cursor: state.nextCursor, pageSize: pageSize);
      if (!ref.mounted || !identical(repo, _repo)) return;
      final Set<String> known = state.items.map((MailMessage m) => m.id).toSet();
      state = state.copyWith(
        items: <MailMessage>[...state.items, ...page.items.where((MailMessage m) => !known.contains(m.id))],
        nextCursor: page.nextCursor,
        clearCursor: page.nextCursor == null,
        isLoadingMore: false,
        lastSyncedAt: DateTime.now(),
        unreadCount: page.unreadCount ?? state.unreadCount,
        totalCount: page.totalCount ?? state.totalCount,
      );
    } on MailException catch (e) {
      if (!ref.mounted || !identical(repo, _repo)) return;
      if (e.kind == MailErrorKind.invalidCursor) {
        state = state.copyWith(isLoadingMore: false);
        await load();
        return;
      }
      state = state.copyWith(isLoadingMore: false, loadMoreError: e);
    }
  }
}

final mailListProvider =
    NotifierProvider.family<MailListController, MailListState, MailView>(MailListController.new);
