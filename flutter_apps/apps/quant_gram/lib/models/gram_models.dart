import 'package:flutter/material.dart';

/// Sovereign QuantGram Domain Models
/// Strictly ZERO raw Unicode emojis throughout this file.

/// Video Reel Model for 9:16 Vertical Video Experience
class ReelItem {
  final String id;
  final String creatorId;
  final String creatorHandle;
  final String creatorDisplayName;
  final String creatorAvatarUrl;
  final bool isCreatorVerified;
  final String caption;
  final List<String> hashtags;
  final String audioTrack;
  final String audioArtist;
  final int likesCount;
  final int commentsCount;
  final int shareCount;
  final int bookmarksCount;
  final int viewsCount;
  final bool isLiked;
  final bool isBookmarked;
  final String videoUrl;
  final String thumbnailUrl;
  final double durationSeconds;
  final DateTime createdAt;
  final List<Color> gradientColors;

  const ReelItem({
    required this.id,
    required this.creatorId,
    required this.creatorHandle,
    required this.creatorDisplayName,
    required this.creatorAvatarUrl,
    this.isCreatorVerified = true,
    required this.caption,
    required this.hashtags,
    required this.audioTrack,
    this.audioArtist = 'Original Audio',
    required this.likesCount,
    required this.commentsCount,
    required this.shareCount,
    required this.bookmarksCount,
    required this.viewsCount,
    this.isLiked = false,
    this.isBookmarked = false,
    required this.videoUrl,
    required this.thumbnailUrl,
    this.durationSeconds = 15.0,
    required this.createdAt,
    this.gradientColors = const [Color(0xFF1E1B4B), Color(0xFF0F172A)],
  });

  ReelItem copyWith({
    bool? isLiked,
    int? likesCount,
    bool? isBookmarked,
    int? bookmarksCount,
    int? commentsCount,
    int? shareCount,
  }) {
    return ReelItem(
      id: id,
      creatorId: creatorId,
      creatorHandle: creatorHandle,
      creatorDisplayName: creatorDisplayName,
      creatorAvatarUrl: creatorAvatarUrl,
      isCreatorVerified: isCreatorVerified,
      caption: caption,
      hashtags: hashtags,
      audioTrack: audioTrack,
      audioArtist: audioArtist,
      likesCount: likesCount ?? this.likesCount,
      commentsCount: commentsCount ?? this.commentsCount,
      shareCount: shareCount ?? this.shareCount,
      bookmarksCount: bookmarksCount ?? this.bookmarksCount,
      viewsCount: viewsCount,
      isLiked: isLiked ?? this.isLiked,
      isBookmarked: isBookmarked ?? this.isBookmarked,
      videoUrl: videoUrl,
      thumbnailUrl: thumbnailUrl,
      durationSeconds: durationSeconds,
      createdAt: createdAt,
      gradientColors: gradientColors,
    );
  }
}

/// 24-Hour Ephemeral Story Model
class StoryItem {
  final String id;
  final String userId;
  final String username;
  final String avatarUrl;
  final bool isUnwatched;
  final String mediaUrl;
  final String timestampText;
  final bool hasCloseFriendsBorder;
  final String storyCaption;
  final List<Color> backgroundGradient;

  const StoryItem({
    required this.id,
    required this.userId,
    required this.username,
    required this.avatarUrl,
    this.isUnwatched = true,
    required this.mediaUrl,
    required this.timestampText,
    this.hasCloseFriendsBorder = false,
    this.storyCaption = '',
    this.backgroundGradient = const [Color(0xFF311042), Color(0xFF090A0E)],
  });

  StoryItem copyWith({
    bool? isUnwatched,
  }) {
    return StoryItem(
      id: id,
      userId: userId,
      username: username,
      avatarUrl: avatarUrl,
      isUnwatched: isUnwatched ?? this.isUnwatched,
      mediaUrl: mediaUrl,
      timestampText: timestampText,
      hasCloseFriendsBorder: hasCloseFriendsBorder,
      storyCaption: storyCaption,
      backgroundGradient: backgroundGradient,
    );
  }
}

/// Reel Comment Model with Support for Nested Reply Threads
class CommentItem {
  final String id;
  final String reelId;
  final String userId;
  final String username;
  final String avatarUrl;
  final String text;
  final String timestampText;
  final int likesCount;
  final bool isLiked;
  final bool isCreatorPinned;
  final List<CommentItem> replies;

  const CommentItem({
    required this.id,
    required this.reelId,
    required this.userId,
    required this.username,
    required this.avatarUrl,
    required this.text,
    required this.timestampText,
    required this.likesCount,
    this.isLiked = false,
    this.isCreatorPinned = false,
    this.replies = const [],
  });

  CommentItem copyWith({
    bool? isLiked,
    int? likesCount,
    List<CommentItem>? replies,
  }) {
    return CommentItem(
      id: id,
      reelId: reelId,
      userId: userId,
      username: username,
      avatarUrl: avatarUrl,
      text: text,
      timestampText: timestampText,
      likesCount: likesCount ?? this.likesCount,
      isLiked: isLiked ?? this.isLiked,
      isCreatorPinned: isCreatorPinned,
      replies: replies ?? this.replies,
    );
  }
}

/// Creator Profile Model for Matrix Screen
class CreatorProfile {
  final String id;
  final String handle;
  final String displayName;
  final String avatarUrl;
  final String bio;
  final String websiteUrl;
  final bool isVerified;
  final int postsCount;
  final int followersCount;
  final int followingCount;
  final int totalLikesCount;
  final bool isFollowing;

  const CreatorProfile({
    required this.id,
    required this.handle,
    required this.displayName,
    required this.avatarUrl,
    required this.bio,
    this.websiteUrl = 'https://quantrinity.in',
    this.isVerified = true,
    required this.postsCount,
    required this.followersCount,
    required this.followingCount,
    required this.totalLikesCount,
    this.isFollowing = false,
  });
}

/// Direct Message Thread Model
class DirectMessageThread {
  final String id;
  final String recipientName;
  final String recipientHandle;
  final String avatarUrl;
  final String lastMessage;
  final String timestampText;
  final int unreadCount;
  final bool isOnline;

  const DirectMessageThread({
    required this.id,
    required this.recipientName,
    required this.recipientHandle,
    required this.avatarUrl,
    required this.lastMessage,
    required this.timestampText,
    this.unreadCount = 0,
    this.isOnline = false,
  });
}

/// 24-Hour Ephemeral Direct Note Model
class DirectNote {
  final String id;
  final String userId;
  final String username;
  final String avatarUrl;
  final String noteText;

  const DirectNote({
    required this.id,
    required this.userId,
    required this.username,
    required this.avatarUrl,
    required this.noteText,
  });
}
