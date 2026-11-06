// QuantChat friend story viewer (Phase 2C).
//
// Full-screen media with segmented progress, edge-tap advance/rewind,
// and a reply composer addressed to the story author. Abstract interaction
// pattern only -- original Quant design (obsidian dark, labelled tools).
//
// Per-segment view tracking: POST /stories/:id/view fires when a segment
// starts (idempotent server-side). Replies go through
// POST /stories/:id/reply, which the server delivers as a real direct
// message -- the composer here only collects the text.
//
// Screenshot handling: detection + author notice only (never prevention).
// TODO-SECURITY: wire platform screenshot callbacks to
// _onScreenshotDetected; there is currently no story screenshot-notify
// endpoint, so the hook is parked, not faked.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:video_player/video_player.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';

class StoryViewerScreen extends StatefulWidget {
  final StoryService service;
  final List<StoryGroup> groups;
  final String initialGroupId;

  const StoryViewerScreen({
    super.key,
    required this.service,
    required this.groups,
    required this.initialGroupId,
  });

  @override
  State<StoryViewerScreen> createState() => _StoryViewerScreenState();
}

class _StoryViewerScreenState extends State<StoryViewerScreen>
    with SingleTickerProviderStateMixin {
  late int _groupIndex;
  late int _segmentIndex;
  AnimationController? _progress;
  VideoPlayerController? _video;
  bool _muted = false;
  bool _paused = false;
  bool _replyOpen = false;
  final TextEditingController _replyController = TextEditingController();
  bool _sendingReply = false;

  StoryGroup get _group => widget.groups[_groupIndex];
  StorySegment get _segment => _group.segments[_segmentIndex];

  @override
  void initState() {
    super.initState();
    _groupIndex = widget.groups.indexWhere((g) => g.userId == widget.initialGroupId);
    if (_groupIndex < 0) _groupIndex = 0;
    _segmentIndex = _group.startIndex;
    _startSegment();
  }

  @override
  void dispose() {
    _progress?.dispose();
    _video?.dispose();
    _replyController.dispose();
    super.dispose();
  }

  Future<void> _startSegment() async {
    _progress?.dispose();
    await _video?.dispose();
    _video = null;
    final segment = _segment;

    // Per-segment view tracking (fire and forget; idempotent server-side).
    if (!_group.isOwn) {
      unawaited(widget.service.markViewed(segment.id).then((count) {
        if (!mounted) return;
        setState(() {
          final groups = widget.groups;
          final g = groups[_groupIndex];
          final segs = List<StorySegment>.from(g.segments);
          segs[_segmentIndex] =
              segs[_segmentIndex].copyWith(isViewed: true, viewCount: count);
          groups[_groupIndex] = StoryGroup(
            userId: g.userId,
            userName: g.userName,
            userAvatar: g.userAvatar,
            segments: segs,
            hasUnviewed: segs.any((s) => !s.isViewed),
            isOwn: g.isOwn,
            isFriend: g.isFriend,
            isFollowing: g.isFollowing,
          );
        });
      }).catchError((_) {}));
    }

    if (segment.type == StoryMediaType.video &&
        segment.mediaUrl != null &&
        segment.mediaUrl!.isNotEmpty) {
      final controller =
          VideoPlayerController.networkUrl(Uri.parse(segment.mediaUrl!));
      _video = controller;
      try {
        await controller.initialize();
        await controller.setLooping(false);
        await controller.setVolume(_muted ? 0 : 1);
        if (mounted) setState(() {});
        _runProgress(controller.value.duration);
        await controller.play();
      } catch (_) {
        // Unplayable video: fall back to a timed still frame.
        _runProgress(const Duration(seconds: 5));
      }
    } else {
      _runProgress(Duration(seconds: segment.durationSec.clamp(1, 120)));
    }
  }

  void _runProgress(Duration duration) {
    _progress?.dispose();
    _progress = AnimationController(vsync: this, duration: duration)
      ..addStatusListener((status) {
        if (status == AnimationStatus.completed) _nextSegment();
      });
    if (mounted) setState(() {});
    if (!_paused) _progress!.forward();
  }

  void _nextSegment() {
    if (_segmentIndex + 1 < _group.segments.length) {
      setState(() => _segmentIndex++);
      _startSegment();
    } else if (_groupIndex + 1 < widget.groups.length) {
      setState(() {
        _groupIndex++;
        _segmentIndex = widget.groups[_groupIndex].startIndex;
      });
      _startSegment();
    } else {
      Navigator.of(context).maybePop();
    }
  }

  void _prevSegment() {
    if (_segmentIndex > 0) {
      setState(() => _segmentIndex--);
      _startSegment();
    } else if (_groupIndex > 0) {
      setState(() {
        _groupIndex--;
        _segmentIndex = 0;
      });
      _startSegment();
    } else {
      _startSegment(); // restart first segment
    }
  }

  void _setPaused(bool paused) {
    setState(() => _paused = paused);
    if (paused) {
      _progress?.stop();
      _video?.pause();
    } else {
      _progress?.forward();
      _video?.play();
    }
  }

  void _toggleMute() {
    setState(() => _muted = !_muted);
    _video?.setVolume(_muted ? 0 : 1);
  }

  // TODO-SECURITY: screenshot detection + author notice only (never
  // prevention). Wire the platform screenshot callback here and, once the
  // backend exposes a story screenshot-notify endpoint, report it. Until
  // then this stays a parked hook -- no fake "screenshot blocked" UI.
  void _onScreenshotDetected() {}

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(message,
            style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  Future<void> _sendReply() async {
    final text = _replyController.text.trim();
    if (text.isEmpty || _sendingReply) return;
    setState(() => _sendingReply = true);
    try {
      await widget.service.replyToStory(_segment.id, text);
      if (!mounted) return;
      _replyController.clear();
      setState(() {
        _sendingReply = false;
        _replyOpen = false;
      });
      _showSnack('Reply sent to ${_segment.authorName}');
      _setPaused(false);
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() => _sendingReply = false);
      _showSnack('Reply failed: ${e.message}');
    }
  }

  void _openOverflowMenu() {
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_group.isOwn)
              ListTile(
                leading: const Icon(Icons.visibility_rounded,
                    color: QuantColors.textPrimary),
                title: const Text('Viewers',
                    style: TextStyle(color: QuantColors.textPrimary)),
                subtitle: Text('${_segment.viewCount} views',
                    style: const TextStyle(color: QuantColors.textMuted)),
                onTap: () {
                  Navigator.of(context).pop();
                  _showViewers();
                },
              ),
            ListTile(
              leading: const Icon(Icons.link_rounded,
                  color: QuantColors.textPrimary),
              title: const Text('Copy story link',
                  style: TextStyle(color: QuantColors.textPrimary)),
              onTap: () {
                Navigator.of(context).pop();
                Clipboard.setData(ClipboardData(
                    text:
                        'https://quantchat.quantrinity.in/stories/${_segment.id}'));
                _showSnack('Story link copied');
              },
            ),
            if (_group.isOwn)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded,
                    color: QuantColors.statusError),
                title: const Text('Delete story',
                    style: TextStyle(color: QuantColors.statusError)),
                onTap: () {
                  Navigator.of(context).pop();
                  _deleteStory();
                },
              ),
            ListTile(
              leading: const Icon(Icons.close_rounded,
                  color: QuantColors.textPrimary),
              title: const Text('Close',
                  style: TextStyle(color: QuantColors.textPrimary)),
              onTap: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _showViewers() async {
    late List<StoryViewerEntry> viewers;
    try {
      viewers = await widget.service.getViewers(_segment.id);
    } on StoryApiException catch (e) {
      _showSnack('Could not load viewers: ${e.message}');
      return;
    }
    if (!mounted) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text('Viewers',
                  style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w800,
                      fontSize: 16)),
            ),
            Flexible(
              child: viewers.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No views yet.',
                          style: TextStyle(color: QuantColors.textMuted)),
                    )
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: viewers.length,
                      itemBuilder: (_, i) {
                        final v = viewers[i];
                        return ListTile(
                          leading: CircleAvatar(
                            backgroundColor: QuantColors.voidObsidian,
                            backgroundImage: v.avatar.isNotEmpty
                                ? NetworkImage(v.avatar)
                                : null,
                            child: v.avatar.isEmpty
                                ? Text(v.name.isNotEmpty ? v.name[0].toUpperCase() : '?',
                                    style: const TextStyle(
                                        color: QuantColors.textPrimary))
                                : null,
                          ),
                          title: Text(v.name,
                              style: const TextStyle(
                                  color: QuantColors.textPrimary)),
                          subtitle: Text(storyTimeAgo(v.viewedAt),
                              style: const TextStyle(
                                  color: QuantColors.textMuted)),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _deleteStory() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        title: const Text('Delete story?',
            style: TextStyle(color: QuantColors.textPrimary)),
        content: const Text(
            'This removes the story for everyone. This cannot be undone.',
            style: TextStyle(color: QuantColors.textMuted)),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete',
                style: TextStyle(color: QuantColors.statusError)),
          ),
        ],
      ),
    );
    if (confirm != true) return;
    try {
      await widget.service.deleteStory(_segment.id);
      if (!mounted) return;
      _showSnack('Story deleted');
      Navigator.of(context).maybePop();
    } on StoryApiException catch (e) {
      _showSnack('Delete failed: ${e.message}');
    }
  }

  @override
  Widget build(BuildContext context) {
    final segment = _segment;
    return Scaffold(
      backgroundColor: Colors.black,
      body: GestureDetector(
        onLongPressStart: (_) => _setPaused(true),
        onLongPressEnd: (_) => _setPaused(false),
        child: Stack(
          fit: StackFit.expand,
          children: [
            _buildMedia(segment),
            // Edge tap zones: left third rewinds, rest advances.
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onTap: _prevSegment,
                    child: const SizedBox.expand(),
                  ),
                ),
                Expanded(
                  flex: 7,
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onTap: _nextSegment,
                    child: const SizedBox.expand(),
                  ),
                ),
              ],
            ),
            _buildTopOverlay(segment),
            _buildBottomOverlay(segment),
            if (_replyOpen) _buildReplySheet(),
          ],
        ),
      ),
    );
  }

  Widget _buildMedia(StorySegment segment) {
    if (segment.type == StoryMediaType.text) {
      return Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF123B2A), Color(0xFF07120D)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        padding: const EdgeInsets.symmetric(horizontal: 32),
        child: Center(
          child: Text(
            segment.text ?? '',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 26,
              fontWeight: FontWeight.w800,
              height: 1.35,
            ),
          ),
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
    if (segment.mediaUrl != null && segment.mediaUrl!.isNotEmpty) {
      return Image.network(
        segment.mediaUrl!,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => const Center(
          child: Icon(Icons.broken_image_rounded,
              color: QuantColors.textMuted, size: 48),
        ),
      );
    }
    return const Center(
      child:
          Icon(Icons.image_rounded, color: QuantColors.textMuted, size: 48),
    );
  }

  Widget _buildTopOverlay(StorySegment segment) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
          child: Column(
            children: [
              // Segment progress bars.
              Row(
                children: List.generate(_group.segments.length, (i) {
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 2),
                      child: _buildProgressBar(i),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: QuantColors.darkSlateCard,
                    backgroundImage: segment.authorAvatar.isNotEmpty
                        ? NetworkImage(segment.authorAvatar)
                        : null,
                    child: segment.authorAvatar.isEmpty
                        ? Text(
                            segment.authorName.isNotEmpty
                                ? segment.authorName[0].toUpperCase()
                                : '?',
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800))
                        : null,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _group.isOwn ? 'My Story' : segment.authorName,
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w700,
                              fontSize: 14),
                        ),
                        Text(
                          [
                            storyTimeAgo(segment.createdAt),
                            if (segment.name != null && segment.name!.isNotEmpty)
                              segment.name!,
                            if (segment.placeName != null &&
                                segment.placeName!.isNotEmpty)
                              segment.placeName!,
                          ].join('  -  '),
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  if (segment.type == StoryMediaType.video)
                    IconButton(
                      tooltip: _muted ? 'Unmute' : 'Mute',
                      icon: Icon(
                        _muted
                            ? Icons.volume_off_rounded
                            : Icons.volume_up_rounded,
                        color: Colors.white,
                      ),
                      onPressed: _toggleMute,
                    ),
                  IconButton(
                    tooltip: 'More options',
                    icon: const Icon(Icons.more_horiz_rounded,
                        color: Colors.white),
                    onPressed: _openOverflowMenu,
                  ),
                  IconButton(
                    tooltip: 'Close viewer',
                    icon: const Icon(Icons.close_rounded,
                        color: Colors.white),
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

  Widget _buildProgressBar(int index) {
    if (index < _segmentIndex) return _progressBarFill(1.0);
    if (index > _segmentIndex) return _progressBarFill(0.0);
    final progress = _progress;
    if (progress == null) return _progressBarFill(0.0);
    // AnimatedBuilder subscribes to the controller so the bar animates.
    return AnimatedBuilder(
      animation: progress,
      builder: (_, __) => _progressBarFill(progress.value),
    );
  }

  Widget _progressBarFill(double value) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(2),
      child: LinearProgressIndicator(
        value: value,
        backgroundColor: Colors.white30,
        valueColor: const AlwaysStoppedAnimation(Colors.white),
        minHeight: 3,
      ),
    );
  }

  Widget _buildBottomOverlay(StorySegment segment) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: Row(
            children: [
              // Camera quick-reply (labelled). Opens capture addressed to
              // the author once the camera tab lands; until then it is an
              // honest no-op notice, not a dead button.
              IconButton(
                tooltip: 'Reply with a snap',
                icon: const Icon(Icons.photo_camera_rounded,
                    color: Colors.white, size: 28),
                onPressed: () => _showSnack(
                    'Snap replies arrive with the camera update.'),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: GestureDetector(
                  onTap: () {
                    setState(() => _replyOpen = true);
                    _setPaused(true);
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.white70),
                      color: Colors.black45,
                    ),
                    child: const Text(
                      'Send a chat',
                      style: TextStyle(color: Colors.white70, fontSize: 14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                tooltip: 'Send reply',
                icon: const Icon(Icons.send_rounded,
                    color: Colors.white, size: 26),
                onPressed: () {
                  setState(() => _replyOpen = true);
                  _setPaused(true);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildReplySheet() {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        color: Colors.black87,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        child: SafeArea(
          top: false,
          child: Row(
            children: [
              IconButton(
                tooltip: 'Close reply',
                icon: const Icon(Icons.close_rounded, color: Colors.white),
                onPressed: () {
                  setState(() => _replyOpen = false);
                  _setPaused(false);
                },
              ),
              Expanded(
                child: TextField(
                  controller: _replyController,
                  autofocus: true,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Reply to ${_segment.authorName}',
                    hintStyle: const TextStyle(color: Colors.white54),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                      borderSide: const BorderSide(color: Colors.white30),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 10),
                  ),
                  onSubmitted: (_) => _sendReply(),
                ),
              ),
              const SizedBox(width: 4),
              _sendingReply
                  ? const SizedBox(
                      width: 28,
                      height: 28,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : IconButton(
                      tooltip: 'Send reply',
                      icon: const Icon(Icons.send_rounded,
                          color: QuantColors.neonGreen, size: 26),
                      onPressed: _sendReply,
                    ),
            ],
          ),
        ),
      ),
    );
  }
}
