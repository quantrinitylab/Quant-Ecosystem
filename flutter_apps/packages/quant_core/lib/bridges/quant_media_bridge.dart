// Sovereign Quant Ecosystem - Media & Video Processing Architectural Bridge
// Encapsulates 9:16 vertical feed preloading and FFmpegKit pipeline command generation.
// Strictly ZERO raw Unicode emojis throughout this file.

/// Preload policy configuration for 9:16 vertical video feed (QuantGram / QuanTube Shorts).
class QuantPreloadPolicy {
  /// Number of upcoming video pages to buffer ahead of current viewport.
  final int preloadCount;

  /// Maximum number of active hardware video decoders to maintain concurrently.
  final int maxActiveDecoders;

  /// Whether to pause background decoders when leaving viewport.
  final bool autoPauseOffscreen;

  /// Cache storage limit in megabytes before eviction triggers.
  final int maxCacheMb;

  const QuantPreloadPolicy({
    this.preloadCount = 4,
    this.maxActiveDecoders = 3,
    this.autoPauseOffscreen = true,
    this.maxCacheMb = 512,
  });

  /// Evaluates whether a video at [targetIndex] should be preloaded given [currentIndex].
  bool shouldPreload(int targetIndex, int currentIndex) {
    final distance = targetIndex - currentIndex;
    return distance >= 0 && distance <= preloadCount;
  }
}

/// Represents non-destructive video trimming parameters.
class QuantVideoTrimRange {
  final double startSeconds;
  final double endSeconds;

  const QuantVideoTrimRange({
    required this.startSeconds,
    required this.endSeconds,
  }) : assert(startSeconds >= 0, 'Start seconds must be non-negative'),
       assert(endSeconds > startSeconds, 'End seconds must be greater than start seconds');

  double get durationSeconds => endSeconds - startSeconds;

  Map<String, dynamic> toJson() => {
        'startSeconds': startSeconds,
        'endSeconds': endSeconds,
        'durationSeconds': durationSeconds,
      };
}

/// Command generator for FFmpeg video processing pipelines.
class QuantFFmpegCommandBuilder {
  /// Builds command to strip audio track from source video.
  /// Result: video stream copied without re-encoding (-an).
  static String buildStripAudioCommand({
    required String sourceVideoPath,
    required String outputVideoPath,
  }) {
    return '-i "$sourceVideoPath" -c copy -an "$outputVideoPath"';
  }

  /// Builds command to multiplex an audio soundtrack into video with precise duration clipping.
  static String buildMuxAudioCommand({
    required String sourceVideoPath,
    required String sourceAudioPath,
    required String outputVideoPath,
    required double durationSeconds,
  }) {
    return '-i "$sourceVideoPath" -i "$sourceAudioPath" -t ${durationSeconds.toStringAsFixed(2)} '
        '-c:v copy -c:a aac -strict experimental -map 0:v:0 -map 1:a:0 "$outputVideoPath"';
  }

  /// Builds command to trim video between [startSeconds] and [endSeconds].
  static String buildTrimVideoCommand({
    required String sourceVideoPath,
    required String outputVideoPath,
    required double startSeconds,
    required double durationSeconds,
  }) {
    return '-ss ${startSeconds.toStringAsFixed(2)} -i "$sourceVideoPath" '
        '-t ${durationSeconds.toStringAsFixed(2)} -c:v libx264 -preset ultrafast -crf 23 -c:a aac "$outputVideoPath"';
  }

  /// Builds command to extract a high-resolution preview thumbnail frame at [atSeconds].
  static String buildExtractThumbnailCommand({
    required String sourceVideoPath,
    required String outputImagePath,
    double atSeconds = 0.5,
  }) {
    return '-ss ${atSeconds.toStringAsFixed(2)} -i "$sourceVideoPath" -vframes 1 -q:v 2 "$outputImagePath"';
  }

  /// Builds command to scale video into 9:16 vertical aspect ratio (1080x1920) with letterbox padding.
  static String buildScaleToVertical9x16Command({
    required String sourceVideoPath,
    required String outputVideoPath,
  }) {
    return '-i "$sourceVideoPath" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" '
        '-c:v libx264 -preset fast -crf 22 -c:a copy "$outputVideoPath"';
  }
}
