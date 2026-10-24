import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/app_providers.dart';
import '../../data/mail_exception.dart';
import '../../data/models/mail_models.dart';
import '../../data/network/dio_mail_repository.dart' show newIdempotencyKey;
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
        lastSyncedAt: ref.read(clockProvider)(),
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
        lastSyncedAt: ref.read(clockProvider)(),
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

  /// Optimistic bulk action: the list changes at once, the server call follows
  /// with one Idempotency-Key, and a failure rolls the rows back. Returns null
  /// on success, otherwise the failure (already rolled back).
  Future<MailException?> applyAction(MailBatchAction action, List<String> ids) async {
    if (ids.isEmpty) return null;
    final Set<String> idSet = ids.toSet();
    // Rows of this list that are affected. Ids that are not loaded here (the
    // other messages of an opened thread) still go to the server.
    final Map<String, MailMessage> before = <String, MailMessage>{
      for (final MailMessage m in state.items)
        if (idSet.contains(m.id)) m.id: m,
    };
    final int unreadDelta = _unreadDelta(action, before.values);
    state = state.copyWith(
      items: _optimistic(action, state.items, idSet),
      unreadCount: state.unreadCount == null ? null : (state.unreadCount! + unreadDelta).clamp(0, 1 << 30),
    );
    final MailRepository repo = _repo;
    try {
      await repo.applyBatch(action, ids, idempotencyKey: newIdempotencyKey());
      return null;
    } on MailException catch (e) {
      if (!ref.mounted || !identical(repo, _repo)) return e;
      final Map<String, MailMessage> current = <String, MailMessage>{
        for (final MailMessage m in state.items) m.id: m,
      };
      current.addAll(before);
      final List<MailMessage> restored = current.values.toList()
        ..sort((MailMessage a, MailMessage b) => b.sortDate.compareTo(a.sortDate));
      state = state.copyWith(
        items: restored,
        unreadCount: state.unreadCount == null ? null : (state.unreadCount! - unreadDelta).clamp(0, 1 << 30),
      );
      return e;
    }
  }

  /// Undo of an archive or delete: asks the server to bring the mail back,
  /// then reloads the first page. Returns null on success.
  Future<MailException?> undoRemoval(MailBatchAction action, List<String> ids) async {
    final MailRepository repo = _repo;
    try {
      for (final String id in ids) {
        if (action == MailBatchAction.archive) {
          await repo.unarchive(id, idempotencyKey: newIdempotencyKey());
        } else {
          await repo.restore(id, idempotencyKey: newIdempotencyKey());
        }
      }
    } on MailException catch (e) {
      return e;
    }
    if (ref.mounted) await load();
    return null;
  }

  /// Marks the rows of a conversation read in the local copy (the server call
  /// is `markThreadRead`).
  void markConversationReadLocally(String threadOrEmailId) {
    bool changed = false;
    int newlyRead = 0;
    final List<MailMessage> items = <MailMessage>[
      for (final MailMessage m in state.items)
        if ((m.id == threadOrEmailId || m.threadId == threadOrEmailId) && !m.isRead)
          () {
            changed = true;
            newlyRead++;
            return m.copyWith(isRead: true);
          }()
        else
          m,
    ];
    if (!changed) return;
    state = state.copyWith(
      items: items,
      unreadCount: state.unreadCount == null ? null : (state.unreadCount! - newlyRead).clamp(0, 1 << 30),
    );
  }

  List<MailMessage> _optimistic(MailBatchAction action, List<MailMessage> items, Set<String> ids) {
    final List<MailMessage> result = <MailMessage>[];
    for (final MailMessage m in items) {
      if (!ids.contains(m.id)) {
        result.add(m);
        continue;
      }
      switch (action) {
        case MailBatchAction.archive:
        case MailBatchAction.delete:
          break; // leaves this view
        case MailBatchAction.markRead:
          result.add(m.copyWith(isRead: true));
        case MailBatchAction.markUnread:
          result.add(m.copyWith(isRead: false));
        case MailBatchAction.star:
          result.add(m.copyWith(isStarred: true));
        case MailBatchAction.unstar:
          if (view.kind != MailFolderKind.starred) result.add(m.copyWith(isStarred: false));
      }
    }
    return result;
  }

  int _unreadDelta(MailBatchAction action, Iterable<MailMessage> affected) {
    final int unread = affected.where((MailMessage m) => !m.isRead).length;
    final int read = affected.length - unread;
    switch (action) {
      case MailBatchAction.archive:
      case MailBatchAction.delete:
      case MailBatchAction.markRead:
        return -unread;
      case MailBatchAction.markUnread:
        return read;
      case MailBatchAction.star:
      case MailBatchAction.unstar:
        return 0;
    }
  }
}

final mailListProvider =
    NotifierProvider.family<MailListController, MailListState, MailView>(MailListController.new);
