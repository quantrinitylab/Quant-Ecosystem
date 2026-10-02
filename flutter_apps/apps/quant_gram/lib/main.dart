import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'screens/reels_player_screen.dart';
import 'screens/explore_screen.dart';
import 'screens/create_sheet.dart';
import 'screens/inbox_screen.dart';
import 'screens/dms/dms_inbox_screen.dart';
import 'screens/profile_matrix_screen.dart';

/// Sovereign Instagram & TikTok Killer 9:16 Video Flutter Application
/// Strictly ZERO raw Unicode emojis throughout this application.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const QuantGramApp());
}

class QuantGramApp extends StatelessWidget {
  const QuantGramApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantGram',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantGramMainScreen(),
    );
  }
}

class QuantGramMainScreen extends StatefulWidget {
  const QuantGramMainScreen({super.key});

  @override
  State<QuantGramMainScreen> createState() => _QuantGramMainScreenState();
}

class _QuantGramMainScreenState extends State<QuantGramMainScreen> {
  int _currentIndex = 0;

  void _onTabTapped(int index) {
    if (index == 2) {
      // Tap on Create tab opens the camera studio fullscreen
      Navigator.of(context).push(
        MaterialPageRoute(builder: (context) => const CreateReelStudioScreen()),
      );
      return;
    }

    setState(() {
      _currentIndex = index;
    });
  }

  void _navigateToInbox() {
    setState(() {
      _currentIndex = 3;
    });
  }

  void _openCreateStudio() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (context) => const CreateReelStudioScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isReelsActive = _currentIndex == 0;

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: IndexedStack(
        index: _currentIndex == 2 ? 0 : _currentIndex,
        children: [
          ReelsPlayerScreen(
            onDirectMessagesTap: _navigateToInbox,
            onCreateTap: _openCreateStudio,
          ),
          const ExploreScreen(),
          const SizedBox.shrink(), // Placeholder for Create tab (handled via modal)
          const DmsInboxScreen(),
          const ProfileMatrixScreen(),
        ],
      ),
      bottomNavigationBar: Container(
        height: 60,
        decoration: BoxDecoration(
          color: isReelsActive ? Colors.black.withOpacity(0.9) : QuantColors.voidObsidian,
          border: const Border(
            top: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
          ),
        ),
        child: SafeArea(
          top: false,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              // 0: Reels
              _buildBottomNavItem(
                index: 0,
                icon: Icons.movie_creation_outlined,
                activeIcon: Icons.movie_creation_rounded,
                label: 'Reels',
              ),

              // 1: Explore
              _buildBottomNavItem(
                index: 1,
                icon: Icons.search_rounded,
                activeIcon: Icons.search_rounded,
                label: 'Explore',
              ),

              // 2: Create (Special Gradient Action Button)
              GestureDetector(
                onTap: () => _onTabTapped(2),
                child: Container(
                  width: 44,
                  height: 32,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    gradient: const LinearGradient(
                      colors: [
                        QuantColors.sunriseRose,
                        QuantColors.moltenAmber,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                  ),
                  child: Container(
                    margin: const EdgeInsets.all(1.5),
                    decoration: BoxDecoration(
                      color: isReelsActive ? Colors.black : QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(8.5),
                    ),
                    child: const Icon(
                      Icons.add_rounded,
                      color: Colors.white,
                      size: 22,
                    ),
                  ),
                ),
              ),

              // 3: Inbox / Direct Messages
              _buildBottomNavItem(
                index: 3,
                icon: Icons.chat_bubble_outline_rounded,
                activeIcon: Icons.chat_bubble_rounded,
                label: 'Inbox',
                hasNotificationBadge: true,
              ),

              // 4: Profile
              _buildProfileNavItem(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildBottomNavItem({
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
        width: 56,
        height: 56,
        child: Center(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Icon(
                isSelected ? activeIcon : icon,
                color: isSelected ? Colors.white : Colors.white60,
                size: 25,
              ),
              if (hasNotificationBadge && !isSelected)
                Positioned(
                  top: -2,
                  right: -3,
                  child: Container(
                    width: 7,
                    height: 7,
                    decoration: const BoxDecoration(
                      color: QuantColors.sunriseRose,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildProfileNavItem() {
    final isSelected = _currentIndex == 4;

    return GestureDetector(
      onTap: () => _onTabTapped(4),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 56,
        height: 56,
        child: Center(
          child: Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: isSelected ? QuantColors.sunriseRose : Colors.white60,
                width: isSelected ? 2 : 1.2,
              ),
              image: const DecorationImage(
                image: NetworkImage('https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150'),
                fit: BoxFit.cover,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
