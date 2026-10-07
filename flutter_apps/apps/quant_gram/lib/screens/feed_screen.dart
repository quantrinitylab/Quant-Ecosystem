import 'package:flutter/material.dart';
import 'reels_player_screen.dart';
import 'stories_tray.dart';

/// Sovereign Feed Screen integrating 24h Stories Tray and 9:16 Reels Stream
/// Strictly ZERO raw Unicode emojis throughout this file.
/// Strictly ZERO Skia clipPath method invocations.
export 'stories_tray.dart';

class FeedScreen extends StatelessWidget {
  final VoidCallback? onDirectMessagesTap;
  final VoidCallback? onCreateTap;

  const FeedScreen({
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
