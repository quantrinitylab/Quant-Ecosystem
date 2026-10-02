// Sovereign Quant Ecosystem - QuantAI Dual Canvas Screen
// Split-screen / full-screen interactive Canvas editor with side-by-side prompt
// and artifact renderer (code, markdown, mermaid diagrams), version slider, and 1-click apply diff.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/ai_models.dart';
import '../services/ai_mock_data.dart';

class DualCanvasScreen extends StatefulWidget {
  const DualCanvasScreen({super.key});

  @override
  State<DualCanvasScreen> createState() => _DualCanvasScreenState();
}

class _DualCanvasScreenState extends State<DualCanvasScreen> {
  late List<CanvasDocument> _documents;
  late int _selectedDocIndex;
  bool _isSplitView = true;
  bool _isDiffModeActive = false;
  double _currentVersion = 3.0;
  final TextEditingController _promptController = TextEditingController(
    text: 'Refactor Impeller rendering container to strictly eliminate Skia clipPath invocations and add concentric glow borders.',
  );

  @override
  void initState() {
    super.initState();
    _documents = List.from(AiMockData.getInitialCanvasDocs());
    _selectedDocIndex = 0;
    _currentVersion = _documents[0].version.toDouble();
  }

  @override
  void dispose() {
    _promptController.dispose();
    super.dispose();
  }

  CanvasDocument get _activeDoc => _documents[_selectedDocIndex];

  void _onVersionChanged(double value) {
    setState(() {
      _currentVersion = value;
      final int targetVersion = value.round();
      final history = _activeDoc.versionHistory;
      final matched = history.firstWhere(
        (v) => v.version == targetVersion,
        orElse: () => history.last,
      );

      _documents[_selectedDocIndex] = _activeDoc.copyWith(
        version: targetVersion,
        content: matched.content,
      );
    });
  }

