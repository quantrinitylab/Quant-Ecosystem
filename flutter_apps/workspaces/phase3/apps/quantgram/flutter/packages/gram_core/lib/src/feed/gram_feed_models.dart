// ============================================================================
// gram_core - QuantGram feed domain models (UI-facing entities)
// ============================================================================
//
// UI-layer immutable value objects for the feed surface. These are NOT
// wire models: there is deliberately no `fromJson`/`toJson` here.
//
// TODO(UNVERIFIED): field shapes app-foundations/quantgram spec se verify
// karo. The spec does not exist yet (`app-foundations/quantgram/` has not
// been written); every field below is a best-guess contract for UI
// development. When the spec lands, a separate `feed_dtos.dart` layer will
// map wire JSON -> these entities, and these classes get reviewed against
// the real payloads.

/// A QuantGram account, as shown in the feed UI.
///
/// TODO(UNVERIFIED): field shapes app-foundations/quantgram spec se verify
/// karo.
class GramUser {
  /// Stable backend identifier (opaque; format defined by the API).
  final String id;

  /// Handle without the leading `@`, e.g. `aisha.shoots`.
  final String username;

  /// Human-readable name shown next to the avatar.
  final String displayName;

  /// Avatar image URL. May be empty when the user has no avatar set.
  final String avatarUrl;

  /// Whether the account carries a verified badge.
  final bool isVerified;

  /// Creates a [GramUser]. All fields are required to keep feed UI
  /// null-safe; use empty strings for unknown optional media URLs.
  const GramUser({
    required this.id,
    required this.username,
    required this.displayName,
    required this.avatarUrl,
    required this.isVerified,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GramUser &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          username == other.username &&
          displayName == other.displayName &&
          avatarUrl == other.avatarUrl &&
          isVerified == other.isVerified;

  @override
  int get hashCode => Object.hash(
        id,
        username,
        displayName,
        avatarUrl,
        isVerified,
      );
}

/// A single post in the QuantGram feed.
///
/// Carries its intrinsic [imageWidth]/[imageHeight] so the feed list can
/// reserve exact aspect-ratio space before the image bytes arrive (no
/// layout jank while scrolling).
///
/// TODO(UNVERIFIED): field shapes app-foundations/quantgram spec se verify
/// karo. No `fromJson` until the spec lands — invented parsing is theatre.
class GramPost {
  /// Stable backend identifier (opaque; format defined by the API).
  final String id;

  /// The account that published the post.
  final GramUser author;

  /// Full-resolution image URL for the post's media.
  final String imageUrl;

  /// Intrinsic image width in pixels; used for aspect-ratio reservation.
  final int imageWidth;

  /// Intrinsic image height in pixels; used for aspect-ratio reservation.
  final int imageHeight;

  /// Post caption text. May be empty.
  final String caption;

  /// Total like count shown under the post.
  final int likeCount;

  /// Total comment count shown under the post.
  final int commentCount;

  /// Whether the signed-in user has liked this post.
  final bool likedByMe;

  /// Publication time (UTC; backend-defined until the spec confirms).
  final DateTime createdAt;

  /// Whether this post is a sponsored/promoted placement.
  final bool isSponsored;

  /// Creates a [GramPost].
  const GramPost({
    required this.id,
    required this.author,
    required this.imageUrl,
    required this.imageWidth,
    required this.imageHeight,
    required this.caption,
    required this.likeCount,
    required this.commentCount,
    required this.likedByMe,
    required this.createdAt,
    required this.isSponsored,
  });

  /// Returns the post's aspect ratio (width / height) for layout reservation.
  ///
  /// Falls back to 1.0 when dimensions are degenerate so callers never
  /// divide by zero.
  double get aspectRatio =>
      imageWidth > 0 && imageHeight > 0 ? imageWidth / imageHeight : 1.0;

  /// Creates a copy of this post with the given fields replaced.
  GramPost copyWith({
    String? id,
    GramUser? author,
    String? imageUrl,
    int? imageWidth,
    int? imageHeight,
    String? caption,
    int? likeCount,
    int? commentCount,
    bool? likedByMe,
    DateTime? createdAt,
    bool? isSponsored,
  }) {
    return GramPost(
      id: id ?? this.id,
      author: author ?? this.author,
      imageUrl: imageUrl ?? this.imageUrl,
      imageWidth: imageWidth ?? this.imageWidth,
      imageHeight: imageHeight ?? this.imageHeight,
      caption: caption ?? this.caption,
      likeCount: likeCount ?? this.likeCount,
      commentCount: commentCount ?? this.commentCount,
      likedByMe: likedByMe ?? this.likedByMe,
      createdAt: createdAt ?? this.createdAt,
      isSponsored: isSponsored ?? this.isSponsored,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GramPost &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          author == other.author &&
          imageUrl == other.imageUrl &&
          imageWidth == other.imageWidth &&
          imageHeight == other.imageHeight &&
          caption == other.caption &&
          likeCount == other.likeCount &&
          commentCount == other.commentCount &&
          likedByMe == other.likedByMe &&
          createdAt == other.createdAt &&
          isSponsored == other.isSponsored;

  @override
  int get hashCode => Object.hash(
        id,
        author,
        imageUrl,
        imageWidth,
        imageHeight,
        caption,
        likeCount,
        commentCount,
        likedByMe,
        createdAt,
        isSponsored,
      );
}

/// A story tray item.
///
/// TODO(UNVERIFIED): field shapes app-foundations/quantgram spec se verify
/// karo.
class GramStory {
  /// Stable backend identifier (opaque; format defined by the API).
  final String id;

  /// The account that published the story.
  final GramUser author;

  /// Preview thumbnail URL shown in the story ring.
  final String thumbnailUrl;

  /// Whether the signed-in user has already viewed this story.
  final bool viewed;

  /// Publication time (UTC; backend-defined until the spec confirms).
  final DateTime createdAt;

  /// Creates a [GramStory].
  const GramStory({
    required this.id,
    required this.author,
    required this.thumbnailUrl,
    required this.viewed,
    required this.createdAt,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GramStory &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          author == other.author &&
          thumbnailUrl == other.thumbnailUrl &&
          viewed == other.viewed &&
          createdAt == other.createdAt;

  @override
  int get hashCode => Object.hash(
        id,
        author,
        thumbnailUrl,
        viewed,
        createdAt,
      );
}

/// A comment on a [GramPost].
///
/// TODO(UNVERIFIED): field shapes app-foundations/quantgram spec se verify
/// karo.
class GramComment {
  /// Stable backend identifier (opaque; format defined by the API).
  final String id;

  /// The account that wrote the comment.
  final GramUser author;

  /// Comment body text.
  final String text;

  /// Like count shown on the comment.
  final int likeCount;

  /// Publication time (UTC; backend-defined until the spec confirms).
  final DateTime createdAt;

  /// Creates a [GramComment].
  const GramComment({
    required this.id,
    required this.author,
    required this.text,
    required this.likeCount,
    required this.createdAt,
  });

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is GramComment &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          author == other.author &&
          text == other.text &&
          likeCount == other.likeCount &&
          createdAt == other.createdAt;

  @override
  int get hashCode => Object.hash(
        id,
        author,
        text,
        likeCount,
        createdAt,
      );
}
