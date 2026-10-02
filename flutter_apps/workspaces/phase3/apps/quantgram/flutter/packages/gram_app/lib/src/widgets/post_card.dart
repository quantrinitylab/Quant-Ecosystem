// ============================================================================
// gram_app - post card (Shift 2, W2)
// ============================================================================
//
// One feed post: header (avatar + username + verified badge + time-ago),
// image (fixed AspectRatio so layout never janks before load), action row
// (like / comment / share), likes count, caption (rich text, bold username).
//
// Media performance: CachedNetworkImage everywhere (placeholder + error),
// card wrapped in RepaintBoundary by the parent list, AspectRatio computed
// from server-provided dimensions.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:gram_core/gram_core.dart';

/// Human-friendly relative timestamp ("5m", "2h", "3d").
String timeAgo(DateTime createdAt) {
  final Duration diff = DateTime.now().difference(createdAt);
  if (diff.inSeconds < 60) return 'now';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  if (diff.inHours < 24) return '${diff.inHours}h';
  if (diff.inDays < 7) return '${diff.inDays}d';
  if (diff.inDays < 30) return '${diff.inDays ~/ 7}w';
  return '${diff.inDays ~/ 30}mo';
}

/// One post in the feed. [post] comes from W1's feed domain contract.
class PostCard extends StatefulWidget {
  const PostCard({required this.post, super.key});

  final GramPost post;

  @override
  State<PostCard> createState() => _PostCardState();
}

