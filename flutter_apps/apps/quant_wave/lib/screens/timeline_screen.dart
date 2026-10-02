// Sovereign Quant Ecosystem - QuantWave Timeline Feed Screen
// Sovereign X / Twitter Parity Microblogging Thread Feed
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';
import '../services/wave_mock_data.dart';

class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  int _selectedFeedIndex = 0; // 0: For You, 1: Following
  late List<WavePost> _posts;
  final TextEditingController _quickPostController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _posts = WaveMockData.getInitialTimelinePosts();
  }

  @override
  void dispose() {
    _quickPostController.dispose();
    super.dispose();
  }

  void _handleLikeToggle(String postId) {
    setState(() {
      _posts = _posts.map((post) {
        if (post.id == postId) {
          final isLiked = !post.isLiked;
          final likeCount = isLiked ? post.likeCount + 1 : post.likeCount - 1;
          return post.copyWith(isLiked: isLiked, likeCount: likeCount);
        }
        return post;
      }).toList();
    });
  }

  void _handleRepostAction(WavePost post) {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: Icon(
                    post.isReposted ? Icons.repeat_on_rounded : Icons.repeat_rounded,
                    color: post.isReposted ? QuantColors.emeraldMatrix : QuantColors.textPrimary,
                  ),
                  title: Text(
                    post.isReposted ? 'Undo Repost' : 'Repost Wave',
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: const Text(
                    'Instantly share this wave to your followers',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                  onTap: () {
                    Navigator.pop(ctx);
                    setState(() {
                      _posts = _posts.map((p) {
                        if (p.id == post.id) {
                          final isReposted = !p.isReposted;
                          final count = isReposted ? p.repostCount + 1 : p.repostCount - 1;
                          return p.copyWith(isReposted: isReposted, repostCount: count);
                        }
                        return p;
                      }).toList();
                    });
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.format_quote_rounded, color: QuantColors.sovereignCyan),
                  title: const Text(
                    'Quote Wave',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  subtitle: const Text(
                    'Add your commentary before circulating',
                    style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                  ),
                  onTap: () {
                    Navigator.pop(ctx);
                    _showQuoteDialog(post);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showQuoteDialog(WavePost post) {
    final quoteController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        title: const Text(
          'Quote Wave',
          style: TextStyle(color: QuantColors.textPrimary, fontSize: 18),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: quoteController,
              autofocus: true,
              style: const TextStyle(color: QuantColors.textPrimary),
              decoration: const InputDecoration(
                hintText: 'Add your insights...',
                hintStyle: TextStyle(color: QuantColors.textMuted),
                border: InputBorder.none,
              ),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: QuantColors.elevatedCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                '${post.authorName}: ${post.content}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.moltenAmber,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Quote Wave broadcasted to the sovereign mesh.',
                    style: TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
            child: const Text('Post Quote', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _handleBookmarkToggle(String postId) {
    setState(() {
      _posts = _posts.map((post) {
        if (post.id == postId) {
          final isBookmarked = !post.isBookmarked;
          final count = isBookmarked ? post.bookmarkCount + 1 : post.bookmarkCount - 1;
          return post.copyWith(isBookmarked: isBookmarked, bookmarkCount: count);
        }
        return post;
      }).toList();
    });
  }

  void _handlePollVote(String postId, int optionIndex) {
    setState(() {
      _posts = _posts.map((post) {
        if (post.id == postId && post.poll != null && !post.poll!.hasVoted) {
          final poll = post.poll!;
          final updatedOptions = List<WavePollOption>.generate(poll.options.length, (idx) {
            final opt = poll.options[idx];
            final count = idx == optionIndex ? opt.voteCount + 1 : opt.voteCount;
            return WavePollOption(
              id: opt.id,
              text: opt.text,
              voteCount: count,
              percentage: 0.0, // calculated below
            );
          });
          final newTotal = poll.totalVotes + 1;
          final finalOptions = updatedOptions.map((opt) {
            final pct = (opt.voteCount / newTotal) * 100.0;
            return WavePollOption(
              id: opt.id,
              text: opt.text,
              voteCount: opt.voteCount,
              percentage: pct,
            );
          }).toList();

          return post.copyWith(
            poll: poll.copyWith(
              options: finalOptions,
              totalVotes: newTotal,
              hasVoted: true,
              selectedOptionIndex: optionIndex,
            ),
          );
        }
        return post;
      }).toList();
    });
  }

  void _handleCreatePost() {
    final text = _quickPostController.text.trim();
    if (text.isEmpty) return;

    final newPost = WavePost(
      id: 'post-${DateTime.now().millisecondsSinceEpoch}',
      authorName: 'Quant Sovereign',
      authorHandle: '@quant_user',
      authorInitials: 'QS',
      avatarColor: QuantColors.moltenAmber,
      isVerified: true,
      timestamp: 'Just now',
      content: text,
      replyCount: 0,
      repostCount: 0,
      likeCount: 0,
      bookmarkCount: 0,
    );

    setState(() {
      _posts.insert(0, newPost);
      _quickPostController.clear();
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Wave published to sovereign timeline.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Sub-Navigation: For You vs Following
        _buildFeedTabBar(),

        // Quick Post Composer Bar
        _buildQuickComposer(),

        // Main Thread Feed
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: _posts.length,
            separatorBuilder: (context, index) => const Divider(
              color: QuantColors.hairlineBorder,
              height: 1,
            ),
            itemBuilder: (context, index) {
              return _buildPostCard(_posts[index]);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildFeedTabBar() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _buildFeedTabButton(0, 'For You'),
          ),
          Expanded(
            child: _buildFeedTabButton(1, 'Following'),
          ),
        ],
      ),
    );
  }

  Widget _buildFeedTabButton(int index, String label) {
    final isSelected = _selectedFeedIndex == index;
    return InkWell(
      onTap: () => setState(() => _selectedFeedIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: isSelected ? QuantColors.moltenAmber : Colors.transparent,
              width: 2.5,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
            fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
            fontSize: 14,
          ),
        ),
      ),
    );
  }

  Widget _buildQuickComposer() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 18,
            backgroundColor: QuantColors.moltenAmber,
            child: const Text(
              'QS',
              style: TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextField(
              controller: _quickPostController,
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
              decoration: const InputDecoration(
                hintText: "What is happening across the mesh?",
                hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 14),
                border: InputBorder.none,
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          IconButton(
            icon: const Icon(Icons.poll_outlined, color: QuantColors.sovereignCyan, size: 20),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Interactive poll creator open.',
                    style: TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.moltenAmber,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              minimumSize: const Size(60, 34),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(18),
              ),
            ),
            onPressed: _handleCreatePost,
            child: const Text(
              'Wave',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPostCard(WavePost post) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: QuantColors.voidObsidian,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Author Avatar
          CircleAvatar(
            radius: 20,
            backgroundColor: post.avatarColor,
            child: Text(
              post.authorInitials,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
          const SizedBox(width: 12),

          // Post Content Column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Author Header Row
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        post.authorName,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (post.isVerified) ...[
                      const SizedBox(width: 4),
                      const Icon(
                        Icons.verified_rounded,
                        color: QuantColors.sovereignCyan,
                        size: 15,
                      ),
                    ],
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        post.authorHandle,
                        style: const TextStyle(
                          color: QuantColors.textMuted,
                          fontSize: 13,
                        ),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Text(
                      '•',
                      style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      post.timestamp,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                    const Spacer(),
                    const Icon(
                      Icons.more_horiz_rounded,
                      color: QuantColors.textMuted,
                      size: 18,
                    ),
                  ],
                ),
                const SizedBox(height: 6),

                // Post Content Text
                Text(
                  post.content,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 14,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 10),

                // Attached Interactive Poll (if present)
                if (post.poll != null) ...[
                  _buildPollCard(post, post.poll!),
                  const SizedBox(height: 10),
                ],

                // Attached Media Preview (if present)
                if (post.mediaUrl != null) ...[
                  _buildMediaPreviewCard(post),
                  const SizedBox(height: 10),
                ],

                // Action Bar: Reply, Repost, Like, Bookmark, Share
                _buildActionBar(post),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPollCard(WavePost post, WavePoll poll) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.poll_rounded, color: QuantColors.sovereignCyan, size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  poll.question,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...List.generate(poll.options.length, (optIdx) {
            final option = poll.options[optIdx];
            final isSelected = poll.selectedOptionIndex == optIdx;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: poll.hasVoted ? null : () => _handlePollVote(post.id, optIdx),
                child: Container(
                  height: 38,
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isSelected ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
                      width: 1,
                    ),
                  ),
                  child: Stack(
                    children: [
                      // Progress fill bar (Hardware accelerated box decoration, ZERO clipPath)
                      if (poll.hasVoted)
                        FractionallySizedBox(
                          widthFactor: (option.percentage / 100.0).clamp(0.0, 1.0),
                          child: Container(
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? QuantColors.sovereignCyan.withOpacity(0.35)
                                  : QuantColors.activeBorder.withOpacity(0.3),
                              borderRadius: BorderRadius.circular(9),
                            ),
                          ),
                        ),
                      // Text content overlay
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              option.text,
                              style: TextStyle(
                                color: isSelected ? QuantColors.sovereignCyan : QuantColors.textPrimary,
                                fontSize: 12,
                                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                              ),
                            ),
                            if (poll.hasVoted)
                              Text(
                                '${option.percentage.toStringAsFixed(1)}%',
                                style: const TextStyle(
                                  color: QuantColors.textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
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
          }),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '${poll.totalVotes} votes',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              Text(
                poll.hasVoted ? 'Final results' : 'Tap an option to vote',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMediaPreviewCard(WavePost post) {
    return Container(
      height: 160,
      width: double.infinity,
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        gradient: LinearGradient(
          colors: [
            QuantColors.darkSlateCard,
            QuantColors.obsidianPurple.withOpacity(0.15),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Stack(
        children: [
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.hub_rounded,
                  color: QuantColors.obsidianPurple.withOpacity(0.7),
                  size: 44,
                ),
                const SizedBox(height: 6),
                const Text(
                  'Sovereign Git Mesh Preview',
                  style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  '15 Subagents Connected • 100% Green Matrix',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            right: 10,
            bottom: 10,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.7),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                '120Hz Impeller Direct',
                style: TextStyle(
                  color: QuantColors.statusSuccess,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionBar(WavePost post) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        // Reply
        _buildActionItem(
          icon: Icons.chat_bubble_outline_rounded,
          count: post.replyCount,
          color: QuantColors.textMuted,
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Replying to ${post.authorHandle}',
                  style: const TextStyle(color: QuantColors.textPrimary),
                ),
              ),
            );
          },
        ),

        // Repost / Quote
        _buildActionItem(
          icon: post.isReposted ? Icons.repeat_on_rounded : Icons.repeat_rounded,
          count: post.repostCount,
          color: post.isReposted ? QuantColors.emeraldMatrix : QuantColors.textMuted,
          onTap: () => _handleRepostAction(post),
        ),

        // Like Heart
        _buildActionItem(
          icon: post.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
          count: post.likeCount,
          color: post.isLiked ? QuantColors.crimsonRed : QuantColors.textMuted,
          onTap: () => _handleLikeToggle(post.id),
        ),

        // Bookmark
        _buildActionItem(
          icon: post.isBookmarked ? Icons.bookmark_rounded : Icons.bookmark_border_rounded,
          count: post.bookmarkCount,
          color: post.isBookmarked ? QuantColors.moltenAmber : QuantColors.textMuted,
          onTap: () => _handleBookmarkToggle(post.id),
        ),

        // Share
        InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Wave link copied to sovereign clipboard.',
                  style: TextStyle(color: QuantColors.textPrimary),
                ),
              ),
            );
          },
          child: const Padding(
            padding: EdgeInsets.all(6),
            child: Icon(
              Icons.share_outlined,
              size: 18,
              color: QuantColors.textMuted,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionItem({
    required IconData icon,
    required int count,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 18, color: color),
            if (count > 0) ...[
              const SizedBox(width: 4),
              Text(
                count > 999 ? '${(count / 1000).toStringAsFixed(1)}k' : count.toString(),
                style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
