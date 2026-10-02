// ============================================================================
// quantube_app - QuanTube player screen (watch page UI shell)
// ============================================================================
//
// 16:9 video surface + tap-to-toggle controls overlay + metadata header +
// action row + chapter markers + comments stub. Programs against
// [PlaybackController] from quantube_core; the engine is unimplemented, so
// every engine call is guarded — a pending engine surfaces a snackbar
// instead of faking playback. No playback endpoints are invented: the
// QuanTube playback spec does not exist yet (app-foundations/quantube).
//
// TODO(UNVERIFIED): wire the real playback spec once it exists — replace
// the stub state reads with the controller's live state stream, drop the
// engine-pending guards, and fill title/metadata/chapters/comments from
// the API.

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quantube_core/quantube_core.dart';

/// QuanTube watch page.
///
/// [videoId] is the QuanTube video identifier; stream-URL resolution is the
/// engine's job (via [PlaybackController.load]), not the UI's.
class PlayerScreen extends ConsumerWidget {
  const PlayerScreen({super.key, required this.videoId});

  final String videoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      body: SafeArea(
        top: false,
        child: Column(
          children: <Widget>[
            _VideoSurface(videoId: videoId),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    _VideoHeader(videoId: videoId),
                    const _ActionRow(),
                    const Divider(height: 1),
                    _ChapterMarkers(
                      onJumpToChapter: (Duration at) =>
                          _seekToChapter(context, ref, at),
                    ),
                    const Divider(height: 1),
                    const _CommentsStub(),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Guarded chapter seek: the pending engine surfaces a snackbar instead of
/// faking playback.
Future<void> _seekToChapter(
  BuildContext context,
  WidgetRef ref,
  Duration at,
) async {
  try {
    await ref.read(playbackControllerProvider).seekTo(at);
  } on UnimplementedError {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Playback engine pending')),
      );
    }
  }
}

/// The 16:9 video area: black surface, tap-to-toggle controls, double-tap
/// ±10s zones, auto-hiding chrome.
class _VideoSurface extends ConsumerStatefulWidget {
  const _VideoSurface({required this.videoId});

  final String videoId;

  @override
  ConsumerState<_VideoSurface> createState() => _VideoSurfaceState();
}

class _VideoSurfaceState extends ConsumerState<_VideoSurface> {
  static const Duration _controlsAutoHideDelay = Duration(seconds: 3);
  static const Duration _seekStep = Duration(seconds: 10);
  static const Duration _seekFlashDuration = Duration(milliseconds: 700);
  static const Duration _tapGuardWindow = Duration(milliseconds: 350);

  bool _controlsVisible = true;
  bool _fullscreen = false;

  /// UI-shell scrub position (0..1). The real engine replaces this with
  /// [PlaybackState.playedFraction] once it lands.
  double _scrubValue = 0;

  String? _seekFlash;
  DateTime? _ignoreTapUntil;
  Timer? _hideTimer;
  Timer? _flashTimer;

  @override
  void initState() {
    super.initState();
    _restartHideTimer();
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    _flashTimer?.cancel();
    // Restore the system UI in case the user leaves while fullscreen.
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    super.dispose();
  }

  /// Reads engine state; the unimplemented engine throws, so the shell
  /// degrades to an idle snapshot instead of crashing.
  PlaybackState _engineState() {
    try {
      return ref.read(playbackControllerProvider).state;
    } on UnimplementedError {
      return const PlaybackState(PlaybackStatus.idle);
    }
  }

  /// Runs an engine call; a pending engine surfaces an honest snackbar
  /// instead of faking playback.
  Future<void> _engineCall(
    Future<void> Function(PlaybackController controller) call,
  ) async {
    try {
      await call(ref.read(playbackControllerProvider));
    } on UnimplementedError {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Playback engine pending')),
      );
    }
  }

  void _restartHideTimer() {
    _hideTimer?.cancel();
    _hideTimer = Timer(_controlsAutoHideDelay, () {
      if (mounted) setState(() => _controlsVisible = false);
    });
  }

  void _toggleControls() {
    // A double-tap also fires a delayed single tap; ignore taps that trail
    // a seek so the chrome doesn't immediately hide again.
    final DateTime? ignoreUntil = _ignoreTapUntil;
    if (ignoreUntil != null && DateTime.now().isBefore(ignoreUntil)) return;
    setState(() => _controlsVisible = !_controlsVisible);
    _restartHideTimer();
  }

  void _seekBy(Duration delta) {
    _ignoreTapUntil = DateTime.now().add(_tapGuardWindow);
    setState(() {
      _controlsVisible = true;
      _seekFlash = delta.isNegative ? '−10s' : '+10s';
    });
    _restartHideTimer();
    _flashTimer?.cancel();
    _flashTimer = Timer(_seekFlashDuration, () {
      if (mounted) setState(() => _seekFlash = null);
    });
    // Correct intent for the future engine: absolute target, clamped at 0.
    final Duration target = _engineState().position + delta;
    _engineCall(
      (PlaybackController controller) => controller.seekTo(
        target.isNegative ? Duration.zero : target,
      ),
    );
  }

  void _togglePlayPause() {
    final PlaybackState state = _engineState();
    _restartHideTimer();
    _engineCall(
      (PlaybackController controller) =>
          state.isPlaying ? controller.pause() : controller.play(),
    );
  }

  void _onScrub(double fraction) {
    setState(() => _scrubValue = fraction.clamp(0.0, 1.0));
    _restartHideTimer();
    final PlaybackState state = _engineState();
    _engineCall(
      (PlaybackController controller) => controller.seekTo(
        Duration(
          milliseconds:
              (fraction * state.duration.inMilliseconds).round(),
        ),
      ),
    );
  }

  Future<void> _toggleFullscreen() async {
    // Engine side (pending): the real engine will own presentation mode.
    await _engineCall(
      (PlaybackController controller) => controller.toggleFullscreen(),
    );
    // System chrome is pure UI: toggle it for real.
    setState(() => _fullscreen = !_fullscreen);
    await SystemChrome.setEnabledSystemUIMode(
      _fullscreen ? SystemUiMode.immersiveSticky : SystemUiMode.edgeToEdge,
    );
  }

  /// Playhead fraction: live engine value when media is loaded, otherwise
  /// the UI-shell's local scrub position.
  double _positionFraction() {
    final PlaybackState state = _engineState();
    if (state.hasMedia) return state.playedFraction;
    return _scrubValue;
  }

  @override
  Widget build(BuildContext context) {
    final QuanTubePlayerTheme? playerTheme =
        Theme.of(context).extension<QuanTubePlayerTheme>();
    final Color canvas = playerTheme?.playerCanvas ?? Colors.black;

    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Container(
        color: canvas,
        child: Stack(
          children: <Widget>[
            // Honest engine-pending watermark, debug builds only.
            if (kDebugMode)
              Center(
                child: Text(
                  'player engine pending',
                  style: playerTheme?.textTheme.labelSmall,
                ),
              ),
            // Transient ±10s seek indicator.
            if (_seekFlash != null)
              Center(
                child: Text(
                  _seekFlash!,
                  style: playerTheme?.textTheme.titleMedium,
                ),
              ),
            // Double-tap ±10s zones (under the controls overlay).
            Row(
              children: <Widget>[
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onDoubleTap: () => _seekBy(-_seekStep),
                    child: const SizedBox.expand(),
                  ),
                ),
                Expanded(
                  child: GestureDetector(
                    behavior: HitTestBehavior.translucent,
                    onDoubleTap: () => _seekBy(_seekStep),
                    child: const SizedBox.expand(),
                  ),
                ),
              ],
            ),
            // Controls overlay: always hit-testable (so a tap re-shows the
            // chrome), visually fading via AnimatedOpacity. Buttons inside
            // still win the gesture arena on direct taps.
            _ControlsOverlay(
              visible: _controlsVisible,
              state: _engineState(),
              positionFraction: _positionFraction(),
              onToggleControls: _toggleControls,
              onTogglePlayPause: _togglePlayPause,
              onScrub: _onScrub,
              onFullscreen: _toggleFullscreen,
            ),
          ],
        ),
      ),
    );
  }
}

