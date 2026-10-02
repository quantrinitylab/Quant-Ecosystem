// ============================================================================
// quantube_core - home feed Riverpod graph (QuanTube)
// ============================================================================
//
// The repository itself is intentionally NOT implemented here: the QuanTube
// API spec (app-foundations/quantube/openapi.yaml) does not exist yet, so
// the only honest implementation is "no implementation" until the spec
// lands. [feedRepositoryProvider] throws [UnimplementedError]; tests and
// demos override it with a fake.
//
// Once the spec lands, the concrete FeedRepository implementation is wired
// here (single line change in the provider body) — nothing else changes.

import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'feed_repository.dart';
import 'video_model.dart';

/// Home-feed data source.
///
/// Override this provider in tests/demos with a fake [FeedRepository].
/// In production wiring (after the API spec lands) this returns the
/// spec-derived concrete implementation.
final feedRepositoryProvider = Provider<FeedRepository>(
  (Ref ref) => throw UnimplementedError(
    'FeedRepository has no implementation yet — the QuanTube API spec '
    '(app-foundations/quantube/openapi.yaml) has not been written. '
    'Override feedRepositoryProvider with a fake in tests/demos, or wire '
    'the concrete implementation here once the spec lands.',
  ),
  name: 'feedRepositoryProvider',
);

/// Async state holder for the home feed.
///
/// Subscribes to [FeedRepository.watchHomeFeed] for the screen's lifetime so
/// realtime pushes update the UI; [refreshFeed] re-fetches one page for
/// pull-to-refresh and the retry button.
class HomeFeedNotifier extends AsyncNotifier<List<Video>> {
  @override
  Future<List<Video>> build() async {
    final FeedRepository repository = ref.watch(feedRepositoryProvider);

    // Keep the realtime snapshot stream alive while the provider is alive.
    // Each push replaces the state — the feed UI re-renders cheaply because
    // the list is built with ListView.builder + VideoCard (stateless).
    final StreamSubscription<List<Video>> subscription =
        repository.watchHomeFeed().listen(
      (List<Video> videos) {
        state = AsyncData(videos);
      },
    );
    ref.onDispose(subscription.cancel);

    return repository.getHomeFeed();
  }

  /// Re-fetches the current feed page (pull-to-refresh / retry).
  ///
  /// The watchHomeFeed subscription (see [build]) keeps running — a push that
  /// lands mid-refresh still wins, which is the correct realtime behaviour.
  Future<void> refreshFeed() async {
    state = const AsyncValue<List<Video>>.loading();
    state = await AsyncValue.guard(
      () => ref.read(feedRepositoryProvider).getHomeFeed(),
    );
  }
}

/// Public feed state for the home feed screen.
final homeFeedProvider =
    AsyncNotifierProvider<HomeFeedNotifier, List<Video>>(
  HomeFeedNotifier.new,
  name: 'homeFeedProvider',
);
