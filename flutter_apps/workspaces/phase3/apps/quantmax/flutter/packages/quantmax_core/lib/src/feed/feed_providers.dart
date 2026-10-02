// ============================================================================
// quantmax_core - feed Riverpod providers (W2)
// ============================================================================
//
// Cross-worker contract (naams FIXED — mat badlo):
//   - [feedItemsProvider] — W3 (UI worker) isi naam se import karega.
//   - [maxFeedRepositoryProvider] — tests/fakes yahin swap honge.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'feed_models.dart';
import 'feed_repository.dart';

/// Feed repository ka single injection point.
///
/// Default: [LocalSampleFeedRepository] (sample data — UI dev only).
/// Spec land hone par real implementation se override karo
/// (`ProviderScope(overrides: [...])` ya yahan default badlo).
final maxFeedRepositoryProvider = Provider<MaxFeedRepository>(
  (ref) => const LocalSampleFeedRepository(),
  name: 'maxFeedRepositoryProvider',
);

/// Current feed page. **Naam FIXED hai** — W3 (UI worker) `feedItemsProvider`
/// se import karta hai.
///
/// TODO(UNVERIFIED): infinite scroll / cursor pagination spec ke baad — abhi
/// single page of 20 sample items.
final feedItemsProvider = FutureProvider<List<MaxVideo>>(
  (ref) => ref.watch(maxFeedRepositoryProvider).fetchFeed(limit: 20),
  name: 'feedItemsProvider',
);