/// Player chrome: top bar (back / fullscreen), center play-pause, bottom
/// scrub bar with timecodes. Fades in/out; tap anywhere on the surface
/// toggles visibility.
class _ControlsOverlay extends StatelessWidget {
  const _ControlsOverlay({
    required this.visible,
    required this.state,
    required this.positionFraction,
    required this.onToggleControls,
    required this.onTogglePlayPause,
    required this.onScrub,
    required this.onFullscreen,
  });

  final bool visible;
  final PlaybackState state;
  final double positionFraction;
  final VoidCallback onToggleControls;
  final VoidCallback onTogglePlayPause;
  final ValueChanged<double> onScrub;
  final VoidCallback onFullscreen;

  @override
  Widget build(BuildContext context) {
    final QuanTubePlayerTheme playerTheme =
        Theme.of(context).extension<QuanTubePlayerTheme>()!;
    final Color controls = playerTheme.controls;
    final Color scrim = playerTheme.scrim;

    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onTap: onToggleControls,
      child: AnimatedOpacity(
        opacity: visible ? 1.0 : 0.0,
        duration: const Duration(milliseconds: 200),
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: <Color>[
                scrim,
                scrim.withValues(alpha: 0),
                scrim.withValues(alpha: 0),
                scrim,
              ],
              stops: const <double>[0.0, 0.25, 0.7, 1.0],
            ),
          ),
          child: Column(
            children: <Widget>[
              // Top bar.
              Row(
                children: <Widget>[
                  IconButton(
                    icon: Icon(Icons.arrow_back, color: controls),
                    tooltip: 'Back',
                    onPressed: () => Navigator.of(context).maybePop(),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: Icon(Icons.fullscreen, color: controls),
                    tooltip: 'Fullscreen',
                    onPressed: onFullscreen,
                  ),
                ],
              ),
              // Center play / pause / busy.
              Expanded(
                child: Center(
                  child: state.isBusy
                      ? CircularProgressIndicator(color: controls)
                      : IconButton(
                          iconSize: 56,
                          icon: Icon(
                            state.isPlaying
                                ? Icons.pause_circle_filled
                                : Icons.play_circle_filled,
                            color: controls,
                          ),
                          tooltip: state.isPlaying ? 'Pause' : 'Play',
                          onPressed: onTogglePlayPause,
                        ),
                ),
              ),
              // Bottom scrub bar.
              _ScrubBar(
                state: state,
                fraction: positionFraction,
                onScrub: onScrub,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Scrub bar: timecodes + slider with a buffered-portion indicator stub
/// behind the track.
class _ScrubBar extends StatelessWidget {
  const _ScrubBar({
    required this.state,
    required this.fraction,
    required this.onScrub,
  });

  final PlaybackState state;
  final double fraction;
  final ValueChanged<double> onScrub;

  @override
  Widget build(BuildContext context) {
    final QuanTubePlayerTheme playerTheme =
        Theme.of(context).extension<QuanTubePlayerTheme>()!;
    final Color controls = playerTheme.controls;
    final TextStyle? timecode = playerTheme.textTheme.bodySmall;

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 0, 8, 4),
      child: Row(
        children: <Widget>[
          SizedBox(
            width: 48,
            child: Text(
              _formatDuration(state.position),
              style: timecode,
              textAlign: TextAlign.center,
            ),
          ),
          Expanded(
            child: SizedBox(
              height: 28,
              child: Stack(
                alignment: Alignment.center,
                children: <Widget>[
                  // Buffered indicator stub: sits behind the slider track.
                  // TODO(UNVERIFIED): real buffered ranges come from the
                  // engine's PlaybackState once the spec lands.
                  Container(
                    height: 3,
                    color: controls.withValues(alpha: 0.25),
                    child: FractionallySizedBox(
                      widthFactor: state.bufferedFraction,
                      alignment: Alignment.centerLeft,
                      child: Container(
                        color: controls.withValues(alpha: 0.55),
                      ),
                    ),
                  ),
                  Slider(
                    value: fraction.clamp(0.0, 1.0),
                    onChanged: onScrub,
                  ),
                ],
              ),
            ),
          ),
          SizedBox(
            width: 48,
            child: Text(
              _formatDuration(state.duration),
              style: timecode,
              textAlign: TextAlign.center,
            ),
          ),
        ],
      ),
    );
  }
}

/// Title + description header.
///
/// TODO(UNVERIFIED): replace with real metadata (title, channel, views,
/// published date) from the QuanTube playback spec — nothing is invented.
class _VideoHeader extends StatelessWidget {
  const _VideoHeader({required this.videoId});

  final String videoId;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'Video $videoId',
            style: textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          Text(
            'Title, channel and stats land with the playback spec.',
            style: textTheme.bodySmall
                ?.copyWith(color: scheme.onSurfaceVariant),
          ),
        ],
      ),
    );
  }
}