  void _toggleApplyDiff() {
    setState(() {
      _isDiffModeActive = !_isDiffModeActive;
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          _isDiffModeActive
              ? 'Diff highlight applied (+${_activeDoc.diffAdditions} / -${_activeDoc.diffDeletions} lines).'
              : 'Diff highlights toggled off. Normalized clean view.',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
        duration: const Duration(seconds: 2),
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
            // Top Toolbar: Document Selector, Mode Switcher, Actions
            _buildCanvasHeader(),

            // Version Slider & Diff Control Bar
            _buildVersionControlBar(),

            // Main Editor Canvas (Split View vs Full Screen)
            Expanded(
              child: _isSplitView ? _buildSplitView() : _buildArtifactViewer(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCanvasHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          // Document switcher tabs
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: List.generate(_documents.length, (index) {
                  final doc = _documents[index];
                  final isSelected = index == _selectedDocIndex;
                  return InkWell(
                    borderRadius: BorderRadius.circular(8),
                    onTap: () {
                      setState(() {
                        _selectedDocIndex = index;
                        _currentVersion = doc.version.toDouble();
                      });
                    },
                    child: Container(
                      margin: const EdgeInsets.only(right: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? QuantColors.cosmicCyan.withOpacity(0.15)
                            : QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: isSelected
                              ? QuantColors.cosmicCyan
                              : QuantColors.hairlineBorder,
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            doc.type == CanvasDocType.code
                                ? Icons.code_rounded
                                : doc.type == CanvasDocType.mermaid
                                    ? Icons.account_tree_rounded
                                    : Icons.article_rounded,
                            size: 14,
                            color: isSelected
                                ? QuantColors.cosmicCyan
                                : QuantColors.textMuted,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            doc.title,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: isSelected
                                  ? FontWeight.w700
                                  : FontWeight.w500,
                              color: isSelected
                                  ? QuantColors.textPrimary
                                  : QuantColors.textSecondary,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 4, vertical: 1),
                            decoration: BoxDecoration(
                              color: QuantColors.voidObsidian,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              'v${doc.version}',
                              style: const TextStyle(
                                fontSize: 9,
                                fontFamily: 'monospace',
                                color: QuantColors.cosmicCyan,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),

          // View Split Toggle Button
          IconButton(
            tooltip: _isSplitView ? 'Fullscreen Artifact' : 'Split View',
            icon: Icon(
              _isSplitView
                  ? Icons.fullscreen_rounded
                  : Icons.vertical_split_rounded,
              color: QuantColors.textSecondary,
              size: 20,
            ),
            onPressed: () {
              setState(() {
                _isSplitView = !_isSplitView;
              });
            },
          ),
        ],
      ),
    );
  }

  Widget _buildVersionControlBar() {
    final maxVersion = _activeDoc.versionHistory.isNotEmpty
        ? _activeDoc.versionHistory.last.version.toDouble()
        : 1.0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.elevatedCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        children: [
          // Version badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.voidObsidian,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.history_rounded,
                  size: 13,
                  color: QuantColors.obsidianPurple,
                ),
                const SizedBox(width: 4),
                Text(
                  'v${_currentVersion.round()}',
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: QuantColors.obsidianPurple,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),

          // Scrub Slider
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                activeTrackColor: QuantColors.cosmicCyan,
                inactiveTrackColor: QuantColors.hairlineBorder,
                thumbColor: QuantColors.cosmicCyan,
                overlayColor: QuantColors.cosmicCyan.withOpacity(0.2),
                trackHeight: 3,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 6),
              ),
              child: Slider(
                value: _currentVersion.clamp(1.0, maxVersion),
                min: 1.0,
                max: maxVersion > 1.0 ? maxVersion : 2.0,
                divisions: (maxVersion > 1.0 ? maxVersion - 1 : 1).round(),
                onChanged: maxVersion > 1.0 ? _onVersionChanged : null,
              ),
            ),
          ),
          const SizedBox(width: 12),

          // 1-Click Apply Diff Button
          InkWell(
            borderRadius: BorderRadius.circular(8),
            onTap: _toggleApplyDiff,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                color: _isDiffModeActive
                    ? QuantColors.emeraldMatrix.withOpacity(0.2)
                    : QuantColors.voidObsidian,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                  color: _isDiffModeActive
                      ? QuantColors.emeraldMatrix
                      : QuantColors.hairlineBorder,
                  width: 1,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    _isDiffModeActive
                        ? Icons.check_circle_rounded
                        : Icons.difference_rounded,
                    size: 13,
                    color: _isDiffModeActive
                        ? QuantColors.emeraldMatrix
                        : QuantColors.cosmicCyan,
                  ),
                  const SizedBox(width: 5),
                  Text(
                    _isDiffModeActive ? 'Diff Active' : 'Apply Diff',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: _isDiffModeActive
                          ? QuantColors.emeraldMatrix
                          : QuantColors.textPrimary,
                    ),
                  ),
                  if (_activeDoc.diffAdditions > 0) ...[
                    const SizedBox(width: 6),
                    Text(
                      '+${_activeDoc.diffAdditions}',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.emeraldMatrix,
                        fontFamily: 'monospace',
                      ),
                    ),
                    const SizedBox(width: 3),
                    Text(
                      '-${_activeDoc.diffDeletions}',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.statusError,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSplitView() {
    return LayoutBuilder(
      builder: (context, constraints) {
        // If wide enough (e.g. tablet/desktop), side-by-side. Otherwise vertical split.
        final isWide = constraints.maxWidth >= 720;

        if (isWide) {
          return Row(
            children: [
              Expanded(flex: 2, child: _buildPromptEditorPanel()),
              Container(width: 1, color: QuantColors.hairlineBorder),
              Expanded(flex: 3, child: _buildArtifactViewer()),
            ],
          );
        } else {
          return Column(
            children: [
              Expanded(flex: 2, child: _buildPromptEditorPanel()),
              Container(height: 1, color: QuantColors.hairlineBorder),
              Expanded(flex: 3, child: _buildArtifactViewer()),
            ],
          );
        }
      },
    );
  }

  Widget _buildPromptEditorPanel() {
    return Container(
      color: QuantColors.voidObsidian,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Row(
                children: [
                  Icon(
                    Icons.edit_note_rounded,
                    size: 16,
                    color: QuantColors.cosmicCyan,
                  ),
                  SizedBox(width: 6),
                  Text(
                    'PROMPT SPECIFICATION',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.6,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  'AST Real-Time',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: QuantColors.textSecondary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: TextField(
                controller: _promptController,
                maxLines: null,
                expands: true,
                style: const TextStyle(
                  fontSize: 13,
                  color: QuantColors.textPrimary,
                  height: 1.45,
                ),
                decoration: const InputDecoration(
                  hintText: 'Enter architectural instructions for canvas...',
                  hintStyle: TextStyle(color: QuantColors.textMuted),
                  border: InputBorder.none,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.cosmicCyan,
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              padding: const EdgeInsets.symmetric(vertical: 12),
            ),
            icon: const Icon(Icons.auto_fix_high_rounded, size: 16),
            label: const Text(
              'Regenerate Artifact Diff',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
            ),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'AST Diff Regenerated. New version cached in session memory.',
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

  Widget _buildArtifactViewer() {
    return Container(
      color: const Color(0xFF0C0E14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Artifact header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              border: Border(
                bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      _activeDoc.type == CanvasDocType.code
                          ? Icons.code_rounded
                          : _activeDoc.type == CanvasDocType.mermaid
                              ? Icons.schema_rounded
                              : Icons.description_rounded,
                      size: 15,
                      color: QuantColors.cosmicCyan,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      '${_activeDoc.title} (${_activeDoc.language})',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(
                        Icons.copy_rounded,
                        size: 16,
                        color: QuantColors.textSecondary,
                      ),
                      tooltip: 'Copy Artifact',
                      onPressed: () {
                        Clipboard.setData(
                            ClipboardData(text: _activeDoc.content));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            backgroundColor: QuantColors.darkSlateCard,
                            content: Text(
                              'Artifact copied to clipboard.',
                              style: TextStyle(color: QuantColors.textPrimary),
                            ),
                          ),
                        );
                      },
                    ),
                    IconButton(
                      icon: const Icon(
                        Icons.download_rounded,
                        size: 16,
                        color: QuantColors.textSecondary,
                      ),
                      tooltip: 'Download File',
                      onPressed: () {},
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Artifact Content
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _renderArtifactContent(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _renderArtifactContent() {
    switch (_activeDoc.type) {
      case CanvasDocType.mermaid:
        return _buildMermaidDiagramVisualizer(_activeDoc.content);
      case CanvasDocType.code:
        return _buildCodeRenderer(_activeDoc.content);
      case CanvasDocType.markdown:
      default:
        return _buildMarkdownRenderer(_activeDoc.content);
    }
  }

  Widget _buildCodeRenderer(String code) {
    final lines = code.split('\n');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: List.generate(lines.length, (index) {
        final lineNum = index + 1;
        final lineContent = lines[index];
        final isAdded = _isDiffModeActive && (index >= 6 && index <= 12);
        final isRemoved = _isDiffModeActive && (index == 2);

        Color? bgColor;
        if (isAdded) {
          bgColor = QuantColors.emeraldMatrix.withOpacity(0.18);
        } else if (isRemoved) {
          bgColor = QuantColors.statusError.withOpacity(0.18);
        }

        return Container(
          color: bgColor,
          padding: const EdgeInsets.symmetric(vertical: 2, horizontal: 4),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                width: 32,
                child: Text(
                  '$lineNum',
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: QuantColors.textMuted,
                  ),
                ),
              ),
              if (_isDiffModeActive)
                SizedBox(
                  width: 16,
                  child: Text(
                    isAdded
                        ? '+'
                        : isRemoved
                            ? '-'
                            : ' ',
                    style: TextStyle(
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                      color: isAdded
                          ? QuantColors.emeraldMatrix
                          : isRemoved
                              ? QuantColors.statusError
                              : QuantColors.textMuted,
                    ),
                  ),
                ),
              Expanded(
                child: SelectableText(
                  lineContent,
                  style: const TextStyle(
                    fontSize: 12,
                    fontFamily: 'monospace',
                    color: Color(0xFFF1F5F9),
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildMarkdownRenderer(String markdown) {
    final sections = markdown.split('\n\n');

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: sections.map((sec) {
        if (sec.startsWith('# ')) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              sec.replaceFirst('# ', ''),
              style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: QuantColors.textPrimary,
                letterSpacing: -0.5,
              ),
            ),
          );
        } else if (sec.startsWith('## ')) {
          return Padding(
            padding: const EdgeInsets.only(top: 10, bottom: 8),
            child: Text(
              sec.replaceFirst('## ', ''),
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: QuantColors.cosmicCyan,
              ),
            ),
          );
        } else if (sec.startsWith('- ')) {
          final bullets = sec.split('\n');
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: bullets.map((bullet) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 6, right: 8),
                        child: Icon(
                          Icons.circle,
                          size: 6,
                          color: QuantColors.cosmicCyan,
                        ),
                      ),
                      Expanded(
                        child: Text(
                          bullet.replaceFirst('- ', ''),
                          style: const TextStyle(
                            fontSize: 13,
                            color: QuantColors.textPrimary,
                            height: 1.45,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
          );
        } else {
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              sec,
              style: const TextStyle(
                fontSize: 13,
                height: 1.5,
                color: QuantColors.textSecondary,
              ),
            ),
          );
        }
      }).toList(),
    );
  }

  Widget _buildMermaidDiagramVisualizer(String diagramCode) {
    final nodes = [
      {'title': 'User Prompt', 'desc': 'Architectural Request', 'color': QuantColors.cosmicCyan},
      {'title': 'CEO Astra', 'desc': 'Tripartite Orchestrator', 'color': QuantColors.obsidianPurple},
      {'title': 'Researcher Agent', 'desc': 'Deep Web & Docs Ingestion', 'color': QuantColors.sovereignCyan},
      {'title': 'Coder Agent', 'desc': 'AST Synthesis & Zero-Mock', 'color': QuantColors.cosmicCyan},
      {'title': 'Sentinel Agent', 'desc': '100% Green Vitest Gate', 'color': QuantColors.emeraldMatrix},
      {'title': 'Deployer Agent', 'desc': 'Canary Staging Pods', 'color': QuantColors.moltenAmber},
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        const Text(
          'INTERACTIVE DAG VISUALIZATION',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: QuantColors.textMuted,
          ),
        ),
        const SizedBox(height: 16),
        ...List.generate(nodes.length, (index) {
          final node = nodes[index];
          final isLast = index == nodes.length - 1;

          return Column(
            children: [
              Container(
                width: 280,
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: (node['color'] as Color).withOpacity(0.6),
                    width: 1.5,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: (node['color'] as Color).withOpacity(0.15),
                      blurRadius: 10,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      decoration: BoxDecoration(
                        color: node['color'] as Color,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            node['title'] as String,
                            style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: QuantColors.textPrimary,
                            ),
                          ),
                          Text(
                            node['desc'] as String,
                            style: const TextStyle(
                              fontSize: 11,
                              color: QuantColors.textSecondary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              if (!isLast) ...[
                const SizedBox(height: 6),
                const Icon(
                  Icons.arrow_downward_rounded,
                  size: 18,
                  color: QuantColors.textMuted,
                ),
                const SizedBox(height: 6),
              ],
            ],
          );
        }),
      ],
    );
  }
}
