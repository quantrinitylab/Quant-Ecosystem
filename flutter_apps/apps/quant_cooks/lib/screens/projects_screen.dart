import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../data/cooks_repository.dart';
import '../models/cooks_models.dart';

/// Sovereign Projects & Timeline Drafts Screen for QuantCooks.
///
/// Strictly ZERO raw Unicode emojis throughout this screen.
/// Strictly ZERO Skia clipPath calls (pure 120Hz Impeller hardware acceleration).
class ProjectsScreen extends StatefulWidget {
  final ValueChanged<TimelineProject>? onOpenProject;
  final VoidCallback? onNewProject;

  const ProjectsScreen({super.key, this.onOpenProject, this.onNewProject});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  late List<TimelineProject> _projects;

  @override
  void initState() {
    super.initState();
    _projects = CooksRepository.getRecentProjects();
  }

  void _createNewProject() {
    final newProj = TimelineProject(
      id: 'proj_${DateTime.now().millisecondsSinceEpoch}',
      title: 'Untitled Sovereign 4K Timeline',
      resolution: ResolutionPreset.k4_60fps,
      aspectRatio: AspectRatioMode.vertical9x16,
      totalDurationMs: 10000,
      currentPlayheadMs: 0,
      tracks: const [],
      overlays: const [],
      lastModified: DateTime.now(),
    );

    setState(() {
      _projects.insert(0, newProj);
    });

    widget.onOpenProject?.call(newProj);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          'Created new 4K 60fps creation canvas.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Top Bar with New Project Button
            _buildTopBar(),

            // Projects List
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.all(16.0),
                physics: const BouncingScrollPhysics(),
                itemCount: _projects.length,
                itemBuilder: (context, index) {
                  final proj = _projects[index];
                  return _buildProjectCard(proj, index);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 0.8),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
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
                ),
                child: const Icon(
                  Icons.video_library_rounded,
                  color: QuantColors.voidObsidian,
                  size: 20,
                ),
              ),
              const SizedBox(width: 10),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Projects Vault',
                    style: QuantTypography.titleMedium.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    'Auto-Saved Timelines & 4K Archives',
                    style: QuantTypography.microCapsule.copyWith(
                      color: QuantColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ],
          ),

          // New Project Button
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.moltenAmber,
              foregroundColor: QuantColors.voidObsidian,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              elevation: 0,
            ),
            icon: const Icon(Icons.add_rounded, size: 18),
            label: const Text(
              'New Project',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
            ),
            onPressed: widget.onNewProject ?? _createNewProject,
          ),
        ],
      ),
    );
  }

  Widget _buildProjectCard(TimelineProject proj, int index) {
    final durationSeconds = (proj.totalDurationMs / 1000).toStringAsFixed(1);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: index == 0
              ? QuantColors.moltenAmber.withOpacity(0.5)
              : QuantColors.hairlineBorder,
          width: index == 0 ? 1.4 : 1.0,
        ),
      ),
      child: InkWell(
        onTap: () => widget.onOpenProject?.call(proj),
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Row(
            children: [
              // Aspect ratio preview container
              Container(
                width: 58,
                height: 72,
                decoration: BoxDecoration(
                  color: const Color(0xFF0D0F17),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        proj.aspectRatio.icon,
                        color: QuantColors.moltenAmber,
                        size: 22,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        proj.aspectRatio.label,
                        style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(width: 14),

              // Details
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            proj.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                        ),
                        if (index == 0)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: QuantColors.moltenAmber.withOpacity(0.18),
                              borderRadius: BorderRadius.circular(4),
                              border: Border.all(
                                color: QuantColors.moltenAmber.withOpacity(0.4),
                              ),
                            ),
                            child: const Text(
                              'ACTIVE',
                              style: TextStyle(
                                fontSize: 8,
                                fontWeight: FontWeight.w800,
                                color: QuantColors.moltenAmber,
                              ),
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Text(
                          '${durationSeconds}s',
                          style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: QuantColors.sovereignCyan,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '·',
                          style: TextStyle(color: QuantColors.textMuted),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          proj.resolution.label,
                          style: const TextStyle(
                            fontSize: 11,
                            color: QuantColors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          'Modified ${_formatTimestamp(proj.lastModified)}',
                          style: const TextStyle(
                            fontSize: 10,
                            color: QuantColors.textMuted,
                          ),
                        ),
                        const Row(
                          children: [
                            Icon(
                              Icons.cloud_done_rounded,
                              size: 12,
                              color: QuantColors.statusSuccess,
                            ),
                            SizedBox(width: 4),
                            Text(
                              'Auto-Saved',
                              style: TextStyle(
                                fontSize: 9,
                                color: QuantColors.statusSuccess,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),

              // Options Menu
              IconButton(
                icon: const Icon(Icons.more_vert_rounded, size: 20),
                color: QuantColors.textMuted,
                onPressed: () {},
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatTimestamp(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }
}
