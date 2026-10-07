// Sovereign Quant Ecosystem - QuantAI Standalone Flutter Application
// Sovereign ChatGPT & Claude Killer Agent OS & 3D Voice Orb Flutter Application for Quant Ecosystem.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import 'models/ai_models.dart';
import 'screens/ai_chat_screen.dart';
import 'screens/dual_canvas_screen.dart';
import 'screens/voice_orb_screen.dart';
import 'screens/agent_swarm_screen.dart';
import 'screens/history_screen.dart';

void main() {
  runApp(const QuantAiApp());
}

class QuantAiApp extends StatelessWidget {
  const QuantAiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantAI',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme,
      home: const QuantAiHomeScreen(),
    );
  }
}

class QuantAiHomeScreen extends StatefulWidget {
  const QuantAiHomeScreen({super.key});

  @override
  State<QuantAiHomeScreen> createState() => _QuantAiHomeScreenState();
}

class _QuantAiHomeScreenState extends State<QuantAiHomeScreen> {
  int _activeTabIndex = 0;
  AiModel _selectedModel = AiModel.quant1Pro;

  void _navigateToTab(int index) {
    setState(() {
      _activeTabIndex = index;
    });
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      AiChatScreen(
        currentModel: _selectedModel,
        onSwitchToCanvas: () => _navigateToTab(1),
        onSwitchToVoice: () => _navigateToTab(2),
      ),
      const DualCanvasScreen(),
      const VoiceOrbScreen(),
      const AgentSwarmScreen(),
      HistoryScreen(
        onSelectThread: (_) => _navigateToTab(0),
      ),
    ];

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top App Bar with Model Selector and Sovereign Telemetry Capsule
            _buildTopAppBar(),

            // Active Tab View
            Expanded(
              child: IndexedStack(
                index: _activeTabIndex,
                children: screens,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: _buildObsidianBottomNav(),
    );
  }

  Widget _buildTopAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // QuantAI Brand Logo & Typography
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.cosmicCyan, Color(0xFF0284C7)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.cosmicCyan.withOpacity(0.35),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.psychology_rounded,
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
                      text: 'AI',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: QuantColors.cosmicCyan,
                        letterSpacing: -0.5,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // Top Model Selector Pill & Dropdown
          _buildModelSelector(),

          // Telemetry Capsule
          QuantAiCapsule(
            title: 'Sovereign LLM',
            statusText: _selectedModel.latencyBadge,
            beaconColor: _selectedModel.badgeColor,
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    '${_selectedModel.name} Active: ${_selectedModel.provider} | Context: ${_selectedModel.contextWindow}',
                    style: const TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildModelSelector() {
    return PopupMenuButton<AiModel>(
      tooltip: 'Select AI Model',
      color: QuantColors.darkSlateCard,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      initialValue: _selectedModel,
      onSelected: (model) {
        setState(() {
          _selectedModel = model;
        });
      },
      itemBuilder: (context) {
        return AiModel.availableModels.map((model) {
          final isSelected = model.id == _selectedModel.id;
          return PopupMenuItem<AiModel>(
            value: model,
            child: Row(
              children: [
                Icon(
                  model.icon,
                  size: 16,
                  color: model.badgeColor,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        model.name,
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight:
                              isSelected ? FontWeight.w700 : FontWeight.w500,
                          color: isSelected
                              ? QuantColors.cosmicCyan
                              : QuantColors.textPrimary,
                        ),
                      ),
                      Text(
                        '${model.contextWindow} | ${model.latencyBadge}',
                        style: const TextStyle(
                          fontSize: 10,
                          color: QuantColors.textMuted,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
                if (isSelected)
                  const Icon(
                    Icons.check_rounded,
                    size: 16,
                    color: QuantColors.cosmicCyan,
                  ),
              ],
            ),
          );
        }).toList();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _selectedModel.icon,
              size: 14,
              color: _selectedModel.badgeColor,
            ),
            const SizedBox(width: 6),
            Text(
              _selectedModel.name,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QuantColors.textPrimary,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 16,
              color: QuantColors.textMuted,
            ),
          ],
        ),
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
              _buildNavItem(0, Icons.chat_rounded, Icons.chat_outlined, 'Chat'),
              _buildNavItem(1, Icons.dashboard_customize_rounded, Icons.dashboard_customize_outlined, 'Canvas'),
              _buildNavItem(2, Icons.graphic_eq_rounded, Icons.graphic_eq_outlined, 'Voice', isVoiceTab: true),
              _buildNavItem(3, Icons.hub_rounded, Icons.hub_outlined, 'Agents', badgeCount: 4),
              _buildNavItem(4, Icons.history_rounded, Icons.history_toggle_off_rounded, 'History'),
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
    bool isVoiceTab = false,
  }) {
    final isSelected = _activeTabIndex == index;
    final color = isSelected
        ? QuantColors.cosmicCyan
        : QuantColors.textMuted;

    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => _navigateToTab(index),
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
                        color: QuantColors.cosmicCyan,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      child: Center(
                        child: Text(
                          badgeCount.toString(),
                          style: const TextStyle(
                            color: Colors.black,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ),
                  ),
                if (isVoiceTab && isSelected)
                  Positioned(
                    right: -3,
                    top: -2,
                    child: Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        color: QuantColors.statusSuccess,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.darkSlateCard, width: 1.5),
                        boxShadow: [
                          BoxShadow(
                            color: QuantColors.statusSuccess.withOpacity(0.8),
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
