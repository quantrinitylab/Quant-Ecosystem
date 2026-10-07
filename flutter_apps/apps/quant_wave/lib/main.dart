// Sovereign Quant Ecosystem - QuantWave Standalone Flutter Application
// Sovereign X / Twitter & Reddit Killer Text Social & Live Audio Spaces Flutter Application
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'screens/timeline_screen.dart';
import 'screens/subwaves_screen.dart';
import 'screens/wave_spaces_screen.dart';
import 'screens/games_lobby_screen.dart';
import 'screens/profile_screen.dart';

void main() {
  runApp(const QuantWaveApp());
}

class QuantWaveApp extends StatelessWidget {
  const QuantWaveApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantWave',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantWaveHomeScreen(),
    );
  }
}

class QuantWaveHomeScreen extends StatefulWidget {
  const QuantWaveHomeScreen({super.key});

  @override
  State<QuantWaveHomeScreen> createState() => _QuantWaveHomeScreenState();
}

class _QuantWaveHomeScreenState extends State<QuantWaveHomeScreen> {
  int _activeTabIndex = 0;

  final List<Widget> _screens = const [
    TimelineScreen(),
    SubWavesScreen(),
    WaveSpacesScreen(),
    GamesLobbyScreen(),
    ProfileScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar with Dynamic Island AI Live Capsule
            _buildTopCapsuleBar(),

            // Active Tab View
            Expanded(
              child: IndexedStack(
                index: _activeTabIndex,
                children: _screens,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildObsidianBottomNav(),
    );
  }

  Widget _buildTopCapsuleBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // QuantWave Brand Identity
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.sovereignCyan, QuantColors.moltenAmber],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.sovereignCyan.withOpacity(0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.waves_rounded,
                    color: Colors.white,
                    size: 20,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              RichText(
                text: const TextSpan(
                  children: [
                    TextSpan(
                      text: 'Quant',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.5,
                      ),
                    ),
                    TextSpan(
                      text: 'Wave',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.sovereignCyan,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Dynamic Island AI Live Capsule
          QuantAiCapsule(
            title: 'Quant AI Copilot',
            statusText: '<18ms AI Lens',
            beaconColor: QuantColors.sovereignCyan,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Quant AI Copilot active: Microblogging semantic triage and live spaces voice translation mesh engaged.',
                    style: TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildObsidianBottomNav() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildNavItem(0, Icons.dynamic_feed_rounded, Icons.dynamic_feed_outlined, 'Timeline'),
              _buildNavItem(1, Icons.forum_rounded, Icons.forum_outlined, 'SubWaves'),
              _buildNavItem(2, Icons.podcasts_rounded, Icons.podcasts_outlined, 'Spaces', isLiveSpace: true),
              _buildNavItem(3, Icons.sports_esports_rounded, Icons.sports_esports_outlined, 'Games'),
              _buildNavItem(4, Icons.person_rounded, Icons.person_outline_rounded, 'Profile'),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
    int index,
    IconData activeIcon,
    IconData inactiveIcon,
    String label, {
    int badgeCount = 0,
    bool isLiveSpace = false,
  }) {
    final isSelected = _activeTabIndex == index;
    final color = isSelected
        ? QuantColors.sovereignCyan
        : QuantColors.textMuted;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => setState(() => _activeTabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(
                  isSelected ? activeIcon : inactiveIcon,
                  color: color,
                  size: 24,
                ),
                if (badgeCount > 0)
                  Positioned(
                    right: -6,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: QuantColors.moltenOrange,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Center(
                        child: Text(
                          badgeCount.toString(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (isLiveSpace)
                  Positioned(
                    right: -3,
                    top: -2,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: QuantColors.crimsonRed,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.darkSlateCard, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: QuantColors.crimsonRed.withOpacity(0.8),
                            blurRadius: 4,
                            spreadRadius: 1,
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
