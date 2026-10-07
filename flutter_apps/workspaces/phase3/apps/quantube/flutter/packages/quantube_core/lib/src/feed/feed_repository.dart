// ============================================================================
// quantube_core - home feed repository contract (QuanTube)
// ============================================================================
//
// Deliberately an ABSTRACT contract only.
//
// The QuanTube API spec (app-foundations/quantube/openapi.yaml) has not been
// written yet, so there is NO concrete implementation in this shift —
// inventing one would require inventing endpoints, paths, query params, and
// pagination semantics, which the hard rule forbids.
//
// The concrete implementation (backed by `QuantApiClient`) lands in a later
// shift once the spec exists. Until then:
//   - [FeedRepository] is abstract — no URL or endpoint strings anywhere;
//   - [feedRepositoryProvider] (see feed_providers.dart) throws until a test
//     or demo overrides it with a fake/stub implementation.

import 'video_model.dart';

/// Abstract home-feed data source for QuanTube.
///
/// Implementations are NOT allowed to hard-code QuanTube endpoint strings
/// until the API spec lands; keep endpoints behind the spec-derived client
/// methods when the spec exists.
abstract class FeedRepository {
  /// Returns one page of home-feed videos.
  ///
  /// [limit] is a client-side page size hint; the server-side pagination
  /// contract (cursor vs offset) comes from the spec.
  ///
  /// TODO(UNVERIFIED): verify the pagination contract against the
  /// QuanTube API spec when it lands (cursor token? page size caps?).
  Future<List<Video>> getHomeFeed({int limit = 24});

  /// Broadcast stream of home-feed snapshots (push/realtime updates).
  ///
  /// The notifier subscribes to this for the screen's lifetime so the feed
  /// can react to server pushes without a manual pull-to-refresh.
  ///
  /// TODO(UNVERIFIED): verify against the spec whether home feed is
  /// realtime-push at all (websocket? SSE? none?) — a fake implementation
  /// may return [Stream.empty].
  Stream<List<Video>> watchHomeFeed();
}
