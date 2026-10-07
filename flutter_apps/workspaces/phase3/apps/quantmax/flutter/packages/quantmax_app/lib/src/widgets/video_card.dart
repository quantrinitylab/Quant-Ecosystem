// ============================================================================
// quantmax_app - VideoCard: full-bleed video page with overlays (Shift 2)
// ============================================================================
//
// Feed ka ek page: sabse neeche player view, uske upar poster/thumbnail
// (player ready hone tak), bottom scrim, caption + author handle (bottom-left),
// [ActionRail] (right), heart-burst overlay (double-tap like), aur sabse
// neeche [VideoProgressBar].
//
// Playback lifecycle:
// - `initState`: factory provider se apna [VideoPlayerPort] instance banta
//   hai (`ref.read(videoPlayerPortProvider)()` — ConsumerState me allowed);
//   `initialize(video.videoUrl)` async chalta hai; status stream par `ready`
//   aane par `_isPlayerReady = true` aur agar `isActive` to `play()`.
// - `didUpdateWidget`: `isActive` true→false = pause, false→true = play.
// - `dispose`: player + stream subscription + animation controller dispose.
//
// Like state widget-local hai (`_liked` / `_likeCount`); real like/unlike
// endpoint `app-foundations/quantmax` spec ke baad wire hoga
// (TODO(UNVERIFIED) marks).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantmax_core/quantmax_core.dart';

import 'action_rail.dart';
import 'video_progress.dart';

/// Ek full-bleed video page. [isActive] true = ye page abhi screen par hai.
class VideoCard extends ConsumerStatefulWidget {
  const VideoCard({
    super.key,
    required this.video,
    required this.isActive,
  });

  final MaxVideo video;
  final bool isActive;

  @override
  ConsumerState<VideoCard> createState() => _VideoCardState();
}

