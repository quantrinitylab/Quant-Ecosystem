// QuantChat Stories domain models (Phase 2C).
// Mirrors the /stories backend contract: feed groups, per-segment view
// tracking, engagement counters, audience scoping. No mock data -- every
// field is parsed from real API responses.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:typed_data';

import 'package:flutter/foundation.dart';

/// A locally picked snap awaiting upload (Create Story / Send To flows).
@immutable
class PickedSnap {
  final String path;
  final Uint8List bytes;
  final String contentType;

  const PickedSnap({
    required this.path,
    required this.bytes,
    required this.contentType,
  });
}

/// Guess a story-safe content type from a file path.
String contentTypeForPath(String path) {
  final lower = path.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.mov')) return 'video/mp4';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

/// Client audience sent to POST /stories. Wire values are defined by the
/// backend contract (friendsOnly/public/closeFriends).
enum StoryAudience {
  friendsOnly,
  public,
  closeFriends;

  String get wireValue {
    switch (this) {
      case StoryAudience.friendsOnly:
        return 'friendsOnly';
      case StoryAudience.public:
        return 'public';
      case StoryAudience.closeFriends:
        return 'closeFriends';
    }
  }

  String get label {
    switch (this) {
      case StoryAudience.friendsOnly:
        return 'Friends Only';
      case StoryAudience.public:
        return 'Public';
      case StoryAudience.closeFriends:
        return 'Close Friends';
    }
  }

  String get subtitle {
    switch (this) {
      case StoryAudience.friendsOnly:
        return 'Just for friends';
      case StoryAudience.public:
        return 'Everyone';
      case StoryAudience.closeFriends:
        return 'Your close friends list';
    }
  }

  /// Accepts both the client vocabulary ('friendsOnly'/...) and the stored
  /// vocabulary ('FRIENDS'/'ALL'/'CLOSE_FRIENDS') the backend serializes --
  /// never crashes on unknown values.
  static StoryAudience fromWire(String? value) {
    switch (value) {
      case 'friendsOnly':
      case 'FRIENDS':
        return StoryAudience.friendsOnly;
      case 'closeFriends':
      case 'CLOSE_FRIENDS':
        return StoryAudience.closeFriends;
      case 'public':
      case 'ALL':
      default:
        return StoryAudience.public;
    }
  }
}

enum StoryMediaType { photo, video, text }

StoryMediaType _mediaTypeFromWire(String? value) {
  switch (value) {
    case 'video':
      return StoryMediaType.video;
    case 'text':
      return StoryMediaType.text;
    case 'photo':
    default:
      return StoryMediaType.photo;
  }
}

/// One story segment. Each row is its own view-tracking unit: the viewer
/// calls POST /stories/:id/view per segment, which is how "view tracking
/// per segment" is implemented (one StoryView row per segment per viewer).
@immutable
class StorySegment {
  final String id;
  final String authorId;
  final String authorName;
  final String authorAvatar;
  final StoryMediaType type;
  final String? mediaUrl;
  final String? text;
  final int durationSec;
  final int viewCount;
  final int likeCount;
  final int commentCount;
  final bool isLiked;
  final bool isViewed;
  final String? placeId;
  final String? placeName;
  final String? name;
  final DateTime createdAt;
  final DateTime expiresAt;

  const StorySegment({
    required this.id,
    required this.authorId,
    required this.authorName,
    required this.authorAvatar,
    required this.type,
    this.mediaUrl,
    this.text,
    required this.durationSec,
    required this.viewCount,
    required this.likeCount,
    required this.commentCount,
    required this.isLiked,
    required this.isViewed,
    this.placeId,
    this.placeName,
    this.name,
    required this.createdAt,
    required this.expiresAt,
  });

  factory StorySegment.fromJson(Map<String, dynamic> json) {
    return StorySegment(
      id: json['id'] as String,
      authorId: json['authorId'] as String? ?? '',
      authorName: json['authorName'] as String? ?? 'Unknown',
      authorAvatar: json['authorAvatar'] as String? ?? '',
      type: _mediaTypeFromWire(json['type'] as String?),
      mediaUrl: json['mediaUrl'] as String?,
      text: json['text'] as String?,
      durationSec: (json['duration'] as num?)?.toInt() ?? 5,
      viewCount: (json['viewCount'] as num?)?.toInt() ?? 0,
      likeCount: (json['likeCount'] as num?)?.toInt() ?? 0,
      commentCount: (json['commentCount'] as num?)?.toInt() ?? 0,
      isLiked: json['isLiked'] as bool? ?? false,
      isViewed: json['isViewed'] as bool? ?? false,
      placeId: json['placeId'] as String?,
      placeName: json['placeName'] as String?,
      name: json['name'] as String?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      expiresAt: DateTime.tryParse(json['expiresAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }

  StorySegment copyWith({
    bool? isViewed,
    bool? isLiked,
    int? likeCount,
    int? viewCount,
    int? commentCount,
  }) {
    return StorySegment(
      id: id,
      authorId: authorId,
      authorName: authorName,
      authorAvatar: authorAvatar,
      type: type,
      mediaUrl: mediaUrl,
      text: text,
      durationSec: durationSec,
      viewCount: viewCount ?? this.viewCount,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      isLiked: isLiked ?? this.isLiked,
      isViewed: isViewed ?? this.isViewed,
      placeId: placeId,
      placeName: placeName,
      name: name,
      createdAt: createdAt,
      expiresAt: expiresAt,
    );
  }
}

/// One author's story group from GET /stories/feed.
@immutable
class StoryGroup {
  final String userId;
  final String userName;
  final String userAvatar;
  final List<StorySegment> segments;
  final bool hasUnviewed;
  final bool isOwn;
  final bool isFriend;
  final bool isFollowing;

  const StoryGroup({
    required this.userId,
    required this.userName,
    required this.userAvatar,
    required this.segments,
    required this.hasUnviewed,
    required this.isOwn,
    required this.isFriend,
    required this.isFollowing,
  });

  factory StoryGroup.fromJson(Map<String, dynamic> json) {
    final segmentsJson = (json['stories'] as List?) ?? const [];
    final segments = segmentsJson
        .whereType<Map<String, dynamic>>()
        .map(StorySegment.fromJson)
        .toList();
    return StoryGroup(
      userId: json['userId'] as String,
      userName: json['userName'] as String? ?? 'Unknown',
      userAvatar: json['userAvatar'] as String? ?? '',
      segments: segments,
      hasUnviewed: json['hasUnviewed'] as bool? ??
          segments.any((s) => !s.isViewed),
      isOwn: json['isOwn'] as bool? ?? false,
      isFriend: json['isFriend'] as bool? ?? false,
      isFollowing: json['isFollowing'] as bool? ?? false,
    );
  }

  /// First unviewed segment index, or 0 when all viewed.
  int get startIndex {
    final idx = segments.indexWhere((s) => !s.isViewed);
    return idx < 0 ? 0 : idx;
  }
}

@immutable
class StoryViewerEntry {
  final String userId;
  final String name;
  final String avatar;
  final DateTime viewedAt;

  const StoryViewerEntry({
    required this.userId,
    required this.name,
    required this.avatar,
    required this.viewedAt,
  });

  factory StoryViewerEntry.fromJson(Map<String, dynamic> json) {
    return StoryViewerEntry(
      userId: json['userId'] as String,
      name: json['name'] as String? ?? 'Unknown',
      avatar: json['avatar'] as String? ?? '',
      viewedAt: DateTime.tryParse(json['viewedAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

@immutable
class StoryCommentModel {
  final String id;
  final String storyId;
  final String userId;
  final String userName;
  final String userAvatar;
  final String body;
  final DateTime createdAt;

  const StoryCommentModel({
    required this.id,
    required this.storyId,
    required this.userId,
    required this.userName,
    required this.userAvatar,
    required this.body,
    required this.createdAt,
  });

  factory StoryCommentModel.fromJson(Map<String, dynamic> json) {
    return StoryCommentModel(
      id: json['id'] as String,
      storyId: json['storyId'] as String? ?? '',
      userId: json['userId'] as String? ?? '',
      userName: json['userName'] as String? ?? 'Unknown',
      userAvatar: json['userAvatar'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}

/// Human relative time ("just now", "5m", "3h", "2d") for story headers.
String storyTimeAgo(DateTime createdAt, {DateTime? now}) {
  final ref = (now ?? DateTime.now()).toUtc();
  final diff = ref.difference(createdAt.toUtc());
  if (diff.inSeconds < 60) return 'just now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  return '${diff.inDays}d';
}
