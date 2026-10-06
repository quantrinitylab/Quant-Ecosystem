// Sovereign Quant Ecosystem - QuantWave SubWaves Screen
// Sovereign Reddit-Class Community Discussion & Nested Comments
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';

import 'subwaves_hub_screen.dart';

class SubWavesScreen extends StatefulWidget {
  const SubWavesScreen({super.key});

  @override
  State<SubWavesScreen> createState() => _SubWavesScreenState();
}

class _SubWavesScreenState extends State<SubWavesScreen> {
  late List<SubWaveCommunity> _communities;
  late List<SubWavePost> _posts;
  String _selectedCommunityId = 'all';
  SubWaveSort _currentSort = SubWaveSort.hot;

  @override
  void initState() {
    super.initState();
    // No mock data: communities and posts load from the real backend.
    _communities = <SubWaveCommunity>[];
    _posts = <SubWavePost>[];
  }

  void _handleVote(String postId, int direction) {
    setState(() {
      _posts = _posts.map((post) {
        if (post.id == postId) {
          int newUserVote = post.userVote == direction ? 0 : direction;
          int upDelta = 0;
          int downDelta = 0;

          if (post.userVote == 1) upDelta -= 1;
          if (post.userVote == -1) downDelta -= 1;

          if (newUserVote == 1) upDelta += 1;
          if (newUserVote == -1) downDelta += 1;

          return post.copyWith(
            userVote: newUserVote,
            upvotes: post.upvotes + upDelta,
            downvotes: post.downvotes + downDelta,
          );
        }
        return post;
      }).toList();
    });
  }

  void _toggleCommunityJoin(String communityId) {
    setState(() {
      _communities = _communities.map((c) {
        if (c.id == communityId) {
          final isJoined = !c.isJoined;
          return c.copyWith(
            isJoined: isJoined,
            memberCount: isJoined ? c.memberCount + 1 : c.memberCount - 1,
          );
        }
        return c;
      }).toList();
    });
  }

