import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../data/gram_repository.dart';
import '../models/gram_models.dart';

/// Sliding Frosted Bottom Sheet for 9:16 Reel Comments
/// Strictly ZERO raw Unicode emojis throughout this file (Material 3 vector icons only).
/// Strictly ZERO Skia clipPath calls (pure Impeller hardware acceleration).
class CommentsSheet extends StatefulWidget {
  final ReelItem reel;
  final VoidCallback? onCommentAdded;

  const CommentsSheet({
    super.key,
    required this.reel,
    this.onCommentAdded,
  });

  /// Static helper to display the sheet modally with frosted background
  static Future<void> show(BuildContext context, ReelItem reel) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      elevation: 0,
      builder: (context) => CommentsSheet(reel: reel),
    );
  }

  @override
  State<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<CommentsSheet> {
  late List<CommentItem> _comments;
  final TextEditingController _commentController = TextEditingController();
  final FocusNode _focusNode = FocusNode();
  String? _replyingToUsername;
  String? _replyingToCommentId;

  @override
  void initState() {
    super.initState();
    _comments = List.from(GramRepository.getCommentsForReel(widget.reel.id));
  }

  @override
  void dispose() {
    _commentController.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _handleSendComment() {
    final text = _commentController.text.trim();
    if (text.isEmpty) return;

    final newComment = CommentItem(
      id: 'cmt-${DateTime.now().millisecondsSinceEpoch}',
      reelId: widget.reel.id,
      userId: 'current-user',
      username: 'you',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      text: text,
      timestampText: 'Just now',
      likesCount: 0,
    );

    setState(() {
      if (_replyingToCommentId != null) {
        // Find target parent comment and append reply
        final parentIndex = _comments.indexWhere((c) => c.id == _replyingToCommentId);
        if (parentIndex != -1) {
          final parent = _comments[parentIndex];
          final updatedReplies = List<CommentItem>.from(parent.replies)..add(newComment);
          _comments[parentIndex] = parent.copyWith(replies: updatedReplies);
        } else {
          _comments.insert(0, newComment);
        }
      } else {
        _comments.insert(0, newComment);
      }
      _commentController.clear();
      _replyingToUsername = null;
      _replyingToCommentId = null;
    });

    _focusNode.unfocus();
    widget.onCommentAdded?.call();
  }

  void _toggleCommentLike(String commentId, {bool isReply = false, String? parentId}) {
    setState(() {
      if (isReply && parentId != null) {
        final parentIdx = _comments.indexWhere((c) => c.id == parentId);
        if (parentIdx != -1) {
          final parent = _comments[parentIdx];
          final replyIdx = parent.replies.indexWhere((r) => r.id == commentId);
          if (replyIdx != -1) {
            final reply = parent.replies[replyIdx];
            final updated = reply.copyWith(
              isLiked: !reply.isLiked,
              likesCount: reply.isLiked ? reply.likesCount - 1 : reply.likesCount + 1,
            );
            final newReplies = List<CommentItem>.from(parent.replies);
            newReplies[replyIdx] = updated;
            _comments[parentIdx] = parent.copyWith(replies: newReplies);
          }
        }
      } else {
        final index = _comments.indexWhere((c) => c.id == commentId);
        if (index != -1) {
          final c = _comments[index];
          _comments[index] = c.copyWith(
            isLiked: !c.isLiked,
            likesCount: c.isLiked ? c.likesCount - 1 : c.likesCount + 1,
          );
        }
      }
    });
  }

  void _setReplyTarget(CommentItem comment) {
    setState(() {
      _replyingToUsername = comment.username;
      _replyingToCommentId = comment.id;
    });
    _focusNode.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          height: MediaQuery.of(context).size.height * 0.72,
          decoration: BoxDecoration(
            color: QuantColors.voidObsidian.withOpacity(0.92),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
            border: const Border(
              top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
            ),
          ),
          child: Column(
            children: [
              // Top Drag Handle Pill
              const SizedBox(height: 10),
              Container(
                width: 38,
                height: 4,
                decoration: BoxDecoration(
                  color: QuantColors.activeBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 12),

              // Comments Sheet Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Row(
                  children: [
                    Text(
                      'Comments',
                      style: QuantTypography.titleMedium.copyWith(
                        color: QuantColors.textPrimary,
                        fontSize: 16,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: Text(
                        '${widget.reel.commentsCount + _comments.length}',
                        style: QuantTypography.bodySmall.copyWith(
                          color: QuantColors.textSecondary,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close_rounded, color: QuantColors.textSecondary, size: 20),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),

              const Divider(color: QuantColors.hairlineBorder, height: 1),

              // Comments List View with Nested Reply Threads
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  itemCount: _comments.length,
                  itemBuilder: (context, index) {
                    final comment = _comments[index];
                    return _buildCommentRow(comment);
                  },
                ),
              ),

              // Replying-to Indicator Bar
              if (_replyingToUsername != null)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  color: QuantColors.darkSlateCard,
                  child: Row(
                    children: [
                      const Icon(Icons.reply_rounded, size: 16, color: QuantColors.moltenAmber),
                      const SizedBox(width: 6),
                      Text(
                        'Replying to @$_replyingToUsername',
                        style: QuantTypography.bodySmall.copyWith(color: QuantColors.textSecondary),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () {
                          setState(() {
                            _replyingToUsername = null;
                            _replyingToCommentId = null;
                          });
                        },
                        child: const Icon(Icons.close_rounded, size: 16, color: QuantColors.textMuted),
                      ),
                    ],
                  ),
                ),

              // Quick Vector Reactions Bar (Material 3 vectors only, zero Unicode emojis)
              Container(
                height: 38,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                color: QuantColors.darkSlateSurface.withOpacity(0.5),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _buildVectorReactionButton(Icons.favorite_rounded, QuantColors.sunriseRose, 'Heart'),
                    _buildVectorReactionButton(Icons.local_fire_department_rounded, QuantColors.moltenAmber, 'Fire'),
                    _buildVectorReactionButton(Icons.celebration_rounded, QuantColors.sunsetGold, 'Celebrate'),
                    _buildVectorReactionButton(Icons.thumb_up_rounded, QuantColors.sovereignCyan, 'ThumbsUp'),
                    _buildVectorReactionButton(Icons.auto_awesome_rounded, QuantColors.obsidianPurple, 'Sparkle'),
                  ],
                ),
              ),

              // Sticky Comment Input Bar
              Container(
                padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + bottomInset),
                decoration: const BoxDecoration(
                  color: QuantColors.voidObsidian,
                  border: Border(top: BorderSide(color: QuantColors.hairlineBorder)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: const BoxDecoration(
                        shape: BoxShape.circle,
                        image: DecorationImage(
                          image: NetworkImage('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: TextField(
                          controller: _commentController,
                          focusNode: _focusNode,
                          style: QuantTypography.bodyMedium.copyWith(color: QuantColors.textPrimary),
                          decoration: InputDecoration(
                            hintText: _replyingToUsername != null
                                ? 'Reply to @$_replyingToUsername...'
                                : 'Add a sovereign comment...',
                            hintStyle: QuantTypography.bodySmall.copyWith(color: QuantColors.textMuted),
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(vertical: 10),
                          ),
                          onSubmitted: (_) => _handleSendComment(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    GestureDetector(
                      onTap: _handleSendComment,
                      child: Container(
                        width: 38,
                        height: 38,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: QuantColors.sunriseRose,
                        ),
                        child: const Icon(
                          Icons.arrow_upward_rounded,
                          color: Colors.white,
                          size: 20,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVectorReactionButton(IconData icon, Color color, String label) {
    return GestureDetector(
      onTap: () {
        _commentController.text += ' [$label]';
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: color.withOpacity(0.12),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Icon(icon, size: 16, color: color),
      ),
    );
  }

  Widget _buildCommentRow(CommentItem comment) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Pinned badge indicator
          if (comment.isCreatorPinned)
            Padding(
              padding: const EdgeInsets.only(left: 44, bottom: 4),
              child: Row(
                children: [
                  const Icon(Icons.push_pin_rounded, size: 12, color: QuantColors.moltenAmber),
                  const SizedBox(width: 4),
                  Text(
                    'Pinned by creator',
                    style: QuantTypography.bodySmall.copyWith(
                      color: QuantColors.moltenAmber,
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),

          // Main comment item
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  image: DecorationImage(
                    image: NetworkImage(comment.avatarUrl),
                    fit: BoxFit.cover,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          comment.username,
                          style: QuantTypography.titleMedium.copyWith(
                            fontSize: 13,
                            color: QuantColors.textPrimary,
                          ),
                        ),
                        if (comment.isVerifiedCreator) ...[
                          const SizedBox(width: 4),
                          const Icon(
                            Icons.verified_rounded,
                            size: 13,
                            color: QuantColors.sovereignCyan,
                          ),
                        ],
                        const SizedBox(width: 6),
                        Text(
                          comment.timestampText,
                          style: QuantTypography.bodySmall.copyWith(
                            fontSize: 11,
                            color: QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      comment.text,
                      style: QuantTypography.bodyMedium.copyWith(
                        fontSize: 13,
                        color: QuantColors.textSecondary,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        GestureDetector(
                          onTap: () => _setReplyTarget(comment),
                          child: Text(
                            'Reply',
                            style: QuantTypography.bodySmall.copyWith(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: QuantColors.moltenAmber,
                            ),
                          ),
                        ),
                        if (comment.creatorHearted) ...[
                          const SizedBox(width: 12),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                            decoration: BoxDecoration(
                              color: QuantColors.sunriseRose.withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: QuantColors.sunriseRose.withOpacity(0.3),
                                width: 0.8,
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(
                                  Icons.favorite_rounded,
                                  size: 10,
                                  color: QuantColors.sunriseRose,
                                ),
                                const SizedBox(width: 3),
                                Text(
                                  'Liked by creator',
                                  style: QuantTypography.bodySmall.copyWith(
                                    fontSize: 9,
                                    color: QuantColors.sunriseRose,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  GestureDetector(
                    onTap: () => _toggleCommentLike(comment.id),
                    child: Icon(
                      comment.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                      size: 16,
                      color: comment.isLiked ? QuantColors.sunriseRose : QuantColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  if (comment.likesCount > 0)
                    Text(
                      '${comment.likesCount}',
                      style: QuantTypography.bodySmall.copyWith(
                        fontSize: 10,
                        color: QuantColors.textMuted,
                      ),
                    ),
                ],
              ),
            ],
          ),

          // Nested Replies Thread
          if (comment.replies.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 44, top: 10),
              child: Column(
                children: comment.replies.map((reply) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            image: DecorationImage(
                              image: NetworkImage(reply.avatarUrl),
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text(
                                    reply.username,
                                    style: QuantTypography.titleMedium.copyWith(
                                      fontSize: 12,
                                      color: QuantColors.textPrimary,
                                    ),
                                  ),
                                  if (reply.isVerifiedCreator) ...[
                                    const SizedBox(width: 4),
                                    const Icon(
                                      Icons.verified_rounded,
                                      size: 11,
                                      color: QuantColors.sovereignCyan,
                                    ),
                                  ],
                                  const SizedBox(width: 6),
                                  Text(
                                    reply.timestampText,
                                    style: QuantTypography.bodySmall.copyWith(
                                      fontSize: 10,
                                      color: QuantColors.textMuted,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              Text(
                                reply.text,
                                style: QuantTypography.bodySmall.copyWith(
                                  fontSize: 12,
                                  color: QuantColors.textSecondary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        GestureDetector(
                          onTap: () => _toggleCommentLike(
                            reply.id,
                            isReply: true,
                            parentId: comment.id,
                          ),
                          child: Icon(
                            reply.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                            size: 14,
                            color: reply.isLiked ? QuantColors.sunriseRose : QuantColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
        ],
      ),
    );
  }
}
