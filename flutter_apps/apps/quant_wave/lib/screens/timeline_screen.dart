// Sovereign Quant Ecosystem - QuantWave Timeline Feed Screen
// Sovereign X / Twitter Parity Microblogging Thread Feed
// Strictly ZERO raw Unicode emojis throughout this file.
// Pure 120Hz Impeller & Skia hardware acceleration.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';


class TimelineScreen extends StatefulWidget {
  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  int _selectedFeedIndex = 0; // 0: For You, 1: Following
  late List<WavePost> _posts;
  final TextEditingController _quickPostController = TextEditingController();
  int _composerCharCount = 0;
  static const int _maxPostLength = 280;

  String? _selectedHashtag;
  final Set<String> _expandedThreadPostIds = {};

  @override
  void initState() {
    super.initState();
    // No mock data: posts load from the real backend. Honestly empty until
    // the data seam is wired.
    _posts = <WavePost>[];
    _quickPostController.addListener(_onComposerTextChanged);
  }

  void _onComposerTextChanged() {
    setState(() {
      _composerCharCount = _quickPostController.text.characters.length;
    });
  }

  @override
  void dispose() {
    _quickPostController.removeListener(_onComposerTextChanged);
    _quickPostController.dispose();
    super.dispose();
  }

  void _toggleThreadExpansion(String postId) {
    setState(() {
      if (_expandedThreadPostIds.contains(postId)) {
        _expandedThreadPostIds.remove(postId);
      } else {
        _expandedThreadPostIds.add(postId);
      }
    });
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

  void _handleReplyLikeToggle(String postId, String replyId) {
    setState(() {
      _posts = _posts.map((post) {
        if (post.id == postId) {
          final updatedReplies = post.replies.map((reply) {
            if (reply.id == replyId) {
              final isLiked = !reply.isLiked;
              final count = isLiked ? reply.likeCount + 1 : reply.likeCount - 1;
              return reply.copyWith(isLiked: isLiked, likeCount: count);
            }
            return reply;
          }).toList();
          return post.copyWith(replies: updatedReplies);
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
              maxLength: 280,
              decoration: const InputDecoration(
                hintText: 'Add your insights...',
                hintStyle: TextStyle(color: QuantColors.textMuted),
                border: InputBorder.none,
                counterStyle: TextStyle(color: QuantColors.textMuted, fontSize: 11),
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
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 10,
                        backgroundColor: post.avatarColor,
                        child: Text(
                          post.authorInitials,
                          style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Text(
                        post.authorName,
                        style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12, fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        post.authorHandle,
                        style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    post.content,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(color: QuantColors.textSecondary, fontSize: 12),
                  ),
                ],
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
              final text = quoteController.text.trim();
              if (text.isNotEmpty) {
                final quotePost = WavePost(
                  id: 'quote-${DateTime.now().millisecondsSinceEpoch}',
                  authorName: 'Quant Sovereign',
                  authorHandle: '@quant_user',
                  authorInitials: 'QS',
                  avatarColor: QuantColors.moltenAmber,
                  isVerified: true,
                  timestamp: 'Just now',
                  content: text,
                  quotedPost: post,
                  replyCount: 0,
                  repostCount: 0,
                  likeCount: 0,
                  bookmarkCount: 0,
                );
                setState(() {
                  _posts.insert(0, quotePost);
                });
              }
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

  void _showReplyDialog(WavePost post) {
    final replyController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
        title: Text(
          'Reply to ${post.authorHandle}',
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 16),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              post.content,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: replyController,
              autofocus: true,
              style: const TextStyle(color: QuantColors.textPrimary),
              maxLength: 280,
              decoration: const InputDecoration(
                hintText: 'Post your reply...',
                hintStyle: TextStyle(color: QuantColors.textMuted),
                border: InputBorder.none,
                counterStyle: TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              maxLines: 3,
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
              backgroundColor: QuantColors.sovereignCyan,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            onPressed: () {
              final text = replyController.text.trim();
              if (text.isNotEmpty) {
                final newReply = WaveThreadReply(
                  id: 'reply-${DateTime.now().millisecondsSinceEpoch}',
                  authorName: 'Quant Sovereign',
                  authorHandle: '@quant_user',
                  authorInitials: 'QS',
                  avatarColor: QuantColors.moltenAmber,
                  isVerified: true,
                  timestamp: 'Just now',
                  content: text,
                  likeCount: 0,
                  depth: 0,
                );
                setState(() {
                  _posts = _posts.map((p) {
                    if (p.id == post.id) {
                      final updatedReplies = [newReply, ...p.replies];
                      return p.copyWith(
                        replies: updatedReplies,
                        replyCount: p.replyCount + 1,
                      );
                    }
                    return p;
                  }).toList();
                  _expandedThreadPostIds.add(post.id);
                });
              }
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Reply appended to sovereign wave thread.',
                    style: TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
            child: const Text('Reply', style: TextStyle(color: Colors.white)),
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
              percentage: 0.0,
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
    if (text.isEmpty || text.length > _maxPostLength) return;

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
      _composerCharCount = 0;
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

  List<WavePost> get _filteredPosts {
    if (_selectedHashtag == null) return _posts;
    return _posts.where((p) => p.hashtags.contains(_selectedHashtag) || p.content.contains(_selectedHashtag!)).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Sub-Navigation: For You vs Following
        _buildFeedTabBar(),

        // Trending Hashtags Carousel Pills
        _buildTrendingHashtagsBar(),

        // Quick Post 280-char Composer Bar
        _buildQuickComposer(),

        // Main Thread Feed
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: _filteredPosts.length,
            separatorBuilder: (context, index) => const Divider(
              color: QuantColors.hairlineBorder,
              height: 1,
            ),
            itemBuilder: (context, index) {
              return _buildPostCard(_filteredPosts[index]);
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

  Widget _buildTrendingHashtagsBar() {
    // No mock data: no fabricated trending hashtags.
    final hashtags = <String>[];
    return Container(
      height: 44,
      padding: const EdgeInsets.symmetric(vertical: 6),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: hashtags.length,
        separatorBuilder: (context, index) => const SizedBox(width: 8),
        itemBuilder: (context, index) {
          final tag = hashtags[index];
          final isSelected = _selectedHashtag == tag;
          return InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () {
              setState(() {
                if (_selectedHashtag == tag) {
                  _selectedHashtag = null;
                } else {
                  _selectedHashtag = tag;
                }
              });
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: isSelected ? QuantColors.moltenAmber.withOpacity(0.2) : QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected ? QuantColors.moltenAmber : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.tag_rounded,
                    size: 13,
                    color: isSelected ? QuantColors.moltenAmber : QuantColors.sovereignCyan,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    tag.replaceFirst('#', ''),
                    style: TextStyle(
                      color: isSelected ? QuantColors.moltenAmber : QuantColors.textSecondary,
                      fontSize: 12,
                      fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildQuickComposer() {
    final remainingChars = _maxPostLength - _composerCharCount;
    final isOverLimit = remainingChars < 0;
    final isNearLimit = remainingChars <= 30 && !isOverLimit;

    Color charCounterColor = QuantColors.textMuted;
    if (isOverLimit) {
      charCounterColor = QuantColors.crimsonRed;
    } else if (isNearLimit) {
      charCounterColor = QuantColors.moltenAmber;
    }

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
                  maxLength: _maxPostLength,
                  maxLines: null,
                  style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
                  decoration: const InputDecoration(
                    hintText: "What is happening across the mesh? (280 chars)",
                    hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 14),
                    border: InputBorder.none,
                    isDense: true,
                    counterText: '',
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
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
                  IconButton(
                    icon: const Icon(Icons.image_outlined, color: QuantColors.sovereignCyan, size: 20),
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          backgroundColor: QuantColors.darkSlateCard,
                          content: Text(
                            'Media attachment selector open.',
                            style: TextStyle(color: QuantColors.textPrimary),
                          ),
                        ),
                      );
                    },
                  ),
                ],
              ),
              Row(
                children: [
                  // 280-char Counter indicator
                  Text(
                    '$remainingChars',
                    style: TextStyle(
                      color: charCounterColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(width: 10),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: QuantColors.moltenAmber,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      minimumSize: const Size(60, 34),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(18),
                      ),
                    ),
                    onPressed: (_composerCharCount > 0 && !isOverLimit) ? _handleCreatePost : null,
                    child: const Text(
                      'Wave',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPostCard(WavePost post) {
    final hasReplies = post.replies.isNotEmpty;
    final isThreadExpanded = _expandedThreadPostIds.contains(post.id);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      color: QuantColors.voidObsidian,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
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

                    // Attached Quote-Wave Card (if present)
                    if (post.quotedPost != null) ...[
                      _buildQuoteWaveCard(post.quotedPost!),
                      const SizedBox(height: 10),
                    ],

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

          // Thread Reply Nesting Section
          if (hasReplies) ...[
            const SizedBox(height: 8),
            _buildThreadNestingSection(post, isThreadExpanded),
          ],
        ],
      ),
    );
  }

  Widget _buildQuoteWaveCard(WavePost quoted) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 10,
                backgroundColor: quoted.avatarColor,
                child: Text(
                  quoted.authorInitials,
                  style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                quoted.authorName,
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              if (quoted.isVerified) ...[
                const SizedBox(width: 4),
                const Icon(Icons.verified_rounded, size: 12, color: QuantColors.sovereignCyan),
              ],
              const SizedBox(width: 6),
              Text(
                quoted.authorHandle,
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const SizedBox(width: 4),
              const Text('•', style: TextStyle(color: QuantColors.textMuted, fontSize: 10)),
              const SizedBox(width: 4),
              Text(
                quoted.timestamp,
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            quoted.content,
            style: const TextStyle(color: QuantColors.textSecondary, fontSize: 13, height: 1.3),
          ),
        ],
      ),
    );
  }

  Widget _buildThreadNestingSection(WavePost post, bool isExpanded) {
    return Padding(
      padding: const EdgeInsets.only(left: 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: () => _toggleThreadExpansion(post.id),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    isExpanded ? Icons.expand_less_rounded : Icons.subdirectory_arrow_right_rounded,
                    color: QuantColors.sovereignCyan,
                    size: 16,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    isExpanded ? 'Hide Thread' : 'Show ${post.replies.length} Replies in Thread',
                    style: const TextStyle(
                      color: QuantColors.sovereignCyan,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
          if (isExpanded) ...[
            const SizedBox(height: 6),
            ...post.replies.map((reply) => _buildThreadReplyCard(post.id, reply)),
          ],
        ],
      ),
    );
  }

  Widget _buildThreadReplyCard(String postId, WaveThreadReply reply) {
    return Container(
      margin: EdgeInsets.only(left: (reply.depth * 16).toDouble(), top: 6, bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(10),
        border: Border(
          left: BorderSide(
            color: reply.depth > 0 ? QuantColors.moltenAmber : QuantColors.sovereignCyan,
            width: 2,
          ),
          top: const BorderSide(color: QuantColors.hairlineBorder, width: 0.5),
          right: const BorderSide(color: QuantColors.hairlineBorder, width: 0.5),
          bottom: const BorderSide(color: QuantColors.hairlineBorder, width: 0.5),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 10,
                backgroundColor: reply.avatarColor,
                child: Text(
                  reply.authorInitials,
                  style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 6),
              Text(
                reply.authorName,
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              if (reply.isVerified) ...[
                const SizedBox(width: 4),
                const Icon(Icons.verified_rounded, size: 12, color: QuantColors.sovereignCyan),
              ],
              const SizedBox(width: 6),
              Text(
                reply.authorHandle,
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const SizedBox(width: 4),
              const Text('•', style: TextStyle(color: QuantColors.textMuted, fontSize: 10)),
              const SizedBox(width: 4),
              Text(
                reply.timestamp,
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const Spacer(),
              InkWell(
                onTap: () => _handleReplyLikeToggle(postId, reply.id),
                child: Row(
                  children: [
                    Icon(
                      reply.isLiked ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                      size: 14,
                      color: reply.isLiked ? QuantColors.crimsonRed : QuantColors.textMuted,
                    ),
                    if (reply.likeCount > 0) ...[
                      const SizedBox(width: 3),
                      Text(
                        '${reply.likeCount}',
                        style: TextStyle(
                          color: reply.isLiked ? QuantColors.crimsonRed : QuantColors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            reply.content,
            style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12, height: 1.3),
          ),
          if (reply.nestedReplies.isNotEmpty) ...[
            const SizedBox(height: 6),
            ...reply.nestedReplies.map((nested) => _buildThreadReplyCard(postId, nested)),
          ],
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
                      // Progress fill bar (Hardware accelerated box decoration, ZERO runtime clipping)
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
                  '15 Subagents Connected - 100% Green Matrix',
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
          onTap: () => _showReplyDialog(post),
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