class _PostCardState extends State<PostCard>
    with SingleTickerProviderStateMixin {
  /// UI-only like state. TODO(UNVERIFIED): spec API wire (Shift 3+, W1
  /// feedRepository like/unlike) — no endpoint invented here.
  late bool _likedByMe = false;
  late int _likeCount;

  /// Double-tap like burst overlay: scale + fade of the heart.
  bool _burstVisible = false;
  late final AnimationController _burstController;

  @override
  void initState() {
    super.initState();
    _likedByMe = widget.post.likedByMe;
    _likeCount = widget.post.likeCount;
    _burstController = AnimationController(
      vsync: this,
      duration: GramDurations.likeBurst,
    );
    _burstController.addStatusListener((AnimationStatus status) {
      if (status == AnimationStatus.completed) {
        _burstController.reverse();
      } else if (status == AnimationStatus.dismissed) {
        if (mounted) setState(() => _burstVisible = false);
      }
    });
  }

  @override
  void didUpdateWidget(PostCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.post.id != widget.post.id) {
      _likedByMe = widget.post.likedByMe;
      _likeCount = widget.post.likeCount;
    }
  }

  @override
  void dispose() {
    _burstController.dispose();
    super.dispose();
  }

  void _toggleLike() {
    // TODO(UNVERIFIED): wire to feedRepository like/unlike once the
    // QuantGram API spec ships — UI toggle only for now.
    setState(() {
      _likedByMe = !_likedByMe;
      _likeCount += _likedByMe ? 1 : -1;
    });
  }

  void _onDoubleTapImage() {
    if (!_likedByMe) _toggleLike();
    setState(() => _burstVisible = true);
    _burstController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final GramPost post = widget.post;
    final double aspectRatio =
        (post.imageWidth > 0 && post.imageHeight > 0)
            ? post.imageWidth / post.imageHeight
            : 4 / 3;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        _PostHeader(post: post),
        GestureDetector(
          onDoubleTap: _onDoubleTapImage,
          child: Stack(
            alignment: Alignment.center,
            children: <Widget>[
              AspectRatio(
                aspectRatio: aspectRatio,
                child: CachedNetworkImage(
                  imageUrl: post.imageUrl,
                  fit: BoxFit.cover,
                  placeholder: (BuildContext context, String url) =>
                      Container(color: GramColors.surfaceVariantDark),
                  errorWidget:
                      (BuildContext context, String url, Object error) =>
                          Container(
                    color: GramColors.surfaceVariantDark,
                    child: const Center(
                      child: Icon(Icons.broken_image, size: 48),
                    ),
                  ),
                ),
              ),
              if (_burstVisible)
                ScaleTransition(
                  scale: Tween<double>(begin: 0.4, end: 1.0).animate(
                    CurvedAnimation(
                      parent: _burstController,
                      curve: GramEasings.springBounce,
                    ),
                  ),
                  child: FadeTransition(
                    opacity: Tween<double>(begin: 1.0, end: 0.0).animate(
                      CurvedAnimation(
                        parent: _burstController,
                        curve: GramEasings.easeOut,
                      ),
                    ),
                    child: const Icon(
                      Icons.favorite,
                      size: 96,
                      color: Colors.white,
                      shadows: <Shadow>[
                        Shadow(
                          color: GramColors.scrimDark,
                          blurRadius: 16,
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        _ActionRow(
          liked: _likedByMe,
          onLikeTap: _toggleLike,
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            _formatLikes(_likeCount),
            style: GramTextStyles.username,
          ),
        ),
        const SizedBox(height: 4),
        if (post.caption.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: RichText(
              text: TextSpan(
                style: GramTextStyles.body,
                children: <TextSpan>[
                  TextSpan(
                    text: '${post.author.username} ',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  TextSpan(text: post.caption),
                ],
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 12),
          child: Text(
            'View all ${post.commentCount} comments',
            style: GramTextStyles.bodySmall
                .copyWith(color: GramColors.foregroundSecondaryDark),
          ),
        ),
      ],
    );
  }
}

String _formatLikes(int count) {
  if (count == 1) return '1 like';
  if (count < 1000) return '$count likes';
  if (count < 1000000) {
    return '${(count / 1000).toStringAsFixed(1)}K likes';
  }
  return '${(count / 1000000).toStringAsFixed(1)}M likes';
}

/// Post header: 40dp avatar, username + verified badge, timestamp.
class _PostHeader extends StatelessWidget {
  const _PostHeader({required this.post});

  final GramPost post;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: <Widget>[
          ClipOval(
            child: CachedNetworkImage(
              imageUrl: post.author.avatarUrl,
              width: 40,
              height: 40,
              fit: BoxFit.cover,
              placeholder: (BuildContext context, String url) =>
                  Container(color: GramColors.surfaceVariantDark),
              errorWidget: (BuildContext context, String url, Object error) =>
                  Container(
                color: GramColors.surfaceVariantDark,
                child: const Icon(Icons.person, size: 24),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Row(
              children: <Widget>[
                Flexible(
                  child: Text(
                    post.author.username,
                    style: GramTextStyles.username,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (post.author.isVerified) ...<Widget>[
                  const SizedBox(width: 4),
                  const Icon(
                    Icons.verified,
                    size: 14,
                    color: GramColors.brandGradientMid,
                  ),
                ],
                const SizedBox(width: 8),
                Text(
                  '· ${timeAgo(post.createdAt)}',
                  style: GramTextStyles.timestamp.copyWith(
                    color: GramColors.foregroundSecondaryDark,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: const Icon(Icons.more_horiz),
            onPressed: () {
              // TODO(UNVERIFIED): post options sheet (report/mute/unfollow)
              // once spec defines moderation endpoints.
            },
          ),
        ],
      ),
    );
  }
}

/// Like / comment / share row under the image.
class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.liked, required this.onLikeTap});

  final bool liked;
  final VoidCallback onLikeTap;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        _LikeButton(liked: liked, onTap: onLikeTap),
        IconButton(
          icon: const Icon(Icons.mode_comment_outlined),
          onPressed: () {
            // TODO(UNVERIFIED): open comments sheet once spec defines the
            // comments endpoint + post detail route.
          },
        ),
        IconButton(
          icon: const Icon(Icons.send_outlined),
          onPressed: () {
            // TODO(UNVERIFIED): share sheet once spec defines share/deep-link
            // contract.
          },
        ),
        const Spacer(),
        IconButton(
          icon: const Icon(Icons.bookmark_border),
          onPressed: () {
            // TODO(UNVERIFIED): save/bookmark once spec defines collections.
          },
        ),
      ],
    );
  }
}

/// Like button with a scale pop on tap using token motion values.
class _LikeButton extends StatefulWidget {
  const _LikeButton({required this.liked, required this.onTap});

  final bool liked;
  final VoidCallback onTap;

  @override
  State<_LikeButton> createState() => _LikeButtonState();
}

class _LikeButtonState extends State<_LikeButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: GramDurations.likeBurst,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTap() {
    widget.onTap();
    _controller.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
        builder: (BuildContext context, Widget? child) {
          final double t = _controller.value;
          // Pop: 1.0 -> 1.35 -> 1.0 on the springBounce curve.
          final double scale = t < 0.5
              ? 1.0 + 0.35 * (t / 0.5)
              : 1.35 - 0.35 * ((t - 0.5) / 0.5);
          return Transform.scale(scale: scale, child: child);
        },
        child: IconButton(
          icon: Icon(
            widget.liked ? Icons.favorite : Icons.favorite_border,
            color: widget.liked ? GramColors.brandGradientStart : null,
          ),
          onPressed: _handleTap,
        ),
      );
  }
}