class _VideoCardState extends ConsumerState<VideoCard>
    with SingleTickerProviderStateMixin {
  late final VideoPlayerPort _player;
  StreamSubscription<VideoPlayerStatus>? _statusSubscription;
  late final AnimationController _burstController;
  late final Animation<double> _burstScale;
  late final Animation<double> _burstOpacity;

  bool _isPlayerReady = false;
  late bool _liked;
  late int _likeCount;

  @override
  void initState() {
    super.initState();
    _liked = widget.video.isLiked;
    _likeCount = widget.video.likeCount;

    // Factory provider: har card apna player instance banata hai.
    final VideoPlayerPort Function() playerFactory =
        ref.read(videoPlayerPortProvider);
    _player = playerFactory();

    _burstController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _burstScale = Tween<double>(begin: 0.3, end: 1.0).animate(
      CurvedAnimation(parent: _burstController, curve: QuantMaxCurves.easeOut),
    );
    _burstOpacity = Tween<double>(begin: 0.9, end: 0.0).animate(
      CurvedAnimation(parent: _burstController, curve: Curves.easeOut),
    );

    _statusSubscription = _player.status.listen(_onPlayerStatus);
    unawaited(_initializePlayer());
  }

  /// Player warm-up. Failures [VideoPlayerPort.status] (`error`) par surface
  /// hote hain — port contract error reporting ka owner hai, isliye yahan
  /// koi catch nahi (unhandled error zone me log hota hai, crash nahi).
  Future<void> _initializePlayer() async {
    await _player.initialize(widget.video.videoUrl);
    await _player.setLooping(true);
    await _player.setVolume(1.0);
  }

  void _onPlayerStatus(VideoPlayerStatus status) {
    if (!mounted) return;
    if (status == VideoPlayerStatus.ready && !_isPlayerReady) {
      setState(() => _isPlayerReady = true);
      if (widget.isActive) {
        unawaited(_player.play());
      }
    }
    // TODO(UNVERIFIED): player `error` status par retry affordance / error
    // reporting — app-foundations/quantmax spec ke baad.
  }

  @override
  void didUpdateWidget(covariant VideoCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isActive == widget.isActive) return;
    if (widget.isActive) {
      // Agar player abhi ready nahi hua, to _onPlayerStatus ready par
      // play() karega — yahan double-play se bachne ke liye guard.
      if (_isPlayerReady) {
        unawaited(_player.play());
      }
    } else {
      unawaited(_player.pause());
    }
  }

  @override
  void dispose() {
    _statusSubscription?.cancel();
    _burstController.dispose();
    _player.dispose();
    super.dispose();
  }

  /// Double-tap like: local toggle + heart burst. Server sync spec ke baad.
  void _toggleLike() {
    setState(() {
      _liked = !_liked;
      _likeCount += _liked ? 1 : -1;
    });
    _burstController.forward(from: 0.0);
    // TODO(UNVERIFIED): real like/unlike endpoint — app-foundations/quantmax
    // spec ke baad wire karna (endpoint name + request shape spec me confirm hoga).
  }

  void _openComments() {
    // TODO(UNVERIFIED): comments bottom sheet — app-foundations/quantmax
    // spec ke baad (endpoint + pagination contract pending).
  }

  void _shareVideo() {
    // TODO(UNVERIFIED): share sheet / deep-link — spec ke baad.
  }

  void _tipCredits() {
    // TODO(UNVERIFIED): Credits tipping (Bet 2 hook) — spec ke baad.
  }

  @override
  Widget build(BuildContext context) {
    final Uri? thumbnailUrl = widget.video.thumbnailUrl;

    return GestureDetector(
      onDoubleTap: _toggleLike,
      behavior: HitTestBehavior.opaque,
      child: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          // 1. Video surface — hamesha mounted rehta hai; poster (2) use
          // ready hone tak cover karta hai taaki black frame na dikhe.
          _player.buildView(context),

          // 2. Poster: player ready hone tak thumbnail, warna dark canvas.
          if (!_isPlayerReady && thumbnailUrl != null)
            Image.network(
              thumbnailUrl.toString(),
              fit: BoxFit.cover,
            )
          else if (!_isPlayerReady)
            const ColoredBox(color: QuantMaxColors.feedCanvas),

          // 3. Bottom scrim — caption ki legibility ke liye.
          const Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            height: 260,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: QuantMaxColors.scrimStops,
                ),
              ),
            ),
          ),

          // 4. Caption + author handle, bottom-left (action rail ke liye
          // right me jagah chhod kar).
          Positioned(
            left: 12,
            right: 88,
            bottom: 28,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  '@${widget.video.authorHandle}',
                  style: QuantMaxTextStyles.videoUsername,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 6),
                Text(
                  widget.video.caption,
                  style: QuantMaxTextStyles.videoCaption,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),

          // 5. Right action rail.
          Positioned(
            right: 8,
            bottom: 64,
            child: ActionRail(
              likeCount: _likeCount,
              commentCount: widget.video.commentCount,
              shareCount: widget.video.shareCount,
              isLiked: _liked,
              onLikeTap: _toggleLike,
              onCommentTap: _openComments,
              onShareTap: _shareVideo,
              onCreditsTap: _tipCredits,
            ),
          ),

          // 6. Heart burst overlay — double-tap feedback (300ms scale+fade).
          IgnorePointer(
            child: Center(
              child: AnimatedBuilder(
                animation: _burstController,
                builder: (BuildContext context, Widget? child) {
                  return Opacity(
                    opacity: _burstOpacity.value,
                    child: Transform.scale(
                      scale: _burstScale.value,
                      child: child,
                    ),
                  );
                },
                child: const Icon(
                  Icons.favorite,
                  size: 96,
                  color: QuantMaxColors.likeHeartBurst,
                ),
              ),
            ),
          ),

          // 7. Progress bar — sabse neeche, 3px.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: VideoProgressBar(
              positionStream: _player.position,
              duration: _isPlayerReady ? _player.duration : null,
            ),
          ),
        ],
      ),
    );
  }
}
