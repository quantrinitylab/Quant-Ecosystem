import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import 'data/cooks_repository.dart';
import 'models/cooks_models.dart';
import 'screens/ai_tools_screen.dart';
import 'screens/assets_library_screen.dart';
import 'screens/export_sheet.dart';
import 'screens/preview_monitor_screen.dart';
import 'screens/projects_screen.dart';
import 'screens/templates_screen.dart';
import 'screens/timeline_editor_screen.dart';

/// Sovereign CapCut & Figma Killer AI Creation Studio Flutter Application
///
/// Hardware-accelerated Skia & Impeller UI components, 120Hz smooth scrubbing,
/// multi-track video/audio timeline, aspect ratio switchable preview monitor,
/// and instant 4K 60fps hardware export.
///
/// Strictly ZERO raw Unicode emojis throughout this application.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const QuantCooksApp());
}

class QuantCooksApp extends StatelessWidget {
  const QuantCooksApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'QuantCooks',
      debugShowCheckedModeBanner: false,
      theme: QuantTheme.obsidianDarkTheme.copyWith(
        primaryColor: QuantColors.moltenAmber,
        colorScheme: QuantTheme.obsidianDarkTheme.colorScheme.copyWith(
          primary: QuantColors.moltenAmber,
          secondary: QuantColors.sovereignCyan,
        ),
      ),
      home: const QuantCooksHomeScreen(),
    );
  }
}

class QuantCooksHomeScreen extends StatefulWidget {
  const QuantCooksHomeScreen({super.key});

  @override
  State<QuantCooksHomeScreen> createState() => _QuantCooksHomeScreenState();
}

class _QuantCooksHomeScreenState extends State<QuantCooksHomeScreen> {
  int _currentTabIndex = 0; // 0: Studio, 1: Templates, 2: AI Tools, 3: Assets, 4: Projects
  late TimelineProject _project;
  bool _isPlaying = false;
  Timer? _playbackTimer;

  @override
  void initState() {
    super.initState();
    _project = CooksRepository.getDefaultProject();
  }

  @override
  void dispose() {
    _playbackTimer?.cancel();
    super.dispose();
  }

  void _togglePlayPause() {
    setState(() {
      _isPlaying = !_isPlaying;
    });

    if (_isPlaying) {
      _playbackTimer?.cancel();
      // Tick every ~33ms (approx 30fps) for smooth playhead advancement
      _playbackTimer = Timer.periodic(const Duration(milliseconds: 33), (timer) {
        if (!mounted) {
          timer.cancel();
          return;
        }
        setState(() {
          int nextMs = _project.currentPlayheadMs + 33;
          if (nextMs >= _project.totalDurationMs) {
            nextMs = 0; // Loop playback
          }
          _project = _project.copyWith(currentPlayheadMs: nextMs);
        });
      });
    } else {
      _playbackTimer?.cancel();
    }
  }

  void _seekToMs(int newPlayheadMs) {
    setState(() {
      _project = _project.copyWith(
        currentPlayheadMs: newPlayheadMs.clamp(0, _project.totalDurationMs),
      );
    });
  }

  void _changeAspectRatio(AspectRatioMode newAspect) {
    setState(() {
      _project = _project.copyWith(aspectRatio: newAspect);
    });
  }

