// QuantChat Discover story viewer (Phase 2C).
//
// Editorial variant of the story viewer: creator header with follow,
// right rail (like / comment / share -- every tool labelled), bottom
// caption with a Subscribe pill. Likes, comments and follows are real
// backend rows (StoryLike, StoryComment, UserRelationship); share copies
// a story link. "View Profile" opens an author sheet with real data and a
// working follow toggle -- never a placeholder screen.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:video_player/video_player.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';

class DiscoverViewerScreen extends StatefulWidget {
  final StoryService service;
  final List<StorySegment> items;
  final int initialIndex;

  const DiscoverViewerScreen({
    super.key,
    required this.service,
    required this.items,
    this.initialIndex = 0,
  });

  @override
  State<DiscoverViewerScreen> createState() => _DiscoverViewerScreenState();
}

class _DiscoverViewerScreenState extends State<DiscoverViewerScreen>
    with SingleTickerProviderStateMixin {
  late int _index;
  late List<StorySegment> _items;
  AnimationController? _progress;
  VideoPlayerController? _video;
  bool _muted = false;
  bool _paused = false;
  bool _following = false;
  bool _followBusy = false;

  StorySegment get _item => _items[_index];

  @override
  void initState() {
    super.initState();
    _items = List<StorySegment>.from(widget.items);
    _index = widget.initialIndex.clamp(0, _items.length - 1);
    _refreshFollowState();
    _startItem();
  }

  @override
  void dispose() {
    _progress?.dispose();
    _video?.dispose();
    super.dispose();
  }

  Future<void> _refreshFollowState() async {
    try {
      final following = await widget.service.isFollowing(_item.authorId);
      if (mounted) setState(() => _following = following);
    } catch (_) {}
  }

  Future<void> _startItem() async {
    _progress?.dispose();
    await _video?.dispose();
    _video = null;
    final item = _item;

    unawaited(widget.service.markViewed(item.id).then((count) {
      if (!mounted) return;
      setState(() {
        _items[_index] = _items[_index].copyWith(isViewed: true, viewCount: count);
      });
    }).catchError((_) {}));

    if (item.type == StoryMediaType.video &&
        item.mediaUrl != null &&
        item.mediaUrl!.isNotEmpty) {
      final controller = VideoPlayerController.networkUrl(Uri.parse(item.mediaUrl!));
      _video = controller;
      try {
        await controller.initialize();
        await controller.setLooping(true);
        await controller.setVolume(_muted ? 0 : 1);
        if (mounted) setState(() {});
        _runProgress(controller.value.duration);
        await controller.play();
      } catch (_) {
        _runProgress(const Duration(seconds: 8));
      }
    } else {
      _runProgress(Duration(seconds: item.durationSec.clamp(1, 120)));
    }
    _refreshFollowState();
  }

  void _runProgress(Duration duration) {
    _progress?.dispose();
    _progress = AnimationController(vsync: this, duration: duration)
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) _next();
      });
    if (mounted) setState(() {});
    if (!_paused) _progress!.forward();
  }

  void _next() {
    if (_index + 1 < _items.length) {
      setState(() => _index++);
      _startItem();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  void _prev() {
    if (_index > 0) {
      setState(() => _index--);
      _startItem();
    } else {
      _startItem();
    }
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(message,
            style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  Future<void> _toggleLike() async {
    try {
      final result = await widget.service.toggleLike(_item.id);
      if (!mounted) return;
      setState(() {
        _items[_index] = _items[_index]
            .copyWith(isLiked: result.liked, likeCount: result.likeCount);
      });
    } on StoryApiException catch (e) {
      _showSnack('Like failed: ${e.message}');
    }
  }

  Future<void> _toggleFollow() async {
    if (_followBusy) return;
    setState(() => _followBusy = true);
    try {
      if (_following) {
        await widget.service.unfollowAuthor(_item.authorId);
        if (!mounted) return;
        setState(() {
          _following = false;
          _followBusy = false;
        });
        _showSnack('Unfollowed ${_item.authorName}');
      } else {
        final following = await widget.service.followAuthor(_item.authorId);
        if (!mounted) return;
        setState(() {
          _following = following;
          _followBusy = false;
        });
        _showSnack(following
            ? 'Following ${_item.authorName}'
            : 'Follow request not completed');
      }
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() => _followBusy = false);
      _showSnack('Follow failed: ${e.message}');
    }
  }

  void _openComments() {
    _progress?.stop();
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _CommentsSheet(
        service: widget.service,
        story: _item,
        onCommentAdded: () {
          if (!mounted) return;
          setState(() {
            _items[_index] = _items[_index]
                .copyWith(commentCount: _items[_index].commentCount + 1);
          });
        },
      ),
    ).then((_) {
      if (!_paused) _progress?.forward();
    });
  }

  void _share() {
    Clipboard.setData(ClipboardData(
        text: 'https://quantchat.quantrinity.in/stories/${_item.id}'));
    _showSnack('Story link copied to clipboard');
  }

  void _openAuthorSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              CircleAvatar(
                radius: 36,
                backgroundColor: QuantColors.voidObsidian,
                backgroundImage: _item.authorAvatar.isNotEmpty
                    ? NetworkImage(_item.authorAvatar)
                    : null,
                child: _item.authorAvatar.isEmpty
                    ? Text(
                        _item.authorName.isNotEmpty
                            ? _item.authorName[0].toUpperCase()
                            : '?',
                        style: const TextStyle(
                            color: QuantColors.textPrimary,
                            fontSize: 28,
                            fontWeight: FontWeight.w800))
                    : null,
              ),
              const SizedBox(height: 12),
              Text(_item.authorName,
                  style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text('${_item.viewCount} story views',
                  style: const TextStyle(color: QuantColors.textMuted)),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _followBusy
                      ? null
                      : () {
                          Navigator.of(context).pop();
                          _toggleFollow();
                        },
                  icon: Icon(_following
                      ? Icons.check_rounded
                      : Icons.add_rounded),
                  label: Text(_following ? 'Following' : 'Follow'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _following
                        ? QuantColors.voidObsidian
                        : QuantColors.neonGreen,
                    foregroundColor: _following
                        ? QuantColors.textPrimary
                        : Colors.black,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final item = _item;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          _buildMedia(item),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: _prev,
                  child: const SizedBox.expand(),
                ),
              ),
              Expanded(
                flex: 7,
                child: GestureDetector(
                  behavior: HitTestBehavior.translucent,
                  onTap: _next,
                  child: const SizedBox.expand(),
                ),
              ),
            ],
          ),
          _buildTopBar(item),
          _buildRightRail(item),
          _buildBottomBar(item),
        ],
      ),
    );
  }

  Widget _buildMedia(StorySegment item) {
    if (item.type == StoryMediaType.text) {
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF1E2A4A), Color(0xFF0A0F1E)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Center(
          child: Text(item.text ?? '',
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  height: 1.35)),
        ),
      );
    }
    if (_video != null && _video!.value.isInitialized) {
      return FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: _video!.value.size.width,
          height: _video!.value.size.height,
          child: VideoPlayer(_video!),
        ),
      );
    }
    if (item.mediaUrl != null && item.mediaUrl!.isNotEmpty) {
      return Image.network(item.mediaUrl!,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const Center(
              child: Icon(Icons.broken_image_rounded,
                  color: QuantColors.textMuted, size: 48)));
    }
    return const Center(
        child: Icon(Icons.image_rounded,
            color: QuantColors.textMuted, size: 48));
  }

  Widget _buildTopBar(StorySegment item) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Column(
            children: [
              // Segment progress.
              ClipRRect(
                borderRadius: BorderRadius.circular(2),
                child: _progress == null
                    ? const LinearProgressIndicator(
                        value: 0,
                        backgroundColor: Colors.white30,
                        valueColor:
                            AlwaysStoppedAnimation(Colors.white),
                        minHeight: 3,
                      )
                    : AnimatedBuilder(
                        animation: _progress!,
                        builder: (_, __) => LinearProgressIndicator(
                          value: _progress!.value,
                          backgroundColor: Colors.white30,
                          valueColor: const AlwaysStoppedAnimation(
                              Colors.white),
                          minHeight: 3,
                        ),
                      ),
              ),
              const SizedBox(height: 8),
              Row(
            children: [
              Expanded(
                child: Text(item.authorName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 16)),
              ),
              IconButton(
                tooltip: 'More options',
                icon:
                    const Icon(Icons.more_horiz_rounded, color: Colors.white),
                onPressed: () => _showSnack('More actions coming soon.'),
              ),
              _followBusy
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : TextButton.icon(
                      onPressed: _toggleFollow,
                      icon: Icon(
                          _following
                              ? Icons.check_rounded
                              : Icons.add_rounded,
                          color: Colors.white,
                          size: 18),
                      label: Text(_following ? 'Following' : 'Add',
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700)),
                    ),
              IconButton(
                tooltip: 'Close viewer',
                icon:
                    const Icon(Icons.close_rounded, color: Colors.white),
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ],
          ),
        ],
        ),
        ),
      ),
    );
  }

  Widget _buildRightRail(StorySegment item) {
    return Positioned(
      right: 8,
      bottom: 120,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _railButton(
            label: 'Like',
            icon: item.isLiked
                ? Icons.favorite_rounded
                : Icons.favorite_border_rounded,
            iconColor:
                item.isLiked ? QuantColors.statusError : Colors.white,
            count: '${item.likeCount}',
            onTap: _toggleLike,
          ),
          const SizedBox(height: 16),
          _railButton(
            label: 'Comments',
            icon: Icons.chat_bubble_outline_rounded,
            iconColor: Colors.white,
            count: '${item.commentCount}',
            onTap: _openComments,
          ),
          const SizedBox(height: 16),
          _railButton(
            label: 'Share',
            icon: Icons.send_rounded,
            iconColor: Colors.white,
            count: '',
            onTap: _share,
          ),
        ],
      ),
    );
  }

  Widget _railButton({
    required String label,
    required IconData icon,
    required Color iconColor,
    required String count,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: iconColor, size: 30),
          const SizedBox(height: 2),
          Text(label,
              style:
                  const TextStyle(color: Colors.white, fontSize: 10)),
          if (count.isNotEmpty)
            Text(count,
                style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }

  Widget _buildBottomBar(StorySegment item) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (item.name != null && item.name!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(item.name!,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16)),
                ),
              Text(
                item.type == StoryMediaType.text
                    ? (item.text ?? '')
                    : '${storyTimeAgo(item.createdAt)}  -  ${item.viewCount} views',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _openAuthorSheet,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: QuantColors.neonGreen,
                        foregroundColor: Colors.black,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24)),
                      ),
                      child: const Text('View Profile',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _followBusy ? null : _toggleFollow,
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(24)),
                      ),
                      child: Text(
                          _following ? 'Following' : 'Subscribe',
                          style:
                              const TextStyle(fontWeight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CommentsSheet extends StatefulWidget {
  final StoryService service;
  final StorySegment story;
  final VoidCallback onCommentAdded;

  const _CommentsSheet({
    required this.service,
    required this.story,
    required this.onCommentAdded,
  });

  @override
  State<_CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends State<_CommentsSheet> {
  late Future<List<StoryCommentModel>> _future;
  final TextEditingController _controller = TextEditingController();
  bool _posting = false;

  @override
  void initState() {
    super.initState();
    _future = widget.service.getComments(widget.story.id);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _post() async {
    final body = _controller.text.trim();
    if (body.isEmpty || _posting) return;
    setState(() => _posting = true);
    try {
      final comment =
          await widget.service.postComment(widget.story.id, body);
      if (!mounted) return;
      _controller.clear();
      setState(() {
        _posting = false;
        _future = _future.then((list) => [...list, comment]);
      });
      widget.onCommentAdded();
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() => _posting = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text('Comment failed: ${e.message}',
            style: const TextStyle(color: QuantColors.textPrimary)),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
            bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.6,
          child: Column(
            children: [
              const Padding(
                padding: EdgeInsets.all(14),
                child: Text('Comments',
                    style: TextStyle(
                        color: QuantColors.textPrimary,
                        fontWeight: FontWeight.w800,
                        fontSize: 16)),
              ),
              Expanded(
                child: FutureBuilder<List<StoryCommentModel>>(
                  future: _future,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState ==
                        ConnectionState.waiting) {
                      return const Center(
                          child: CircularProgressIndicator(
                              color: QuantColors.neonGreen));
                    }
                    if (snapshot.hasError) {
                      return const Center(
                          child: Text('Could not load comments.',
                              style: TextStyle(
                                  color: QuantColors.textMuted)));
                    }
                    final comments = snapshot.data ?? const [];
                    if (comments.isEmpty) {
                      return const Center(
                          child: Text(
                              'No comments yet. Be the first.',
                              style: TextStyle(
                                  color: QuantColors.textMuted)));
                    }
                    return ListView.builder(
                      itemCount: comments.length,
                      itemBuilder: (_, i) {
                        final c = comments[i];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor:
                                QuantColors.voidObsidian,
                            backgroundImage: c.userAvatar.isNotEmpty
                                ? NetworkImage(c.userAvatar)
                                : null,
                            child: c.userAvatar.isEmpty
                                ? Text(
                                    c.userName.isNotEmpty
                                        ? c.userName[0].toUpperCase()
                                        : '?',
                                    style: const TextStyle(
                                        color:
                                            QuantColors.textPrimary))
                                : null,
                          ),
                          title: Text(c.userName,
                              style: const TextStyle(
                                  color: QuantColors.textPrimary,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13)),
                          subtitle: Text(c.body,
                              style: const TextStyle(
                                  color: QuantColors.textPrimary)),
                          trailing: Text(storyTimeAgo(c.createdAt),
                              style: const TextStyle(
                                  color: QuantColors.textMuted,
                                  fontSize: 11)),
                        );
                      },
                    );
                  },
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _controller,
                        style: const TextStyle(
                            color: QuantColors.textPrimary),
                        decoration: InputDecoration(
                          hintText: 'Add a comment',
                          hintStyle: const TextStyle(
                              color: QuantColors.textMuted),
                          border: OutlineInputBorder(
                            borderRadius:
                                BorderRadius.circular(24),
                          ),
                          contentPadding:
                              const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 10),
                        ),
                        onSubmitted: (_) => _post(),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _posting
                        ? const SizedBox(
                            width: 28,
                            height: 28,
                            child: CircularProgressIndicator(
                                color: QuantColors.neonGreen,
                                strokeWidth: 2),
                          )
                        : IconButton(
                            tooltip: 'Post comment',
                            icon: const Icon(Icons.send_rounded,
                                color: QuantColors.neonGreen),
                            onPressed: _post,
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
}
