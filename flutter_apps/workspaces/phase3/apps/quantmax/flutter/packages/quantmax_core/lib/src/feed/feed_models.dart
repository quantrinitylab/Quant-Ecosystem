// ============================================================================
// quantmax_core - vertical video feed draft models (W2)
// ============================================================================
//

import 'package:flutter/foundation.dart';

/// A single short-video item in the QuantMax feed.
///
/// **DRAFT — not a spec-backed contract.** `app-foundations/quantmax/` abhi
/// bhi nahi bani, isliye har field par TODO(UNVERIFIED) laga hai: jab
/// OpenAPI spec land hogi to ye model spec ke against rewrite hoga
/// (field names, types, required-ness sab badal sakte hain).
///
/// TODO(UNVERIFIED): field set/spec mapping pending — yahan ke saare fields
/// (id, authorHandle, caption, videoUrl, counts, timestamps) backend contract
/// land hone tak guesses hain. Real response se bind karne se pehle spec se
/// verify karo.
@immutable
final class MaxVideo {
  /// Creates a video item. All invariants are defensive — no asserts.
  const MaxVideo({
    required this.id,
    required this.authorHandle,
    this.authorAvatarUrl = '',
    required this.caption,
    required this.videoUrl,
    this.thumbnailUrl,
    this.likeCount = 0,
    this.commentCount = 0,
    this.shareCount = 0,
    this.isLiked = false,
    this.createdAt,
  });

  /// TODO(UNVERIFIED): spec me primary key ka naam/type confirm hoga.
  final String id;

  /// TODO(UNVERIFIED): spec me author handle ka field naam confirm hoga.
  final String authorHandle;

  /// TODO(UNVERIFIED): empty string = avatar nahi mila; URL format spec me
  /// confirm hoga.
  final String authorAvatarUrl;

  /// TODO(UNVERIFIED): caption ka naam/length-limit spec me confirm hoga.
  final String caption;

  /// TODO(UNVERIFIED): video stream URL — HLS/DASH/MP4 delivery spec me
  /// confirm hogi; abhi sirf [Uri].
  final Uri videoUrl;

  /// TODO(UNVERIFIED): poster/thumbnail URL ka naam spec me confirm hoga.
  final Uri? thumbnailUrl;

  /// TODO(UNVERIFIED): counts ke field naam + base type spec me confirm honge.
  /// Negative values ko defensive 0 par clamp kiya jata hai.
  final int likeCount;

  /// TODO(UNVERIFIED): comment count — spec pending.
  final int commentCount;

  /// TODO(UNVERIFIED): share count — spec pending.
  final int shareCount;

  /// TODO(UNVERIFIED): like state ki source of truth spec/backend se aayegi;
  /// abhi client-side optimistic flag hai.
  final bool isLiked;

  /// TODO(UNVERIFIED): timestamp format/timezone spec me confirm hoga.
  final DateTime? createdAt;

  /// Returns a copy with the given fields replaced.
  MaxVideo copyWith({
    String? id,
    String? authorHandle,
    String? authorAvatarUrl,
    String? caption,
    Uri? videoUrl,
    Uri? thumbnailUrl,
    int? likeCount,
    int? commentCount,
    int? shareCount,
    bool? isLiked,
    DateTime? createdAt,
  }) {
    return MaxVideo(
      id: id ?? this.id,
      authorHandle: authorHandle ?? this.authorHandle,
      authorAvatarUrl: authorAvatarUrl ?? this.authorAvatarUrl,
      caption: caption ?? this.caption,
      videoUrl: videoUrl ?? this.videoUrl,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      likeCount: likeCount == null ? this.likeCount : _clampNonNegative(likeCount),
      commentCount:
          commentCount == null ? this.commentCount : _clampNonNegative(commentCount),
      shareCount: shareCount == null ? this.shareCount : _clampNonNegative(shareCount),
      isLiked: isLiked ?? this.isLiked,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  /// Defensive decode: missing keys → defaults, galat types → defaults.
  /// Kabhi throw nahi karta — poora feed ek malformed item ki wajah se
  /// crash nahi hona chahiye.
  factory MaxVideo.fromJson(Map<String, Object?> json) {
    return MaxVideo(
      id: _asString(json['id']),
      authorHandle: _asString(json['authorHandle']),
      authorAvatarUrl: _asString(json['authorAvatarUrl']),
      caption: _asString(json['caption']),
      videoUrl: _asUri(json['videoUrl']),
      thumbnailUrl: _asUriOrNull(json['thumbnailUrl']),
      likeCount: _asCount(json['likeCount']),
      commentCount: _asCount(json['commentCount']),
      shareCount: _asCount(json['shareCount']),
      isLiked: _asBool(json['isLiked']),
      createdAt: _asDateTime(json['createdAt']),
    );
  }

  /// Encodes this item. Round-trip guarantee: sirf draft schema ke andar.
  Map<String, Object?> toJson() {
    return <String, Object?>{
      'id': id,
      'authorHandle': authorHandle,
      'authorAvatarUrl': authorAvatarUrl,
      'caption': caption,
      'videoUrl': videoUrl.toString(),
      if (thumbnailUrl != null) 'thumbnailUrl': thumbnailUrl.toString(),
      'likeCount': likeCount,
      'commentCount': commentCount,
      'shareCount': shareCount,
      'isLiked': isLiked,
      if (createdAt != null) 'createdAt': createdAt!.toIso8601String(),
    };
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      (other is MaxVideo &&
          other.id == id &&
          other.authorHandle == authorHandle &&
          other.authorAvatarUrl == authorAvatarUrl &&
          other.caption == caption &&
          other.videoUrl == videoUrl &&
          other.thumbnailUrl == thumbnailUrl &&
          other.likeCount == likeCount &&
          other.commentCount == commentCount &&
          other.shareCount == shareCount &&
          other.isLiked == isLiked &&
          other.createdAt == createdAt);

  @override
  int get hashCode => Object.hash(
        id,
        authorHandle,
        authorAvatarUrl,
        caption,
        videoUrl,
        thumbnailUrl,
        likeCount,
        commentCount,
        shareCount,
        isLiked,
        createdAt,
      );

  @override
  String toString() =>
      'MaxVideo(id: $id, authorHandle: $authorHandle, likes: $likeCount, isLiked: $isLiked)';
}

int _clampNonNegative(int value) => value < 0 ? 0 : value;

String _asString(Object? value) => value is String ? value : '';

bool _asBool(Object? value) => value is bool ? value : false;

int _asCount(Object? value) {
  if (value is int) return _clampNonNegative(value);
  if (value is num) return _clampNonNegative(value.toInt());
  if (value is String) {
    final parsed = int.tryParse(value);
    if (parsed != null) return _clampNonNegative(parsed);
  }
  return 0;
}

/// Never throws: invalid/missing URL → [Uri()] (empty) so the caller can
/// decide (e.g. skip rendering) instead of crashing the feed.
Uri _asUri(Object? value) {
  if (value is String) {
    return Uri.tryParse(value) ?? Uri();
  }
  return Uri();
}

Uri? _asUriOrNull(Object? value) {
  if (value is String) {
    return Uri.tryParse(value);
  }
  return null;
}

DateTime? _asDateTime(Object? value) {
  if (value is String) {
    return DateTime.tryParse(value);
  }
  return null;
}
