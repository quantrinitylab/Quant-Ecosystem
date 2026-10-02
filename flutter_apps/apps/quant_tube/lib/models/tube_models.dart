import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Segment types for Sovereign Segment-Skipping (SponsorBlock parity).
enum SegmentType {
  sponsor,
  intro,
  outro,
  selfPromo,
  highlight,
}

extension SegmentTypeExtension on SegmentType {
  String get displayName {
    switch (this) {
      case SegmentType.sponsor:
        return 'Sponsor Segment';
      case SegmentType.intro:
        return 'Intro Animation';
      case SegmentType.outro:
        return 'Outro / Credits';
      case SegmentType.selfPromo:
        return 'Self Promotion';
      case SegmentType.highlight:
        return 'Chapter Highlight';
    }
  }

  Color get indicatorColor {
    switch (this) {
      case SegmentType.sponsor:
        return QuantColors.moltenAmber;
      case SegmentType.intro:
        return QuantColors.statusSuccess;
      case SegmentType.outro:
        return QuantColors.obsidianPurple;
      case SegmentType.selfPromo:
        return QuantColors.sunsetGold;
      case SegmentType.highlight:
        return QuantColors.sovereignCyan;
    }
  }

  IconData get icon {
    switch (this) {
      case SegmentType.sponsor:
        return Icons.campaign_rounded;
      case SegmentType.intro:
        return Icons.play_circle_outline_rounded;
      case SegmentType.outro:
        return Icons.stop_circle_outlined;
      case SegmentType.selfPromo:
        return Icons.star_border_rounded;
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

  bool get hasSponsorBlockSegments => segments.any((s) => s.type == SegmentType.sponsor);
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
