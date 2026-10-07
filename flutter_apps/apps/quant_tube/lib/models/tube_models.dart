import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Segment types for Sovereign Segment-Skipping (SponsorBlock parity).
enum SegmentType {
  sponsor,
  selfPromo,
  intermission,
  intro,
  outro,
  highlight,
}

extension SegmentTypeExtension on SegmentType {
  String get displayName {
    switch (this) {
      case SegmentType.sponsor:
        return 'Sponsor Segment';
      case SegmentType.selfPromo:
        return 'Self Promotion';
      case SegmentType.intermission:
        return 'Intermission';
      case SegmentType.intro:
        return 'Intro Animation';
      case SegmentType.outro:
        return 'Outro / Credits';
      case SegmentType.highlight:
        return 'Chapter Highlight';
    }
  }

  /// Sovereign Segment Indicator Colors:
  /// Sponsor #F59E0B, Self-promo #3B82F6, Intermission #10B981
  Color get indicatorColor {
    switch (this) {
      case SegmentType.sponsor:
        return const Color(0xFFF59E0B);
      case SegmentType.selfPromo:
        return const Color(0xFF3B82F6);
      case SegmentType.intermission:
        return const Color(0xFF10B981);
      case SegmentType.intro:
        return QuantColors.statusSuccess;
      case SegmentType.outro:
        return QuantColors.obsidianPurple;
      case SegmentType.highlight:
        return QuantColors.sovereignCyan;
    }
  }

  IconData get icon {
    switch (this) {
      case SegmentType.sponsor:
        return Icons.campaign_rounded;
      case SegmentType.selfPromo:
        return Icons.star_border_rounded;
      case SegmentType.intermission:
        return Icons.hourglass_empty_rounded;
      case SegmentType.intro:
        return Icons.play_circle_outline_rounded;
      case SegmentType.outro:
        return Icons.stop_circle_outlined;
      case SegmentType.highlight:
        return Icons.bookmark_border_rounded;
    }
  }
}

/// Represents a SponsorBlock-class segment marker on the video timeline.
class VideoSegment {
  final String id;
  final String title;
  final double startSeconds;
  final double endSeconds;
  final SegmentType type;
  final bool autoSkip;

  const VideoSegment({
    required this.id,
    required this.title,
    required this.startSeconds,
    required this.endSeconds,
    required this.type,
    this.autoSkip = true,
  }) : assert(startSeconds >= 0, 'startSeconds must be non-negative'),
       assert(endSeconds > startSeconds, 'endSeconds must be greater than startSeconds');

  double get durationSeconds => endSeconds - startSeconds;

  String get durationFormatted {
    final s = durationSeconds.round();
    return '${s}s';
  }

  bool containsTime(double currentSeconds) {
    return currentSeconds >= startSeconds && currentSeconds < endSeconds;
  }
}

/// Available video stream resolution levels.
class VideoResolution {
  final String id;
  final String label;
  final int height;
  final int fps;
  final bool isHdr;

  const VideoResolution({
    required this.id,
    required this.label,
    required this.height,
    this.fps = 60,
    this.isHdr = false,
  });

  static const List<VideoResolution> standards = [
    VideoResolution(id: '4k', label: '2160p60 4K HDR', height: 2160, isHdr: true),
    VideoResolution(id: '1080p60', label: '1080p60 HD', height: 1080),
    VideoResolution(id: '720p60', label: '720p60 HD', height: 720),
    VideoResolution(id: '480p', label: '480p SD', height: 480, fps: 30),
    VideoResolution(id: 'auto', label: 'Auto (1080p60 Adaptive)', height: 1080),
  ];
}

/// Sovereign Video Item Domain Model
class VideoItem {
  final String id;
  final String title;
  final String channelTitle;
  final String channelHandle;
  final String channelAvatarUrl;
  final bool isChannelVerified;
  final int viewsCount;
  final String uploadTimeAgo;
  final int durationSeconds;
  final String thumbnailUrl;
  final String streamUrl;
  final String category;
  final int likesCount;
  final int dislikesCount;
  final String description;
  final List<VideoSegment> segments;
  final int commentsCount;
  final bool isSavedToLibrary;
  final bool isPublicFeed;

