// ============================================================================
// quantube_core - playback controller contract (QuanTube player UI shell)
// ============================================================================
//
// The player screen UI (quantube_app) programs against this abstract
// interface. The real engine (video_player-backed) lands AFTER the QuanTube
// playback spec is written (app-foundations/quantube); until then
// [playbackControllerProvider] hands out [UnimplementedPlaybackController],
// whose members throw [UnimplementedError] with an actionable message.
// No fake playback state is invented anywhere — that is the honest stub.
//
// TODO(UNVERIFIED): swap the provider's factory for the real
// video_player-backed implementation once the playback spec exists. The
// interface below is the contract the real engine must satisfy.

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Discrete lifecycle states of the playback engine.
enum PlaybackStatus {
  /// Nothing loaded yet.
  idle,

  /// Resolving the stream / manifest for a video.
  loading,

  /// Actively rendering frames.
  playing,

  /// Loaded and halted at a position (user or auto pause).
  paused,

  /// Stalled waiting for buffered data; resumes automatically.
  buffering,

  /// Terminal failure; [PlaybackState.errorMessage] carries the reason.
  error,
}

/// Immutable snapshot of the player at one moment in time.
///
/// Value class with positional constructors (QA F1 lesson: positional ctors
/// survive refactors that would otherwise rename named arguments).
@immutable
final class PlaybackState {
  /// Creates a state snapshot. Only [status] is required; everything else
  /// defaults to the idle/zero value so call sites stay terse.
  const PlaybackState(
    this.status, [
    this.position = Duration.zero,
    this.duration = Duration.zero,
    this.buffered = Duration.zero,
    this.speed = 1.0,
    this.errorMessage,
  ]) : assert(speed > 0, 'playback speed must be positive');

  /// Idle: nothing loaded.
  const PlaybackState.idle() : this(PlaybackStatus.idle);

  /// Loading: resolving the stream for a video.
  const PlaybackState.loading() : this(PlaybackStatus.loading);

  /// The engine's lifecycle state.
  final PlaybackStatus status;

  /// Current playhead position.
  final Duration position;

  /// Total media duration (zero when unknown).
  final Duration duration;

  /// How far ahead the buffer has filled (zero when unknown).
  final Duration buffered;

  /// Playback rate multiplier (1.0 = normal speed).
  final double speed;

  /// Human-readable failure reason; only set when [status] is
  /// [PlaybackStatus.error].
  final String? errorMessage;

  /// True while frames are being rendered.
  bool get isPlaying => status == PlaybackStatus.playing;

  /// True while the engine is working but not rendering (loading/buffering).
  bool get isBusy =>
      status == PlaybackStatus.loading || status == PlaybackStatus.buffering;

  /// True once media is loaded and seekable (paused or playing).
  bool get hasMedia =>
      status == PlaybackStatus.playing || status == PlaybackStatus.paused;

  /// Fraction of the media buffered, clamped to 0..1 (0 when unknown).
  double get bufferedFraction {
    if (duration <= Duration.zero) return 0;
    return (buffered.inMilliseconds / duration.inMilliseconds).clamp(0.0, 1.0);
  }

  /// Fraction of the media played, clamped to 0..1 (0 when unknown).
  double get playedFraction {
    if (duration <= Duration.zero) return 0;
    return (position.inMilliseconds / duration.inMilliseconds).clamp(0.0, 1.0);
  }

  /// Copies this snapshot, overriding the given fields.
  PlaybackState copyWith({
    PlaybackStatus? status,
    Duration? position,
    Duration? duration,
    Duration? buffered,
    double? speed,
    String? Function()? errorMessage,
  }) {
    return PlaybackState(
      status ?? this.status,
      position ?? this.position,
      duration ?? this.duration,
      buffered ?? this.buffered,
      speed ?? this.speed,
      errorMessage == null ? this.errorMessage : errorMessage(),
    );
  }

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        (other is PlaybackState &&
            other.status == status &&
            other.position == position &&
            other.duration == duration &&
            other.buffered == buffered &&
            other.speed == speed &&
            other.errorMessage == errorMessage);
  }

  @override
  int get hashCode => Object.hash(
        status,
        position,
        duration,
        buffered,
        speed,
        errorMessage,
      );

  @override
  String toString() =>
      'PlaybackState($status, pos: $position, dur: $duration, '
      'buf: $buffered, speed: ${speed}x'
      '${errorMessage == null ? '' : ', error: $errorMessage'})';
}