/// Engagement + download actions. No fake counts, no fake toggles: every
/// onPressed is a TODO until the spec exists.
class _ActionRow extends StatelessWidget {
  const _ActionRow();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: <Widget>[
          _PlayerAction(icon: Icons.thumb_up_outlined, label: 'Like'),
          _PlayerAction(icon: Icons.thumb_down_outlined, label: 'Dislike'),
          _PlayerAction(icon: Icons.share_outlined, label: 'Share'),
          _PlayerAction(icon: Icons.bookmark_add_outlined, label: 'Save'),
          _PlayerAction(icon: Icons.download_outlined, label: 'Download'),
        ],
      ),
    );
  }
}

class _PlayerAction extends StatelessWidget {
  const _PlayerAction({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        IconButton(
          icon: Icon(icon),
          tooltip: label,
          onPressed: () {
            // TODO(UNVERIFIED): wire to the QuanTube engagement/downloads
            // spec (app-foundations/quantube) — no fake logic here.
          },
        ),
        Text(label, style: Theme.of(context).textTheme.labelSmall),
      ],
    );
  }
}

/// Static stub chapter data — chapters come from the spec, not invented.
///
/// TODO(UNVERIFIED): replace with real chapter markers from the QuanTube
/// playback spec (app-foundations/quantube).
const List<(String, Duration)> _stubChapters = <(String, Duration)>[
  ('Intro', Duration.zero),
  ('Deep dive', Duration(minutes: 2)),
  ('Outro', Duration(minutes: 8)),
];