  void _onSplitClipAtPlayhead() {
    final playhead = _project.currentPlayheadMs;
    // Find active clip intersecting playhead on Video track
    bool splitDone = false;
    final updatedTracks = _project.tracks.map((track) {
      if (track.type != TrackType.video) return track;

      final updatedClips = <TimelineClip>[];
      for (final clip in track.clips) {
        final clipStart = clip.startTimeMs;
        final clipEnd = clip.startTimeMs + clip.effectiveDurationMs;

        if (playhead > clipStart + 200 && playhead < clipEnd - 200 && !splitDone) {
          // Split clip into two
          final firstDuration = playhead - clipStart;
          final secondDuration = clip.durationMs - firstDuration;

          final firstClip = clip.copyWith(
            id: '${clip.id}_part1',
            name: '${clip.name} (Part 1)',
            durationMs: firstDuration,
          );

          final secondClip = clip.copyWith(
            id: '${clip.id}_part2',
            name: '${clip.name} (Part 2)',
            startTimeMs: playhead,
            durationMs: secondDuration,
          );

          updatedClips.add(firstClip);
          updatedClips.add(secondClip);
          splitDone = true;
        } else {
          updatedClips.add(clip);
        }
      }
      return track.copyWith(clips: updatedClips);
    }).toList();

    if (splitDone) {
      setState(() {
        _project = _project.copyWith(tracks: updatedTracks);
      });
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text(
            'Blade Split executed at playhead position.',
            style: TextStyle(color: QuantColors.textPrimary),
          ),
          duration: Duration(seconds: 1),
        ),
      );
    }
  }

  void _onClipTrimmed(String trackId, String clipId, int trimStart, int trimEnd) {
    final updatedTracks = _project.tracks.map((track) {
      if (track.id != trackId) return track;
      final updatedClips = track.clips.map((clip) {
        if (clip.id != clipId) return clip;
        return clip.copyWith(trimStartMs: trimStart, trimEndMs: trimEnd);
      }).toList();
      return track.copyWith(clips: updatedClips);
    }).toList();

    setState(() {
      _project = _project.copyWith(tracks: updatedTracks);
    });
  }

  void _onOverlayPositionUpdated(String id, double x, double y) {
    final updatedOverlays = _project.overlays.map((ov) {
      if (ov.id != id) return ov;
      return ov.copyWith(normalizedX: x, normalizedY: y);
    }).toList();

    setState(() {
      _project = _project.copyWith(overlays: updatedOverlays);
    });
  }

  void _openExportSheet() {
    _playbackTimer?.cancel();
    setState(() => _isPlaying = false);
    ExportSheet.show(context, _project);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      bottomNavigationBar: _buildBottomNavigationBar(),
      body: SafeArea(
        child: IndexedStack(
          index: _currentTabIndex,
          children: [
            // Tab 0: Studio Editor (Split Preview Monitor + Scrubber)
            _buildStudioEditorTab(),

            // Tab 1: Viral Templates
            TemplatesScreen(
              onSelectTemplate: (tmpl) {
                setState(() {
                  _currentTabIndex = 0; // Switch to studio
                });
              },
            ),

            // Tab 2: AI Creation Tools
            AiToolsScreen(
              onApplyToolResult: (toolTitle) {
                setState(() {
                  _currentTabIndex = 0; // Return to studio
                });
              },
            ),

            // Tab 3: Asset Vault
            AssetsLibraryScreen(
              onImportAsset: (assetName, type) {
                setState(() {
                  _currentTabIndex = 0; // Return to studio
                });
              },
            ),

            // Tab 4: Projects Vault
            ProjectsScreen(
              onOpenProject: (proj) {
                setState(() {
                  _project = proj;
                  _currentTabIndex = 0; // Switch to studio
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStudioEditorTab() {
    return Column(
      children: [
        // Top App Bar with Branding & 4K 60fps Export Resolution Pill
        _buildStudioTopBar(),

        // Split Editor Canvas: Preview Monitor (Top) + Timeline Scrubber (Bottom)
        Expanded(
          flex: 48,
          child: PreviewMonitorScreen(
            project: _project,
            isPlaying: _isPlaying,
            onTogglePlayPause: _togglePlayPause,
            onSeekToMs: _seekToMs,
            onAspectRatioChanged: _changeAspectRatio,
            onUpdateOverlayPosition: _onOverlayPositionUpdated,
          ),
        ),

        // Multi-Track Timeline Scrubber
        Expanded(
          flex: 52,
          child: TimelineEditorScreen(
            project: _project,
            onSeekToMs: _seekToMs,
            onClipTrimmed: _onClipTrimmed,
            onSplitClipAtPlayhead: _onSplitClipAtPlayhead,
          ),
        ),
      ],
    );
  }

  Widget _buildStudioTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          // App Title & Studio Badge
          Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [QuantColors.moltenAmber, QuantColors.sunsetGold],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.moltenAmber.withOpacity(0.3),
                      blurRadius: 10,
                      spreadRadius: 1,
                    ),
                  ],
                ),
                child: const Icon(
                  Icons.movie_creation_rounded,
                  color: QuantColors.voidObsidian,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    children: [
                      Text(
                        'QuantCooks',
                        style: QuantTypography.titleMedium.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const QuantBadge(
                        label: 'AI STUDIO',
                        variant: QuantBadgeVariant.amber,
                      ),
                    ],
                  ),
                  Text(
                    'Sovereign CapCut & Figma Killer',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // Right Toolbar: Cloud Autosave & Top 4K 60fps Export Resolution Pill
          Row(
            children: [
              // Cloud Autosave Pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.cloud_done_rounded,
                      size: 13,
                      color: QuantColors.statusSuccess,
                    ),
                    SizedBox(width: 4),
                    Text(
                      '2.1ms',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.statusSuccess,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),

              // Top Export Resolution Pill (4K 60fps / 1080p)
              InkWell(
                onTap: _openExportSheet,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [QuantColors.moltenAmber, QuantColors.sunsetGold],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: QuantColors.moltenAmber.withOpacity(0.35),
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.output_rounded,
                        color: QuantColors.voidObsidian,
                        size: 15,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        _project.resolution.label,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: QuantColors.voidObsidian,
                          letterSpacing: 0.2,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNavigationBar() {
    return Container(
      height: 60,
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
            // 0: Studio
            _buildNavItem(
              index: 0,
              label: 'Studio',
              icon: Icons.movie_creation_outlined,
              activeIcon: Icons.movie_creation_rounded,
            ),

            // 1: Templates
            _buildNavItem(
              index: 1,
              label: 'Templates',
              icon: Icons.auto_fix_high_outlined,
              activeIcon: Icons.auto_fix_high_rounded,
            ),

            // 2: AI Tools (Special Center Glow)
            _buildAiToolsNavItem(),

            // 3: Assets
            _buildNavItem(
              index: 3,
              label: 'Assets',
              icon: Icons.folder_special_outlined,
              activeIcon: Icons.folder_special_rounded,
            ),

            // 4: Projects
            _buildNavItem(
              index: 4,
              label: 'Projects',
              icon: Icons.video_library_outlined,
              activeIcon: Icons.video_library_rounded,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildNavItem({
    required int index,
    required String label,
    required IconData icon,
    required IconData activeIcon,
  }) {
    final isSelected = _currentTabIndex == index;

    return GestureDetector(
      onTap: () => setState(() => _currentTabIndex = index),
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 58,
        height: 56,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              isSelected ? activeIcon : icon,
              color: isSelected ? QuantColors.moltenAmber : QuantColors.textMuted,
              size: 22,
            ),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w500,
                color: isSelected ? QuantColors.moltenAmber : QuantColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAiToolsNavItem() {
    final isSelected = _currentTabIndex == 2;

    return GestureDetector(
      onTap: () => setState(() => _currentTabIndex = 2),
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 44,
            height: 30,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(
                colors: [QuantColors.obsidianPurple, QuantColors.sovereignCyan],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: QuantColors.obsidianPurple.withOpacity(0.4),
                        blurRadius: 8,
                        spreadRadius: 1,
                      ),
                    ]
                  : null,
            ),
            child: const Icon(
              Icons.auto_awesome_rounded,
              color: Colors.white,
              size: 18,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            'AI Tools',
            style: TextStyle(
              fontSize: 10,
              fontWeight: isSelected ? FontWeight.w800 : FontWeight.w600,
              color: isSelected ? QuantColors.sovereignCyan : QuantColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
