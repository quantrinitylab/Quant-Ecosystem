// ============================================================================
// quantmax_core - video_player package adapter (W2)
// ============================================================================
//
// [VideoPlayerPort] ka default implementation, `video_player` package ke
// [VideoPlayerController] par based.
//
// - Mobile (Android/iOS) PRIMARY — video_player wahan first-class hai.
// - Desktop par video_player ka platform support limited hai;
//   TODO(UNVERIFIED): desktop impl (e.g. dart_vlc-based) spec/design ke baad.
// - Kabhi throw nahi karta (initialize ke bahar to bilkul nahi); failures
//   `status` stream par [VideoPlayerStatus.error] ban kar aate hain.

import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:video_player/video_player.dart';

import 'video_player_port.dart';

/// `video_player` package par based [VideoPlayerPort] implementation.
class VideoPlayerAdapter implements VideoPlayerPort {
  /// Creates an uninitialized adapter. [initialize] call karna zaroori hai.
  VideoPlayerAdapter();

  VideoPlayerController? _controller;
  final StreamController<VideoPlayerStatus> _statusController =
      StreamController<VideoPlayerStatus>.broadcast();
  final StreamController<Duration> _positionController =
      StreamController<Duration>.broadcast();
  Timer? _positionTimer;
  VideoPlayerStatus _currentStatus = VideoPlayerStatus.uninitialized;
  bool _disposed = false;

  @override
  Future<void> initialize(Uri uri) async {
    if (_disposed) return;
    final controller = VideoPlayerController.networkUrl(uri);
    _controller = controller;
    controller.addListener(_onControllerUpdate);
    _emitStatus(VideoPlayerStatus.buffering);
    try {
      await controller.initialize();
      if (_disposed) return;
      await controller.setLooping(true);
      _emitStatus(VideoPlayerStatus.ready);
      _startPositionTimer();
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Future<void> play() async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.play();
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Future<void> pause() async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.pause();
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Future<void> seekTo(Duration position) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.seekTo(position);
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Future<void> setLooping(bool looping) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.setLooping(looping);
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Future<void> setVolume(double volume) async {
    final controller = _controller;
    if (controller == null || _disposed) return;
    try {
      await controller.setVolume(volume.clamp(0.0, 1.0));
    } catch (_) {
      _emitStatus(VideoPlayerStatus.error);
    }
  }

  @override
  Stream<VideoPlayerStatus> get status => _statusController.stream;

  @override
  Stream<Duration> get position => _positionController.stream;

  @override
  Duration? get duration {
    final controller = _controller;
    if (controller == null) return null;
    final value = controller.value;
    if (!value.isInitialized) return null;
    return value.duration;
  }

  /// Full-bleed cover pattern: native aspect ke saath `BoxFit.cover`, taaki
  /// video feed card ko bina letterbox ke bhare. Size unknown ho (initialize
  /// se pehle) to 9:16 [AspectRatio] fallback.
  @override
  Widget buildView(BuildContext context) {
    final controller = _controller;
    if (controller == null) {
      return const SizedBox.shrink();
    }
    if (!controller.value.isInitialized) {
      return AspectRatio(
        aspectRatio: 9 / 16,
        child: VideoPlayer(controller),
      );
    }
    final size = controller.value.size;
    if (size == Size.zero) {
      return AspectRatio(
        aspectRatio: 9 / 16,
        child: VideoPlayer(controller),
      );
    }
    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        width: size.width,
        height: size.height,
        child: VideoPlayer(controller),
      ),
    );
  }

  @override
  Future<void> dispose() async {
    _disposed = true;
    _positionTimer?.cancel();
    _positionTimer = null;
    final controller = _controller;
    _controller = null;
    if (controller != null) {
      controller.removeListener(_onControllerUpdate);
      await controller.dispose();
    }
    await _statusController.close();
    await _positionController.close();
  }

  void _onControllerUpdate() {
    final controller = _controller;
    if (controller == null || _disposed) return;
    final value = controller.value;
    if (value.hasError) {
      _emitStatus(VideoPlayerStatus.error);
      return;
    }
    if (!value.isInitialized) {
      _emitStatus(VideoPlayerStatus.buffering);
      return;
    }
    if (value.isBuffering) {
      _emitStatus(VideoPlayerStatus.buffering);
      return;
    }
    if (value.isPlaying) {
      _emitStatus(VideoPlayerStatus.playing);
      return;
    }
    final duration = value.duration;
    if (duration != Duration.zero &&
        value.position >= duration &&
        !controller.value.isLooping) {
      _emitStatus(VideoPlayerStatus.completed);
      return;
    }
    _emitStatus(VideoPlayerStatus.paused);
  }

  void _startPositionTimer() {
    _positionTimer?.cancel();
    // 250ms cadence: progress bar/scrubber ke liye kaafi, 60fps scroll ko
    // touch nahi karta (position updates widget tree ko spam nahi karte).
    _positionTimer = Timer.periodic(const Duration(milliseconds: 250), (_) {
      final controller = _controller;
      if (controller == null || _disposed || _positionController.isClosed) {
        return;
      }
      if (controller.value.isInitialized) {
        _positionController.add(controller.value.position);
      }
    });
  }

  void _emitStatus(VideoPlayerStatus next) {
    if (_disposed || _statusController.isClosed) return;
    if (next == _currentStatus) return;
    _currentStatus = next;
    _statusController.add(next);
  }
}
