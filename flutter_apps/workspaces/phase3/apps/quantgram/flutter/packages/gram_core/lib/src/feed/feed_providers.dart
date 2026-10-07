// ============================================================================
// gram_core - feed providers: repository wiring + feed controller
// ============================================================================
//
// Riverpod 2.x provider graph for the feed surface (mirrors the conventions
// in `src/auth/auth_providers.dart`):
//
//   feedRepositoryProvider (default: [InMemoryFeedRepository], placeholder)
//        │
//        ├──▶ feedControllerProvider (AsyncNotifier<List<GramPost>>)
//        │         refresh() / loadMore() / optimistic toggleLike
//        │
//        └──▶ storiesProvider (FutureProvider<List<GramStory>>)
//
// Pagination note: the backend cursor is OPAQUE and spec-defined.
// TODO(UNVERIFIED): until the `app-foundations/quantgram` spec lands,
// [FeedController] uses the placeholder convention documented in
// `feed_repository.dart` (cursor == index token). The real envelope
// (cursor + hasMore) replaces this with no UI changes.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'feed_repository.dart';
import 'gram_feed_models.dart';

/// Feed repository for the app container.
///
/// Defaults to [InMemoryFeedRepository] (UI-dev placeholder —
///
/// **spec landing par real API implementation se replace hoga —
///
/// TODO(UNVERIFIED)**). Tests and the real build override with
/// `feedRepositoryProvider.overrideWithValue(...)`; override-friendly by
/// construction.
final feedRepositoryProvider = Provider<FeedRepository>(
  (ref) => InMemoryFeedRepository(),
  name: 'feedRepositoryProvider',
);

/// Number of posts requested per feed page.
///
/// A hint to the repository, not a guarantee: the backend may return fewer.
const int feedPageSize = 20;

/// Drives the home feed: initial load, pull-to-refresh, and pagination.
///
/// State is the accumulated post list. On any failure the previously loaded
/// posts are preserved (`copyWithPrevious`) so the UI degrades to showing
/// stale content with an error banner instead of a blank screen.
///
/// Never throws: [refresh] and [loadMore] catch repository errors into
/// [AsyncError].
class FeedController extends AsyncNotifier<List<GramPost>> {
  /// Whether the fixture/backend reported more pages after the last load.
  bool _hasMore = true;

  /// Guards against overlapping [loadMore] calls (double-tap scroll).
  bool _isLoadingMore = false;

  /// Number of posts fetched so far; doubles as the placeholder next-cursor.
  ///
  /// TODO(UNVERIFIED): placeholder convention (index token). The real API
  /// will return an opaque cursor per page; this field then holds that
  /// token verbatim.
  int _fetchedCount = 0;

  @override
  Future<List<GramPost>> build() async {
    // Synchronous watch first: no ref.watch after the first await.
    final repository = ref.watch(feedRepositoryProvider);
    final posts = await repository.fetchFeed(limit: feedPageSize);
    _fetchedCount = posts.length;
    _hasMore = posts.length >= feedPageSize;
    return posts;
  }

  /// Re-loads the first page, replacing the current list.
  ///
  /// Shows a full loading state (no previous data kept — this is an
  /// explicit user refresh); on failure the previous posts are preserved
  /// via [AsyncValue.copyWithPrevious].
  Future<void> refresh() async {
    final repository = ref.read(feedRepositoryProvider);
    state = const AsyncLoading<List<GramPost>>().copyWithPrevious(state);
    try {
      final posts = await repository.fetchFeed(limit: feedPageSize);
      _fetchedCount = posts.length;
      _hasMore = posts.length >= feedPageSize;
      state = AsyncData(posts);
    } catch (error, stackTrace) {
      state =
          AsyncError<List<GramPost>>(error, stackTrace).copyWithPrevious(state);
    }
  }

  /// Appends the next page to the current list.
  ///
  /// No-op while a load is already in flight, when the previous page
  /// signalled end-of-feed, or when no posts are loaded yet. On failure
  /// the accumulated posts are preserved.
  Future<void> loadMore() async {
    final previous = state.valueOrNull;
    if (previous == null || _isLoadingMore || !_hasMore) return;
    _isLoadingMore = true;
    try {
      final repository = ref.read(feedRepositoryProvider);
      final next = await repository.fetchFeed(
        // TODO(UNVERIFIED): placeholder cursor convention (index token);
        // real API supplies the opaque cursor per page.
        cursor: '$_fetchedCount',
        limit: feedPageSize,
      );
      if (next.isEmpty) {
        _hasMore = false;
        return;
      }
      _fetchedCount += next.length;
      _hasMore = next.length >= feedPageSize;
      state = AsyncData(<GramPost>[...previous, ...next]);
    } catch (error, stackTrace) {
      state =
          AsyncError<List<GramPost>>(error, stackTrace).copyWithPrevious(state);
    } finally {
      _isLoadingMore = false;
    }
  }

  /// Optimistically toggles the like state of the post with [postId].
  ///
  /// Updates the UI immediately; the real like/unlike API call lands with
  /// the spec (TODO(UNVERIFIED)). If the list is not loaded, this is a
  /// no-op.
  void toggleLike(String postId) {
    final previous = state.valueOrNull;
    if (previous == null) return;
    state = AsyncData(
      previous
          .map(
            (post) => post.id == postId
                ? post.copyWith(
                    likedByMe: !post.likedByMe,
                    likeCount: post.likeCount + (post.likedByMe ? -1 : 1),
                  )
                : post,
          )
          .toList(),
    );
  }
}

/// Feed controller provider (override-friendly: tests override
/// [feedRepositoryProvider] with a fake).
final feedControllerProvider =
    AsyncNotifierProvider<FeedController, List<GramPost>>(
  FeedController.new,
  name: 'feedControllerProvider',
);

/// Story tray provider: all unexpired stories for followed accounts.
///
/// Auto-refreshes when [feedRepositoryProvider] is overridden.
final storiesProvider = FutureProvider<List<GramStory>>(
  (ref) => ref.watch(feedRepositoryProvider).fetchStories(),
  name: 'storiesProvider',
);
