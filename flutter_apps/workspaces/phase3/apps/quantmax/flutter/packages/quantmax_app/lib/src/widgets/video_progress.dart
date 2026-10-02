// ============================================================================
// quantmax_app - VideoProgressBar: thin bottom playback progress (Shift 2)
// ============================================================================
//
// Player ke `position` stream + `duration` se 3px ki bottom progress bar.
// `StreamBuilder` har position tick par sirf isi widget ko rebuild karta hai
// (poora VideoCard nahi) — 60fps feed ke liye zaroori isolation.

import 'package:flutter/material.dart';
import 'package:quantmax_core/quantmax_core.dart';

/// Thin (3px) playback progress bar pinned to the bottom of a [VideoCard].
///
/// [duration] null ho (player abhi ready nahi) to bar zero par rehta hai.
class VideoProgressBar extends StatelessWidget {
  const VideoProgressBar({
    super.key,
    required this.positionStream,
    required this.duration,
  });

  final Stream<Duration> positionStream;
  final Duration? duration;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Duration>(
      stream: positionStream,
      initialData: Duration.zero,
      builder: (BuildContext context, AsyncSnapshot<Duration> snapshot) {
        final Duration position = snapshot.data ?? Duration.zero;
        final Duration? total = duration;
        double progress = 0.0;
        if (total != null && total.inMilliseconds > 0) {
          progress =
              (position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0);
        }
        return LinearProgressIndicator(
          value: progress,
          minHeight: 3,
          backgroundColor: QuantMaxColors.progressTrackOnVideo,
          valueColor: const AlwaysStoppedAnimation<Color>(
            QuantMaxColors.primary500,
          ),
        );
      },
    );
  }
}
