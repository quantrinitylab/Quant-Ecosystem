// ============================================================================
// gram_app - feed screen (Shift 2, W2)
// ============================================================================
//
// The main feed: stories rail on top, posts list below, pull-to-refresh,
// infinite scroll (80% threshold -> controller.loadMore()).
//
// No invented API calls — everything goes through the W1 feed domain
// contract: feedControllerProvider (AsyncNotifier<List<GramPost>>) and
// storiesProvider.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gram_core/gram_core.dart';

import '../widgets/post_card.dart';
import '../widgets/story_rail.dart';

/// QuantGram home feed.
///
/// Performance laws (MISSION.md): ListView.builder with
/// addAutomaticKeepAlives: false, every card inside a RepaintBoundary,
/// images carry placeholder + errorWidget via [PostCard].
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

class _FeedScreenState extends ConsumerState<FeedScreen> {
  final ScrollController _scrollController = ScrollController();

  /// Guards concurrent loadMore calls — set while a load-more is in flight.
  bool _fetchingMore = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients || _fetchingMore) return;
    final ScrollPosition position = _scrollController.position;
    final double threshold =
        position.minScrollExtent + (position.maxScrollExtent * 0.8);
    if (position.pixels >= threshold) {
      _fetchingMore = true;
      ref
          .read(feedControllerProvider.notifier)
          .loadMore()
          .whenComplete(() {
        if (mounted) _fetchingMore = false;
      });
    }
  }

  Future<void> _onRefresh() {
    // The controller owns the refresh; just forward and await.
    return ref.read(feedControllerProvider.notifier).refresh();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<GramPost>> feed =
        ref.watch(feedControllerProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('QuantGram'),
        centerTitle: false,
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.favorite_border),
            onPressed: () {
              // TODO(UNVERIFIED): activity/notifications route once spec
              // defines it.
            },
          ),
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline),
            onPressed: () {
              // TODO(UNVERIFIED): direct messages route once spec defines it.
            },
          ),
        ],
      ),
      body: feed.when(
        data: (List<GramPost> posts) {
          if (posts.isEmpty) {
            return RefreshIndicator(
              onRefresh: _onRefresh,
              child: const _FeedEmpty(),
            );
          }
          return RefreshIndicator(
            onRefresh: _onRefresh,
            child: Column(
              children: <Widget>[
                const StoryRail(),
                Expanded(
                  child: ListView.builder(
                    controller: _scrollController,
                    padding: EdgeInsets.zero,
                    itemCount: posts.length + 1,
                    addAutomaticKeepAlives: false,
                    itemBuilder: (BuildContext context, int index) {
                      if (index == posts.length) {
                        return const _LoadMoreIndicator();
                      }
                      return RepaintBoundary(
                        child: PostCard(post: posts[index]),
                      );
                    },
                  ),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object error, StackTrace stackTrace) => _FeedError(
          onRetry: () =>
              ref.read(feedControllerProvider.notifier).refresh(),
        ),
      ),
    );
  }
}

/// Trailing spinner while loadMore is in flight; empty otherwise.
class _LoadMoreIndicator extends ConsumerWidget {
  const _LoadMoreIndicator();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // The controller signals in-flight pagination via its own state; the
    // feed list is the current page. A spinner shows only while the
    // parent marks a fetch in flight — simplest observable: the
    // AsyncValue is loading-with-data. Otherwise render nothing.
    final AsyncValue<List<GramPost>> feed =
        ref.watch(feedControllerProvider);
    final bool isLoadingMore = feed is AsyncLoading<List<GramPost>> &&
        feed.hasValue;
    if (!isLoadingMore) return const SizedBox.shrink();
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 16),
      child: Center(child: CircularProgressIndicator()),
    );
  }
}

/// Branded empty state — scrollable so pull-to-refresh still works.
class _FeedEmpty extends StatelessWidget {
  const _FeedEmpty();

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: <Widget>[
        SizedBox(height: MediaQuery.sizeOf(context).height * 0.2),
        const Center(
          child: Icon(Icons.photo_camera_outlined, size: 64),
        ),
        const SizedBox(height: 16),
        Center(
          child: Text(
            'Abhi feed khaali hai',
            style: GramTextStyles.h4,
          ),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            'Naye posts ke liye neeche kheecho',
            style: GramTextStyles.bodySmall.copyWith(
              color: GramColors.foregroundSecondaryDark,
            ),
          ),
        ),
      ],
    );
  }
}

/// Error state with retry.
class _FeedError extends StatelessWidget {
  const _FeedError({required this.onRetry});

  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.cloud_off_outlined, size: 48),
            const SizedBox(height: 16),
            Text(
              'Feed load nahi hua',
              style: GramTextStyles.h4,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Connection check karo aur dobara try karo',
              style: GramTextStyles.bodySmall.copyWith(
                color: GramColors.foregroundSecondaryDark,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}
