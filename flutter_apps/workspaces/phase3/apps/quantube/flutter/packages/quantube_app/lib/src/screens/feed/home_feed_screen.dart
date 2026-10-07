// ============================================================================
// quantube_app - QuanTube home feed screen
// ============================================================================
//
// The first real QuanTube screen: renders [homeFeedProvider] (Riverpod
// AsyncNotifier in quantube_core) with four honest states:
//
//   loading -> [FeedSkeleton] (theme shimmer, same geometry as the cards)
//   error   -> error state with retry button
//   empty   -> empty state ("no videos yet")
//   data    -> pull-to-refresh [RefreshIndicator] + [VideoCard] list
//
// Tap a card -> `context.go('/watch/<videoId>')` (player screen is W3's
// scope: packages/quantube_app/lib/src/screens/player_screen.dart).
//
// Data note: [FeedRepository] is still abstract — the QuanTube API spec has
// not been written, so this screen renders whatever [feedRepositoryProvider]
// resolves to (fake in tests/demos, real impl once the spec lands). The
// screen does NOT change when the spec lands; only the provider wiring does.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:quantube_core/quantube_core.dart';

import 'widgets/feed_skeleton.dart';
import 'widgets/video_card.dart';

/// QuanTube home feed — post-login landing of the app (`/home`).
class HomeFeedScreen extends ConsumerWidget {
  const HomeFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Video>> feed = ref.watch(homeFeedProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('QuanTube'),
      ),
      body: feed.when(
        data: (List<Video> videos) => videos.isEmpty
            ? _EmptyState(
                onRefresh: () =>
                    ref.read(homeFeedProvider.notifier).refreshFeed(),
              )
            : _FeedList(
                videos: videos,
                onRefresh: () =>
                    ref.read(homeFeedProvider.notifier).refreshFeed(),
              ),
        loading: () => const FeedSkeleton(),
        error: (Object error, StackTrace stackTrace) => _ErrorState(
          error: error,
          onRetry: () => ref.read(homeFeedProvider.notifier).refreshFeed(),
        ),
      ),
    );
  }
}

/// Loaded feed: pull-to-refresh wraps a lazily-built card list.
class _FeedList extends StatelessWidget {
  const _FeedList({required this.videos, required this.onRefresh});

  final List<Video> videos;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(),
        itemCount: videos.length,
        itemBuilder: (BuildContext context, int index) {
          final Video video = videos[index];
          return VideoCard(
            key: ValueKey<String>(video.id),
            video: video,
            onTap: () => context.go('/watch/${video.id}'),
          );
        },
      ),
    );
  }
}

/// Empty state: valid load, zero videos.
class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onRefresh});

  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: <Widget>[
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.6,
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    Icon(
                      Icons.subscriptions_outlined,
                      size: 64,
                      color: scheme.onSurfaceVariant,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No videos yet',
                      style: textTheme.headlineSmall,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Your home feed is empty. Pull down to refresh '
                      'and check for new uploads.',
                      style: textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Error state: load failed, with a retry button wired to [HomeFeedNotifier].
class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final TextTheme textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              Icons.cloud_off_outlined,
              size: 64,
              color: scheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              "Couldn't load your feed",
              style: textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              // Surface the raw error in debug/dev; keep it generic for users
              // is a product copy decision the spec/design can refine later.
              error.toString(),
              style: textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
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