/// Playback engine contract for the QuanTube player UI.
///
/// Implementations own the media pipeline (stream resolution, decoding,
/// buffering, fullscreen presentation). The UI shell only ever talks to
/// this interface — never to a concrete player package.
abstract class PlaybackController {
  /// Latest known state snapshot. Never null; idle until [load] resolves.
  PlaybackState get state;

  /// Broadcast stream of state snapshots; emits on every transition.
  Stream<PlaybackState> get stateStream;

  /// Loads the media for [videoId]. Resolves through loading → paused
  /// (ready) or → error. [videoId] is the QuanTube video identifier;
  /// stream-URL resolution is the engine's job, not the UI's.
  ///
  /// TODO(UNVERIFIED): stream-URL / manifest endpoint shapes come from the
  /// QuanTube playback spec (app-foundations/quantube) — no endpoint is
  /// invented here.
  Future<void> load(String videoId);

  /// Starts (or resumes) rendering.
  Future<void> play();

  /// Halts rendering, keeping the loaded position.
  Future<void> pause();

  /// Moves the playhead to [position] (clamped by the engine).
  Future<void> seekTo(Duration position);

  /// Sets the playback rate multiplier (1.0 = normal).
  Future<void> setSpeed(double speed);

  /// Toggles fullscreen presentation of the video surface.
  Future<void> toggleFullscreen();

  /// Releases engine resources.
  void dispose();
}

/// Honest stub: every member throws [UnimplementedError] with an actionable
/// message instead of faking playback.
///
/// This is deliberate, not a placeholder bug: the QuanTube playback spec
/// does not exist yet, so there is no real engine to back. UI code MUST
/// guard engine calls (try/catch on [UnimplementedError]) and surface the
/// pending state to the user rather than pretending playback works.
final class UnimplementedPlaybackController implements PlaybackController {
  static Never _unimplemented(String member) => throw UnimplementedError(
        'PlaybackController.$member is not implemented: the QuanTube '
        'playback engine is pending (TODO(UNVERIFIED) — no playback spec '
        'yet; the real implementation will use the video_player package).',
      );

  @override
  PlaybackState get state => _unimplemented('state');

  @override
  Stream<PlaybackState> get stateStream => _unimplemented('stateStream');

  @override
  Future<void> load(String videoId) => _unimplemented('load');

  @override
  Future<void> play() => _unimplemented('play');

  @override
  Future<void> pause() => _unimplemented('pause');

  @override
  Future<void> seekTo(Duration position) => _unimplemented('seekTo');

  @override
  Future<void> setSpeed(double speed) => _unimplemented('setSpeed');

  @override
  Future<void> toggleFullscreen() => _unimplemented('toggleFullscreen');

  @override
  void dispose() {
    // Nothing to release: there is no engine behind this stub.
  }
}

/// Factory provider for the playback engine.
///
/// Currently hands out [UnimplementedPlaybackController] — the honest stub.
/// UI code reads engine state through this provider and MUST NOT assume a
/// real engine (guard with try/catch on [UnimplementedError]).
///
/// TODO(UNVERIFIED): return the real video_player-backed controller once the
/// QuanTube playback spec exists (app-foundations/quantube). The provider
/// name and the [PlaybackController] type stay unchanged, so the player UI
/// needs no edits at swap time.
final playbackControllerProvider = Provider<PlaybackController>(
  (Ref ref) {
    final PlaybackController controller = UnimplementedPlaybackController();
    ref.onDispose(controller.dispose);
    return controller;
  },
  name: 'playbackControllerProvider',
);