  void _showCommentsModal(SubWavePost post) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.voidObsidian,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return DraggableScrollableSheet(
          initialChildSize: 0.85,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) {
            return Column(
              children: [
                // Modal Handle
                Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: QuantColors.activeBorder,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                // Modal Header
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: Row(
                    children: [
                      Text(
                        post.communityName,
                        style: const TextStyle(
                          color: QuantColors.sovereignCyan,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        '• ${post.commentCount} comments',
                        style: const TextStyle(
                          color: QuantColors.textMuted,
                          fontSize: 13,
                        ),
                      ),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                        onPressed: () => Navigator.pop(ctx),
                      ),
                    ],
                  ),
                ),
                const Divider(color: QuantColors.hairlineBorder, height: 1),

                // Post Summary in Modal
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.title,
                        style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        post.body,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: QuantColors.textSecondary,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                const Divider(color: QuantColors.hairlineBorder, height: 1),

                // Nested Comments List
                Expanded(
                  child: post.comments.isEmpty
                      ? const Center(
                          child: Text(
                            'No comments yet. Start the discussion!',
                            style: TextStyle(color: QuantColors.textMuted),
                          ),
                        )
                      : ListView.builder(
                          controller: scrollController,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                          itemCount: post.comments.length,
                          itemBuilder: (context, idx) {
                            return _buildCommentThread(post.comments[idx]);
                          },
                        ),
                ),

                // Add Comment Input Bar
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: const BoxDecoration(
                    color: QuantColors.darkSlateCard,
                    border: Border(
                      top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
                    ),
                  ),
                  child: SafeArea(
                    top: false,
                    child: Row(
                      children: [
                        const Expanded(
                          child: TextField(
                            style: TextStyle(color: QuantColors.textPrimary, fontSize: 13),
                            decoration: InputDecoration(
                              hintText: 'Add a sovereign comment...',
                              hintStyle: TextStyle(color: QuantColors.textMuted, fontSize: 13),
                              border: InputBorder.none,
                              isDense: true,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.send_rounded, color: QuantColors.moltenAmber),
                          onPressed: () {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                backgroundColor: QuantColors.darkSlateCard,
                                content: Text(
                                  'Comment added to discussion tree.',
                                  style: TextStyle(color: QuantColors.textPrimary),
                                ),
                              ),
                            );
                          },
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildCommentThread(SubWaveComment comment) {
    return Container(
      margin: EdgeInsets.only(left: (comment.depth * 16.0).clamp(0.0, 64.0), bottom: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: comment.depth == 0 ? QuantColors.darkSlateCard : QuantColors.elevatedCard,
        borderRadius: BorderRadius.circular(10),
        border: Border(
          left: BorderSide(
            color: comment.depth == 0 ? QuantColors.moltenAmber : QuantColors.sovereignCyan,
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
              Text(
                comment.authorHandle,
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
              const SizedBox(width: 6),
              Text(
                '• ${comment.timeAgo}',
                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
              const Spacer(),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.arrow_upward_rounded, size: 14, color: QuantColors.moltenAmber),
                  const SizedBox(width: 2),
                  Text(
                    comment.score.toString(),
                    style: const TextStyle(
                      color: QuantColors.textSecondary,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            comment.content,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 13,
              height: 1.35,
            ),
          ),
          if (comment.replies.isNotEmpty) ...[
            const SizedBox(height: 8),
            ...comment.replies.map(_buildCommentThread),
          ],
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Horizontal Community Header Bar
        _buildCommunitiesSelector(),

        // Sorting Filter Chips: Hot, New, Top, Rising
        _buildSortingBar(),

        // SubWave Posts Feed
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: _filteredPosts.length,
            separatorBuilder: (context, index) => const Divider(
              color: QuantColors.hairlineBorder,
              height: 1,
            ),
            itemBuilder: (context, index) {
              return _buildSubWavePostCard(_filteredPosts[index]);
            },
          ),
        ),
      ],
    );
  }

  List<SubWavePost> get _filteredPosts {
    if (_selectedCommunityId == 'all') return _posts;
    final comm = _communities.firstWhere(
      (c) => c.id == _selectedCommunityId,
      // Defensive: no crash when the community list is honestly empty.
      orElse: () => _communities.isEmpty
          ? const SubWaveCommunity(
              id: 'none',
              name: '',
              title: '',
              description: '',
              badgeColor: Colors.grey,
              memberCount: 0,
              onlineCount: 0,
              icon: Icons.public,
            )
          : _communities.first,
    );
    return _posts.where((p) => p.communityName == comm.name).toList();
  }

  Widget _buildCommunitiesSelector() {
    return Container(
      height: 60,
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        children: [
          _buildCommunityChip(
            id: 'all',
            label: 'All Waves',
            icon: Icons.all_inclusive_rounded,
            color: QuantColors.moltenAmber,
            isSelected: _selectedCommunityId == 'all',
          ),
          ..._communities.map((c) {
            return _buildCommunityChip(
              id: c.id,
              label: c.name,
              icon: c.icon,
              color: c.badgeColor,
              isSelected: _selectedCommunityId == c.id,
              memberCount: c.memberCount,
            );
          }),
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (ctx) => const SubWavesHubScreen(),
                  ),
                );
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: QuantColors.sovereignCyan,
                    width: 1,
                  ),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.explore_rounded, size: 16, color: QuantColors.sovereignCyan),
                    SizedBox(width: 6),
                    Text(
                      'Explore Hub',
                      style: TextStyle(
                        color: QuantColors.sovereignCyan,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCommunityChip({
    required String id,
    required String label,
    required IconData icon,
    required Color color,
    required bool isSelected,
    int? memberCount,
  }) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => setState(() => _selectedCommunityId = id),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.2) : QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isSelected ? color : QuantColors.hairlineBorder,
              width: 1,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: isSelected ? Colors.white : QuantColors.textSecondary,
                  fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSortingBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          const Text(
            'SORT BY:',
            style: TextStyle(
              color: QuantColors.textMuted,
              fontWeight: FontWeight.w700,
              fontSize: 11,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(width: 12),
          _buildSortButton(SubWaveSort.hot, 'Hot', Icons.local_fire_department_rounded),
          const SizedBox(width: 8),
          _buildSortButton(SubWaveSort.newest, 'New', Icons.bolt_rounded),
          const SizedBox(width: 8),
          _buildSortButton(SubWaveSort.top, 'Top', Icons.leaderboard_rounded),
          const SizedBox(width: 8),
          _buildSortButton(SubWaveSort.rising, 'Rising', Icons.trending_up_rounded),
        ],
      ),
    );
  }

  Widget _buildSortButton(SubWaveSort sort, String label, IconData icon) {
    final isSelected = _currentSort == sort;
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => setState(() => _currentSort = sort),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: isSelected ? QuantColors.activeBorder : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: 14,
              color: isSelected ? QuantColors.moltenAmber : QuantColors.textMuted,
            ),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                color: isSelected ? QuantColors.textPrimary : QuantColors.textMuted,
                fontSize: 12,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubWavePostCard(SubWavePost post) {
    return Container(
      color: QuantColors.voidObsidian,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Left Vertical Upvote/Downvote Column
          Column(
            children: [
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _handleVote(post.id, 1),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    Icons.arrow_upward_rounded,
                    size: 22,
                    color: post.userVote == 1 ? QuantColors.moltenAmber : QuantColors.textMuted,
                  ),
                ),
              ),
              Text(
                post.score.toString(),
                style: TextStyle(
                  color: post.userVote == 1
                      ? QuantColors.moltenAmber
                      : post.userVote == -1
                          ? QuantColors.sovereignCyan
                          : QuantColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => _handleVote(post.id, -1),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Icon(
                    Icons.arrow_downward_rounded,
                    size: 22,
                    color: post.userVote == -1 ? QuantColors.sovereignCyan : QuantColors.textMuted,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(width: 12),

          // Main Post Content Column
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Community & Metadata Tag Row
                Row(
                  children: [
                    Text(
                      post.communityName,
                      style: const TextStyle(
                        color: QuantColors.sovereignCyan,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '• Posted by ${post.authorHandle}',
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      post.timeAgo,
                      style: const TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 12,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: QuantColors.hairlineBorder),
                      ),
                      child: Text(
                        post.tag,
                        style: const TextStyle(
                          color: QuantColors.moltenAmber,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),

                // Post Title
                Text(
                  post.title,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    height: 1.3,
                  ),
                ),
                const SizedBox(height: 6),

                // Post Body Preview
                Text(
                  post.body,
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 12),

                // Bottom Action Buttons
                Row(
                  children: [
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () => _showCommentsModal(post),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.mode_comment_outlined, size: 15, color: QuantColors.textMuted),
                            const SizedBox(width: 6),
                            Text(
                              '${post.commentCount} Comments',
                              style: const TextStyle(
                                color: QuantColors.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    InkWell(
                      borderRadius: BorderRadius.circular(8),
                      onTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            backgroundColor: QuantColors.darkSlateCard,
                            content: Text(
                              'Community post permalink copied.',
                              style: TextStyle(color: QuantColors.textPrimary),
                            ),
                          ),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(color: QuantColors.hairlineBorder),
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.share_outlined, size: 15, color: QuantColors.textMuted),
                            SizedBox(width: 4),
                            Text(
                              'Share',
                              style: TextStyle(
                                color: QuantColors.textSecondary,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
