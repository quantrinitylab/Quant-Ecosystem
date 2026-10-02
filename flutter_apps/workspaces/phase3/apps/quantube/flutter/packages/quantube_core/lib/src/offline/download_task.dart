// ============================================================================
// quantube_core - offline download task value model
// ============================================================================
//
// Immutable snapshot of one download's progress. The [DownloadManager] owns
// the stream of truth; widgets only ever read these snapshots, so the model
// is intentionally a dumb value class — no networking, no storage, no timers.
//
// Metadata (title, thumbnail) is deliberately nullable/fakeable: the
// QuanTube API spec does not exist yet (app-foundations/quantube), so real
// video metadata has no endpoint to come from. Fields invented here are
// marked TODO(UNVERIFIED) and must be re-sourced from the spec when it lands.

/// Lifecycle of a single offline download.
enum DownloadState {
  /// Accepted, waiting for a download slot / connectivity.
  queued,

  /// Actively transferring bytes.
  downloading,

  /// User-paused; resume continues from [DownloadTask.downloadedBytes].
  paused,

  /// All bytes present on disk and verified.
  complete,

  /// Terminally failed; [DownloadTask.failureReason] explains why.
  failed,
}

/// Immutable snapshot of one download.
///
/// Equality is by value across all fields, so Riverpod `watch` only rebuilds
/// when something actually changed. Use [copyWith] to derive the next
/// snapshot — never mutate.
class DownloadTask {
  const DownloadTask({
    required this.videoId,
    required this.title,
    this.thumbnailUrl,
    this.totalBytes,
    this.downloadedBytes = 0,
    this.state = DownloadState.queued,
    this.failureReason,
  });

  /// Stable backend identifier of the video being downloaded.
  final String videoId;

  /// Human title for display.
  ///
  /// TODO(UNVERIFIED): spec absent — the stub manager fabricates this from
  /// the videoId. Re-source from the real metadata endpoint once
  /// app-foundations/quantube/openapi.yaml exists.
  final String title;

  /// Thumbnail image URL, when metadata provided one.
  ///
  /// TODO(UNVERIFIED): same as [title] — no metadata endpoint exists yet.
  final String? thumbnailUrl;

  /// Expected total size in bytes, when known.
  ///
  /// Null until the real implementation reads `Content-Length` (or the
  /// spec's metadata response). A null total means "indeterminate": the UI
  /// shows a spinner-bar instead of a percentage.
  final int? totalBytes;

  /// Bytes already persisted to the download file.
  final int downloadedBytes;

  /// Current lifecycle state.
  final DownloadState state;

  /// Set only when [state] is [DownloadState.failed].
  final String? failureReason;

  /// 0.0–1.0 completion fraction, or null when the total size is unknown.
  double? get progress {
    final int? total = totalBytes;
    if (total == null || total <= 0) return null;
    return (downloadedBytes / total).clamp(0.0, 1.0);
  }

  /// True when no further action can change this snapshot
  /// ([DownloadState.complete] or [DownloadState.failed]).
  bool get isTerminal =>
      state == DownloadState.complete || state == DownloadState.failed;

  DownloadTask copyWith({
    String? videoId,
    String? title,
    String? thumbnailUrl,
    int? totalBytes,
    int? downloadedBytes,
    DownloadState? state,
    String? failureReason,
  }) {
    return DownloadTask(
      videoId: videoId ?? this.videoId,
      title: title ?? this.title,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      totalBytes: totalBytes ?? this.totalBytes,
      downloadedBytes: downloadedBytes ?? this.downloadedBytes,
      state: state ?? this.state,
      failureReason: failureReason ?? this.failureReason,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DownloadTask &&
          videoId == other.videoId &&
          title == other.title &&
          thumbnailUrl == other.thumbnailUrl &&
          totalBytes == other.totalBytes &&
          downloadedBytes == other.downloadedBytes &&
          state == other.state &&
          failureReason == other.failureReason;

  @override
  int get hashCode => Object.hash(
        videoId,
        title,
        thumbnailUrl,
        totalBytes,
        downloadedBytes,
        state,
        failureReason,
      );

  @override
  String toString() =>
      'DownloadTask(videoId: $videoId, state: $state, '
      'downloadedBytes: $downloadedBytes, totalBytes: $totalBytes)';
}