/// Chapter markers row (static stub data until the spec exists).
class _ChapterMarkers extends StatelessWidget {
  const _ChapterMarkers({required this.onJumpToChapter});

  final ValueChanged<Duration> onJumpToChapter;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text('Chapters', style: textTheme.titleSmall),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: _stubChapters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (BuildContext context, int index) {
                final (String label, Duration at) = _stubChapters[index];
                return ActionChip(
                  label: Text('$label · ${_formatDuration(at)}'),
                  onPressed: () => onJumpToChapter(at),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Text(
              'Stub chapters — real markers come with the playback spec.',
              style: textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// Comments section placeholder stub.
class _CommentsStub extends StatelessWidget {
  const _CommentsStub();

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text('Comments', style: textTheme.titleSmall),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerHigh,
              borderRadius: const BorderRadius.all(Radius.circular(12)),
            ),
            // TODO(UNVERIFIED): comments thread UI lands with the QuanTube
            // playback spec (app-foundations/quantube).
            child: Text(
              'Comments load with the playback spec.',
              style: textTheme.bodySmall
                  ?.copyWith(color: scheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// Formats a duration as m:ss.
String _formatDuration(Duration duration) {
  final int totalSeconds = duration.inSeconds;
  final int minutes = totalSeconds ~/ 60;
  final int seconds = totalSeconds % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}