  const VideoItem({
    required this.id,
    required this.title,
    required this.channelTitle,
    required this.channelHandle,
    required this.channelAvatarUrl,
    required this.isChannelVerified,
    required this.viewsCount,
    required this.uploadTimeAgo,
    required this.durationSeconds,
    required this.thumbnailUrl,
    required this.streamUrl,
    required this.category,
    required this.likesCount,
    required this.dislikesCount,
    required this.description,
    required this.segments,
    required this.commentsCount,
    this.isSavedToLibrary = false,
    this.isPublicFeed = true,
  });

  String get formattedViews {
    if (viewsCount >= 1000000) {
      return '${(viewsCount / 1000000).toStringAsFixed(1)}M views';
    } else if (viewsCount >= 1000) {
      return '${(viewsCount / 1000).toStringAsFixed(0)}K views';
    }
    return '$viewsCount views';
  }

  String get formattedLikes {
    if (likesCount >= 1000000) {
      return '${(likesCount / 1000000).toStringAsFixed(1)}M';
    } else if (likesCount >= 1000) {
      return '${(likesCount / 1000).toStringAsFixed(0)}K';
    }
    return '$likesCount';
  }

  String get formattedDuration {
    final minutes = durationSeconds ~/ 60;
    final seconds = durationSeconds % 60;
    final secondsStr = seconds < 10 ? '0$seconds' : '$seconds';
    if (minutes >= 60) {
      final hours = minutes ~/ 60;
      final remainingMin = minutes % 60;
      final minStr = remainingMin < 10 ? '0$remainingMin' : '$remainingMin';
      return '$hours:$minStr:$secondsStr';
    }
    return '$minutes:$secondsStr';
  }

  bool get hasSponsorBlockSegments => segments.any(
    (s) => s.type == SegmentType.sponsor ||
           s.type == SegmentType.selfPromo ||
           s.type == SegmentType.intermission,
  );
}

/// Rich comment on video
class VideoComment {
  final String id;
  final String authorName;
  final String authorHandle;
  final String authorAvatarUrl;
  final bool isChannelOwner;
  final String timeAgo;
  final String content;
  final int likesCount;
  final int repliesCount;
  final bool isLiked;

  const VideoComment({
    required this.id,
    required this.authorName,
    required this.authorHandle,
    required this.authorAvatarUrl,
    required this.isChannelOwner,
    required this.timeAgo,
    required this.content,
    required this.likesCount,
    required this.repliesCount,
    this.isLiked = false,
  });
}

/// Synchronized Lyric Line for Spotify-class music player
class LyricLine {
  final double timeSeconds;
  final String text;

  const LyricLine({
    required this.timeSeconds,
    required this.text,
  });
}

/// Spotify-class Music Track
class MusicTrack {
  final String id;
  final String title;
  final String artist;
  final String album;
  final String albumArtUrl;
  final int durationSeconds;
  final List<LyricLine> lyrics;
  final String audioUrl;
  final bool isLiked;

  const MusicTrack({
    required this.id,
    required this.title,
    required this.artist,
    required this.album,
    required this.albumArtUrl,
    required this.durationSeconds,
    required this.lyrics,
    required this.audioUrl,
    this.isLiked = false,
  });

  String get formattedDuration {
    final minutes = durationSeconds ~/ 60;
    final seconds = durationSeconds % 60;
    final secondsStr = seconds < 10 ? '0$seconds' : '$seconds';
    return '$minutes:$secondsStr';
  }
}

/// Creator Studio Metrics & Telemetry
class CreatorStudioMetrics {
  final String channelName;
  final String handle;
  final String avatarUrl;
  final bool isVerified;
  final int subscribersCount;
  final int totalViews;
  final double quantCreditsEarned;
  final double monthlyRevenueUsd;
  final String copyrightScanStatus;
  final List<VideoItem> recentUploads;

  const CreatorStudioMetrics({
    required this.channelName,
    required this.handle,
    required this.avatarUrl,
    required this.isVerified,
    required this.subscribersCount,
    required this.totalViews,
    required this.quantCreditsEarned,
    required this.monthlyRevenueUsd,
    required this.copyrightScanStatus,
    required this.recentUploads,
  });

