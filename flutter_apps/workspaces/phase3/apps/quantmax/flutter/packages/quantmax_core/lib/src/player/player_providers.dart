// ============================================================================
// quantmax_core - player Riverpod providers (W2)
// ============================================================================
//
// Cross-worker contract (naam FIXED — mat badlo):
//   - [videoPlayerPortProvider] — W3 (UI worker) isi naam se import karega.
//     Factory provider hai: har feed card apna instance banata hai aur
//     `dispose()` par release karta hai; tests fake factory de sakte hain.

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'video_player_adapter.dart';
import 'video_player_port.dart';

/// [VideoPlayerPort] instances banane wali factory.
///
/// Har feed card ko apna player instance chahiye (independent play/pause),
/// isliye ye provider instance nahi, factory deta hai:
///
/// ```dart
/// final createPlayer = ref.watch(videoPlayerPortProvider);
/// final player = createPlayer();
/// // ... use ... await player.dispose();
/// ```
///
/// Tests me fake impl: `videoPlayerPortProvider.overrideWithValue(() => FakePlayer())`.
final videoPlayerPortProvider = Provider<VideoPlayerPort Function()>(
  (ref) => VideoPlayerAdapter.new,
  name: 'videoPlayerPortProvider',
);
