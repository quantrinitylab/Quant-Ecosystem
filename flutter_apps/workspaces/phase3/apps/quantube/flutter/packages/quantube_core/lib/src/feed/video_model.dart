// ============================================================================
// quantube_core - Video domain model (QuanTube home feed)
// ============================================================================
//
// EVERY FIELD IS UNVERIFIED UNTIL THE SPEC LANDS.
//
// The QuanTube API spec (app-foundations/quantube/openapi.yaml) has not been
// written yet, so this model is the W2 (home feed UI) best-guess shape from
// the task brief: id, title, channelName, duration, thumbnailUrl?, viewCount,
// publishedAt. When the spec lands, every field name/type must be verified
// against it (the per-field TODO(UNVERIFIED) markers below are the checklist).

/// A single video item on the QuanTube home feed.
///
/// Immutable value object. Constructed by [FeedRepository] implementations
/// from API responses — NO endpoint strings live here (see
/// feed_repository.dart).
class Video {
  const Video({
    required this.id,
    required this.title,
    required this.channelName,
    required this.duration,
    this.thumbnailUrl,
    required this.viewCount,
    required this.publishedAt,
  });

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec.
  final String id;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec.
  final String title;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec.
  final String channelName;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec
  /// (spec may carry seconds as int or ISO-8601 duration string).
  final Duration duration;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec.
  /// Null means "no thumbnail available" — the card renders a placeholder.
  final String? thumbnailUrl;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec
  /// (spec may carry viewCount as string, or omit it for unlisted videos).
  final int viewCount;

  /// TODO(UNVERIFIED): field name/type vs the QuanTube API spec
  /// (spec may carry an ISO-8601/RFC-3339 string in UTC).
  final DateTime publishedAt;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Video &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          title == other.title &&
          channelName == other.channelName &&
          duration == other.duration &&
          thumbnailUrl == other.thumbnailUrl &&
          viewCount == other.viewCount &&
          publishedAt == other.publishedAt;

  @override
  int get hashCode => Object.hash(
        id,
        title,
        channelName,
        duration,
        thumbnailUrl,
        viewCount,
        publishedAt,
      );

  @override
  String toString() =>
      'Video(id: $id, title: $title, channelName: $channelName, '
      'duration: $duration, viewCount: $viewCount)';
}