  String get formattedSubscribers {
    if (subscribersCount >= 1000000) {
      return '${(subscribersCount / 1000000).toStringAsFixed(2)}M';
    } else if (subscribersCount >= 1000) {
      return '${(subscribersCount / 1000).toStringAsFixed(1)}K';
    }
    return '$subscribersCount';
  }

  String get formattedMonthlyRevenue => '\$${monthlyRevenueUsd.toStringAsFixed(2)}';
  String get formattedQuantCredits => '${quantCreditsEarned.toStringAsFixed(0)} QC';
}

/// 4-Stage Multi-Progress Studio Pipeline:
/// Uploading -> Transcoding -> Thumbnail -> Published
enum UploadStage {
  uploading,
  transcoding,
  thumbnail,
  published,
}

extension UploadStageExtension on UploadStage {
  String get title {
    switch (this) {
      case UploadStage.uploading:
        return 'Uploading (4K RAW)';
      case UploadStage.transcoding:
        return 'Transcoding (AV1 / 120Hz)';
      case UploadStage.thumbnail:
        return 'Thumbnail & CID Verification';
      case UploadStage.published:
        return 'Published (Decentralized Stream)';
    }
  }

  int get stepNumber {
    switch (this) {
      case UploadStage.uploading:
        return 1;
      case UploadStage.transcoding:
        return 2;
      case UploadStage.thumbnail:
        return 3;
      case UploadStage.published:
        return 4;
    }
  }

  IconData get icon {
    switch (this) {
      case UploadStage.uploading:
        return Icons.cloud_upload_rounded;
      case UploadStage.transcoding:
        return Icons.memory_rounded;
      case UploadStage.thumbnail:
        return Icons.image_search_rounded;
      case UploadStage.published:
        return Icons.check_circle_rounded;
    }
  }

  Color get accentColor {
    switch (this) {
      case UploadStage.uploading:
        return const Color(0xFFF59E0B); // Amber
      case UploadStage.transcoding:
        return const Color(0xFF38BDF8); // Cyan
      case UploadStage.thumbnail:
        return const Color(0xFFA855F7); // Purple
      case UploadStage.published:
        return const Color(0xFF10B981); // Emerald Green
    }
  }
}

/// Creator Video Upload Session State
class VideoUploadSession {
  final String id;
  final String title;
  final String category;
  final UploadStage stage;
  final double stageProgress; // 0.0 to 1.0
  final double overallProgress; // 0.0 to 1.0
  final double speedMbps;
  final int etaSeconds;
  final String contentCid;
  final bool isMonetized;
  final bool autoSkipScanEnabled;

  const VideoUploadSession({
    required this.id,
    required this.title,
    required this.category,
    required this.stage,
    required this.stageProgress,
    required this.overallProgress,
    required this.speedMbps,
    required this.etaSeconds,
    required this.contentCid,
    this.isMonetized = true,
    this.autoSkipScanEnabled = true,
  });

  String get formattedProgress => '${(overallProgress * 100).toStringAsFixed(0)}%';
  String get formattedSpeed => '${speedMbps.toStringAsFixed(1)} MB/s';
  String get formattedEta => '${etaSeconds}s remaining';
  bool get isCompleted => stage == UploadStage.published && overallProgress >= 1.0;
}

/// Sovereign Channel Profile & Public Unauthenticated Manifest
class ChannelProfile {
  final String id;
  final String name;
  final String handle;
  final String avatarUrl;
  final String bannerUrl;
  final int subscribersCount;
  final bool isVerified;
  final String description;
  final List<VideoItem> publicVideos;
  final bool allowUnauthenticatedAccess;

  const ChannelProfile({
    required this.id,
    required this.name,
    required this.handle,
    required this.avatarUrl,
    required this.bannerUrl,
    required this.subscribersCount,
    required this.isVerified,
    required this.description,
    required this.publicVideos,
    this.allowUnauthenticatedAccess = true,
  });

  String get formattedSubscribers {
    if (subscribersCount >= 1000000) {
      return '${(subscribersCount / 1000000).toStringAsFixed(2)}M';
    } else if (subscribersCount >= 1000) {
      return '${(subscribersCount / 1000).toStringAsFixed(1)}K';
    }
    return '$subscribersCount';
  }
}
