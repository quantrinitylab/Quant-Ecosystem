// QuantChat Stories tab (Phase 2C).
//
// Layout pattern (abstract, original Quant design -- obsidian dark theme):
// header (avatar + search | "Stories" title | add-friend badge + overflow),
// then three sections: Friends (horizontal avatar carousel with unviewed
// rings), Following (two-column story cards), Discover (two-column larger
// editorial cards). Every tool carries a text label or tooltip -- never
// icon-only.
//
// Data: GET /stories/feed (friends/following/own groups) and
// GET /stories/discover. Empty states are honest ("no stories yet"),
// errors show a retry -- never fabricated rows.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';
import 'discover_viewer_screen.dart';
import 'story_create_screen.dart';
import 'story_viewer_screen.dart';

class StoriesTabScreen extends StatefulWidget {
  final StoryService? service;

  const StoriesTabScreen({super.key, this.service});

  @override
  State<StoriesTabScreen> createState() => _StoriesTabScreenState();
}

class _StoriesTabScreenState extends State<StoriesTabScreen> {
  late final StoryService _service;
  bool _loading = true;
  String? _error;
  List<StoryGroup> _groups = const [];
  List<StorySegment> _discover = const [];

  @override
  void initState() {
    super.initState();
    _service = widget.service ?? StoryService();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _service.getFeed(),
        _service.getDiscover(),
      ]);
      if (!mounted) return;
      setState(() {
        _groups = results[0] as List<StoryGroup>;
        _discover = results[1] as List<StorySegment>;
        _loading = false;
      });
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.message;
      });
    }
  }

  List<StoryGroup> get _friendGroups =>
      _groups.where((g) => g.isFriend && g.segments.isNotEmpty).toList();

  List<StoryGroup> get _followingGroups => _groups
      .where((g) => !g.isFriend && g.isFollowing && g.segments.isNotEmpty)
      .toList();

  void _openGroup(StoryGroup group) {
    final viewable =
        _groups.where((g) => g.segments.isNotEmpty).toList();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StoryViewerScreen(
          service: _service,
          groups: viewable,
          initialGroupId: group.userId,
        ),
      ),
    ).then((_) => _load());
  }

  void _openDiscover(int index) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => DiscoverViewerScreen(
          service: _service,
          items: _discover,
          initialIndex: index,
        ),
      ),
    ).then((_) => _load());
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(message, style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: QuantColors.neonGreen,
        foregroundColor: Colors.black,
        onPressed: _onCreatePressed,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Create story',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  void _onCreatePressed() {
    // Creation entry point (c): Memories -> Create Story flow.
    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (_) => StoryCreateScreen(service: _service),
          ),
        )
        .then((_) => _load());
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: QuantColors.hairlineBorder)),
      ),
      child: Row(
        children: [
          // Avatar + search (labels via tooltip; search opens story search).
          const CircleAvatar(
            radius: 16,
            backgroundColor: QuantColors.darkSlateCard,
            child: Icon(Icons.person_rounded, size: 18, color: QuantColors.textMuted),
          ),
          IconButton(
            tooltip: 'Search stories',
            icon: const Icon(Icons.search_rounded, color: QuantColors.textPrimary),
            onPressed: () => _showSnack('Story search is coming soon.'),
          ),
          const Expanded(
            child: Center(
              child: Text(
                'Stories',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          // Add-friend button (labelled via tooltip). No badge count: badges
          // must come from real data (friend-request count), never a
          // hardcoded number.
          IconButton(
            tooltip: 'Add friend',
            icon: const Icon(Icons.person_add_rounded,
                color: QuantColors.textPrimary),
            onPressed: () => _showSnack('Friend search is coming soon.'),
          ),
          PopupMenuButton<String>(
            tooltip: 'More options',
            icon: const Icon(Icons.more_horiz_rounded, color: QuantColors.textPrimary),
            onSelected: (value) {
              if (value == 'create') _onCreatePressed();
              if (value == 'refresh') _load();
            },
            itemBuilder: (_) => const [
              PopupMenuItem(
                  value: 'create',
                  child: ListTile(
                      leading: Icon(Icons.add_rounded),
                      title: Text('Create story'))),
              PopupMenuItem(
                  value: 'refresh',
                  child: ListTile(
                      leading: Icon(Icons.refresh_rounded),
                      title: Text('Refresh feed'))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: QuantColors.neonGreen),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_rounded,
                  color: QuantColors.textMuted, size: 40),
              const SizedBox(height: 12),
              const Text('Could not load stories',
                  style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: QuantColors.textMuted)),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.neonGreen,
                  foregroundColor: Colors.black,
                ),
              ),
            ],
          ),
        ),
      );
    }
    final friends = _friendGroups;
    final following = _followingGroups;
    return RefreshIndicator(
      color: QuantColors.neonGreen,
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.only(bottom: 96),
        children: [
          _buildSectionTitle('Friends', Icons.group_rounded),
          _buildFriendsCarousel(friends),
          const SizedBox(height: 8),
          if (following.isNotEmpty) ...[
            _buildSectionTitle('Following', Icons.subscriptions_rounded),
            _buildFollowingGrid(following),
            const SizedBox(height: 8),
          ],
          _buildSectionTitle('Discover', Icons.explore_rounded),
          _buildDiscoverGrid(),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Row(
        children: [
          Icon(icon, size: 18, color: QuantColors.neonGreen),
          const SizedBox(width: 8),
          Text(title,
              style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }

  Widget _buildFriendsCarousel(List<StoryGroup> friends) {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: friends.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (context, index) {
          if (index == 0) {
            // "+ New" tile -- creation entry point.
            return _buildNewStoryTile();
          }
          final group = friends[index - 1];
          final ringColor = group.hasUnviewed
              ? QuantColors.neonGreen
              : QuantColors.textMuted;
          return GestureDetector(
            onTap: () => _openGroup(group),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: ringColor, width: 2.5),
                  ),
                  child: CircleAvatar(
                    radius: 30,
                    backgroundColor: QuantColors.darkSlateCard,
                    backgroundImage: group.userAvatar.isNotEmpty
                        ? NetworkImage(group.userAvatar)
                        : null,
                    child: group.userAvatar.isEmpty
                        ? Text(
                            group.userName.isNotEmpty
                                ? group.userName[0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontWeight: FontWeight.w800,
                                fontSize: 20),
                          )
                        : null,
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: 72,
                  child: Text(
                    group.isOwn ? 'My Story' : group.userName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 12,
                      fontWeight: group.hasUnviewed
                          ? FontWeight.w700
                          : FontWeight.w400,
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildNewStoryTile() {
    return GestureDetector(
      onTap: _onCreatePressed,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: QuantColors.hairlineBorder, width: 2.5),
                ),
                child: const CircleAvatar(
                  radius: 30,
                  backgroundColor: QuantColors.darkSlateCard,
                  child: Icon(Icons.person_rounded,
                      color: QuantColors.textMuted, size: 28),
                ),
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  decoration: const BoxDecoration(
                    color: QuantColors.neonGreen,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.add_rounded,
                      color: Colors.black, size: 20),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const SizedBox(
            width: 72,
            child: Text('New story',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 12,
                    fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }

  Widget _buildFollowingGrid(List<StoryGroup> following) {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.78,
      ),
      itemCount: following.length,
      itemBuilder: (context, index) {
        final group = following[index];
        final cover = group.segments.first;
        return _buildStoryCard(
          title: group.userName,
          subtitle: 'Following',
          cover: cover,
          onTap: () => _openGroup(group),
        );
      },
    );
  }

  Widget _buildDiscoverGrid() {
    if (_discover.isEmpty) {
      return const Padding(
        padding: EdgeInsets.all(24),
        child: Center(
          child: Text('No public stories yet.',
              style: TextStyle(color: QuantColors.textMuted)),
        ),
      );
    }
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 12,
        crossAxisSpacing: 12,
        childAspectRatio: 0.72,
      ),
      itemCount: _discover.length,
      itemBuilder: (context, index) {
        final item = _discover[index];
        return _buildStoryCard(
          title: item.name ?? item.authorName,
          subtitle: item.authorName,
          cover: item,
          footer: Row(
            children: [
              const Icon(Icons.favorite_rounded,
                  size: 14, color: QuantColors.textMuted),
              const SizedBox(width: 4),
              Text('${item.likeCount}',
                  style: const TextStyle(
                      color: QuantColors.textMuted, fontSize: 12)),
            ],
          ),
          onTap: () => _openDiscover(index),
        );
      },
    );
  }

  Widget _buildStoryCard({
    required String title,
    required String subtitle,
    required StorySegment cover,
    Widget? footer,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: _buildCover(cover)),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
              child: Text(title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w700,
                      fontSize: 13)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
              child: footer ??
                  Text(subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: QuantColors.textMuted, fontSize: 12)),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCover(StorySegment segment) {
    if (segment.type == StoryMediaType.text) {
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1B3A2D), Color(0xFF0B1F17)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: const EdgeInsets.all(10),
        child: Center(
          child: Text(segment.text ?? '',
              maxLines: 4,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 13)),
        ),
      );
    }
    if (segment.mediaUrl != null && segment.mediaUrl!.isNotEmpty) {
      return Image.network(
        segment.mediaUrl!,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const ColoredBox(
          color: QuantColors.darkSlateCard,
          child: Center(
              child: Icon(Icons.broken_image_rounded,
                  color: QuantColors.textMuted)),
        ),
      );
    }
    return const ColoredBox(
      color: QuantColors.darkSlateCard,
      child: Center(
          child:
              Icon(Icons.image_rounded, color: QuantColors.textMuted)),
    );
  }
}
