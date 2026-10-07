import 'package:flutter/material.dart';
import 'reels_player_screen.dart';

/// Sovereign Reels Screen alias and export
/// Strictly ZERO raw Unicode emojis throughout this file.
/// Strictly ZERO Skia clipPath method invocations.
export 'reels_player_screen.dart';

class ReelsScreen extends StatelessWidget {
  final VoidCallback? onDirectMessagesTap;
  final VoidCallback? onCreateTap;

  const ReelsScreen({
    super.key,
    this.onDirectMessagesTap,
    this.onCreateTap,
  });

  @override
  Widget build(BuildContext context) {
    return ReelsPlayerScreen(
      onDirectMessagesTap: onDirectMessagesTap,
      onCreateTap: onCreateTap,
    );
  }
}
