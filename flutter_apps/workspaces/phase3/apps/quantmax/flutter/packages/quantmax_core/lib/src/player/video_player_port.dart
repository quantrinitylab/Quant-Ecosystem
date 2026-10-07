// ============================================================================
// quantmax_core - video player platform port (W2)
// ============================================================================
//
// Platform player ke peeche ka interface. Feed UI kabhi seedha
// `video_player` (ya koi aur package) se baat nahi karta — sirf is port se.
// Taaki:
//   - mobile (Android/iOS) par [VideoPlayerAdapter] (video_player package),
//   - desktop par koi aur impl (e.g. dart_vlc — TODO(UNVERIFIED)) swap ho sake,
//   - tests me fake player de saken.

import 'package:flutter/widgets.dart';

/// Player ka lifecycle/ready state.
enum VideoPlayerStatus {
  /// [VideoPlayerPort.initialize] abhi call nahi hua (ya fail hua nahi).
  uninitialized,

  /// Source initialize ho gayi, play ke liye ready.
  ready,

  /// Playback chal raha hai.
  playing,

  /// Pause hua hai.
  paused,

  /// Data ka wait ho raha hai (network stall etc.).
  buffering,

  /// Non-looping source ka end reach hua.
  completed,

  /// Kuch galat hua (source load fail, decode error...). Port kabhi throw
  /// nahi karta — error state stream se milti hai.
  error,
}

/// Video playback ka platform-agnostic port.
///
/// Saari methods async hain aur **kabhi throw nahi karni chahiye**
/// (initialize ke andar bhi nahi — failure `status` stream par
/// [VideoPlayerStatus.error] ban kar aani chahiye).
abstract class VideoPlayerPort {
  /// Source load karo. Pehli baar [status] uninitialized → buffering/ready.
  Future<void> initialize(Uri uri);

  /// Playback start/resume karo.
  Future<void> play();

  /// Playback pause karo.
  Future<void> pause();

  /// [position] par seek karo.
  Future<void> seekTo(Duration position);

  /// Looping on/off karo (feed me default true expected).
  Future<void> setLooping(bool looping);

  /// Volume 0.0–1.0 set karo.
  Future<void> setVolume(double volume);

  /// Player state ka broadcast stream.
  Stream<VideoPlayerStatus> get status;

  /// Current playback position ka broadcast stream.
  Stream<Duration> get position;

  /// Total duration — initialize se pehle null.
  Duration? get duration;

  /// Video render karne wala widget (full-bleed cover expect karo).
  Widget buildView(BuildContext context);

  /// Saare resources release karo: streams close, native handles free.
  Future<void> dispose();
}
