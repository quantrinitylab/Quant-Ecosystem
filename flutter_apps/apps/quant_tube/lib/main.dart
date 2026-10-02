import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'screens/video_feed_screen.dart';
import 'screens/music_player_screen.dart';
import 'screens/channel_studio_screen.dart';
import 'screens/subscriptions_screen.dart';
import 'screens/library_screen.dart';

/// Sovereign YouTube & Spotify Killer Segment-Skipping Video & Music Flutter Application
/// Strictly ZERO raw Unicode emojis throughout this application.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const QuantTubeApp());
}

class QuantTubeApp extends StatelessWidget {
  const QuantTubeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuanTube',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantTubeMainScreen(),
    );
  }
}

class QuantTubeMainScreen extends StatefulWidget {
  const QuantTubeMainScreen({super.key});

  @override
  State<QuantTubeMainScreen> createState() => _QuantTubeMainScreenState();
}

class _QuantTubeMainScreenState extends State<QuantTubeMainScreen> {
  int _currentIndex = 0;

  void _onTabTapped(int index) {
    setState(() {
      _currentIndex = index;
    });
  }

  void _openSearch() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sovereign Sub-5ms Video & Audio Search')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: _currentIndex == 1 // Music player has its own immersive header
          ? null
          : _buildTopBarWithAiCapsule(),
      body: IndexedStack(
        index: _currentIndex,
        children: const [
          VideoFeedScreen(),
          MusicPlayerScreen(),
          ChannelStudioScreen(),
          SubscriptionsScreen(),
          LibraryScreen(),
        ],
      ),
      bottomNavigationBar: _buildBottomNavigationBar(),
    );
  }

  PreferredSizeWidget _buildTopBarWithAiCapsule() {
    return AppBar(
      backgroundColor: QuantColors.voidObsidian,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      titleSpacing: 16,
      title: Row(
        children: [
          // QuanTube Brand Logo & Name
          Container(
            padding: const EdgeInsets.all(6),
            decoration: BoxDecoration(
              color: QuantColors.crimsonRed,
              borderRadius: BorderRadius.circular(8),
              boxShadow: [
                BoxShadow(
                  color: QuantColors.crimsonRed.withOpacity(0.4),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: const Icon(
              Icons.play_arrow_rounded,
              color: Colors.white,
              size: 18,
            ),
          ),
          const SizedBox(width: 8),
          const Text(
            'QuanTube',
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
              color: QuantColors.textPrimary,
            ),
          ),
          const Spacer(),

          // Dynamic Island AI Live Capsule
          QuantAiCapsule(
            title: 'QuanTube AI',
            statusText: 'Ad-Free • 120Hz',
            beaconColor: QuantColors.crimsonRed,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text('QuanTube AI Copilot: SponsorBlock Active • Impeller 120Hz Accelerated'),
                ),
              );
            },
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.cast_rounded, color: Colors.white, size: 20),
          onPressed: () {},
          tooltip: 'Cast Sovereign Stream',
        ),
        IconButton(
          icon: const Icon(Icons.search_rounded, color: Colors.white, size: 22),
          onPressed: _openSearch,
          tooltip: 'Search Videos & Music',
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildBottomNavigationBar() {
    return Container(
      height: 62,
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            // 0: Home Feed
            _buildNavItem(
              index: 0,
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: 'Home',
            ),

            // 1: Music Player
            _buildNavItem(
              index: 1,
              icon: Icons.music_note_outlined,
              activeIcon: Icons.music_note_rounded,
              label: 'Music',
            ),

            // 2: Create / Studio (Center Crimson Red Action Button)
            GestureDetector(
              onTap: () => _onTabTapped(2),
              behavior: HitTestBehavior.opaque,
              child: Container(
                width: 44,
                height: 34,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                  gradient: const LinearGradient(
                    colors: [
                      QuantColors.crimsonRed,
                      QuantColors.moltenAmber,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.crimsonRed.withOpacity(0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Container(
                  margin: const EdgeInsets.all(1.5),
                  decoration: BoxDecoration(
                    color: _currentIndex == 2 ? QuantColors.crimsonRed : QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(8.5),
                  ),
                  child: const Icon(
                    Icons.add_rounded,
                    color: Colors.white,
                    size: 24,
                  ),
                ),
              ),
            ),

            // 3: Subscriptions
            _buildNavItem(
              index: 3,
              icon: Icons.subscriptions_outlined,
              activeIcon: Icons.subscriptions_rounded,
              label: 'Subscriptions',
              hasNotificationBadge: true,
            ),

            // 4: Library
            _buildNavItem(
              index: 4,
              icon: Icons.video_library_outlined,
              activeIcon: Icons.video_library_rounded,
              label: 'Library',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required IconData icon,
    required IconData activeIcon,
    required String label,
    bool hasNotificationBadge = false,
  }) {
    final isSelected = _currentIndex == index;

    return GestureDetector(
      onTap: () => _onTabTapped(index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 60,
        height: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isSelected ? activeIcon : icon,
                  color: isSelected ? QuantColors.crimsonRed : Colors.white60,
                  size: 24,
                ),
                if (hasNotificationBadge && !isSelected)
                  Positioned(
                    top: -2,
                    right: -2,
                    child: Container(
                      width: 6,
                      height: 6,
                      decoration: const BoxDecoration(
                        color: QuantColors.crimsonRed,
                        shape: BoxShape.circle,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? QuantColors.crimsonRed : Colors.white60,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
