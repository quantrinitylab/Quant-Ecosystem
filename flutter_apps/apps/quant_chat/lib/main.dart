// Sovereign Quant Ecosystem - QuantChat Standalone Flutter Application
// Sovereign E2EE WhatsApp & Signal Killer Flutter Application for Quant Ecosystem.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'screens/chat_list_screen.dart';
import 'screens/calls_tab_screen.dart';
import 'screens/audio_space_screen.dart';
import 'screens/settings_screen.dart';

void main() {
  runApp(const QuantChatApp());
}

class QuantChatApp extends StatelessWidget {
  const QuantChatApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantChat',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantChatHomeScreen(),
    );
  }
}

class QuantChatHomeScreen extends StatefulWidget {
  const QuantChatHomeScreen({super.key});

  @override
  State<QuantChatHomeScreen> createState() => _QuantChatHomeScreenState();
}

class _QuantChatHomeScreenState extends State<QuantChatHomeScreen> {
  int _activeTabIndex = 0;

  final List<Widget> _screens = const [
    ChatListScreen(),
    CallsTabScreen(),
    AudioSpaceScreen(),
    SettingsScreen(),
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
          // QuantChat Brand Identity
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.neonGreen, Color(0xFF10B981)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.neonGreen.withOpacity(0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.chat_bubble_rounded,
                    color: Colors.white,
                    size: 18,
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
                      text: 'Chat',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.neonGreen,
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
            statusText: '<24ms E2EE',
            beaconColor: QuantColors.neonGreen,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'Quant AI Copilot active: Real-time translation & summarization mesh engaged.',
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
              _buildNavItem(0, Icons.chat_bubble_rounded, Icons.chat_bubble_outline_rounded, 'Chats', badgeCount: 4),
              _buildNavItem(1, Icons.phone_in_talk_rounded, Icons.phone_outlined, 'Calls', badgeCount: 1),
              _buildNavItem(2, Icons.radio_button_checked_rounded, Icons.radio_button_off_rounded, 'Spaces', isLiveSpace: true),
              _buildNavItem(3, Icons.settings_rounded, Icons.settings_outlined, 'Settings'),
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
        ? QuantColors.neonGreen
        : QuantColors.textMuted;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => setState(() => _activeTabIndex = index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
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
                        color: QuantColors.statusError,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.darkSlateCard, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: QuantColors.statusError.withOpacity(0.8),
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
