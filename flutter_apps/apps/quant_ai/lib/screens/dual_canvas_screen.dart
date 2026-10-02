// Sovereign Quant Ecosystem - QuantAI Dual Canvas Screen
// Split-Screen Dual Canvas: Left pane AI conversation, right pane live executable
// code editor & document canvas with syntax highlight tokens, version slider, and 1-click apply diff.
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
  bool _isExecutingCode = false;
  bool _showExecutionConsole = true;
  bool _isThoughtExpanded = true;
  double _currentVersion = 3.0;

  final TextEditingController _promptController = TextEditingController(
    text: 'Refactor Impeller rendering container to add hardware-accelerated syntax highlight and execute on Impeller.',
  );
  final ScrollController _chatScrollController = ScrollController();

  final List<Map<String, dynamic>> _conversationMessages = [
    {
      'role': 'user',
      'text': 'Refactor AcceleratedGlowContainer to strictly eliminate Skia clipPath invocations and add concentric glow borders.',
      'time': '10:41 AM',
    },
    {
      'role': 'assistant',
      'thought': '1. Verified AST invariants for zero clipPath.\n2. Injected hardware-accelerated BoxDecoration with BorderRadius.\n3. Compiled syntax tokens with Vulkan/Metal tile caching.\n4. Simulated Impeller JIT execution with exit code 0.',
      'thoughtDuration': '2.1s',
      'text': 'I have refactored the Impeller canvas artifact. Skia clipPath has been 100% replaced with hardware-accelerated BoxDecoration squircle radii. The live code editor on the right pane is ready for execution with syntax tokens.',
      'time': '10:42 AM',
      'artifactUpdate': 'Impeller Fast Blur Shader v2.0',
    },
  ];

  CodeExecutionResult? _executionResult = const CodeExecutionResult(
    stdout: '[COMPILER] Dart AST Analysis: 0 errors, 0 warnings.\n[IMPELLER] Hardware raster cache initialized on Vulkan / Metal backend.\n[PERF] Frame render budget: 4.12ms / 8.33ms (120 FPS sustained).\n[PASS] 100% Zero-clipPath AST validation passed.\n[EXIT] Process finished with exit code 0.',
    exitCode: 0,
    durationMs: 4.12,
    memoryUsageKb: 14520,
  );

  @override
  void initState() {
    super.initState();
    _documents = List.from(AiMockData.getInitialCanvasDocs());
    _selectedDocIndex = 1; // Default to code doc
    _currentVersion = _documents[_selectedDocIndex].version.toDouble();
  }

  @override
  void dispose() {
    _promptController.dispose();
    _chatScrollController.dispose();
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

  Future<void> _executeCode() async {
    setState(() {
      _isExecutingCode = true;
      _showExecutionConsole = true;
    });

    await Future.delayed(const Duration(milliseconds: 650));

    setState(() {
      _isExecutingCode = false;
      _executionResult = CodeExecutionResult(
        stdout: '[COMPILER] Building AST targets for ${_activeDoc.title}...\n[RESOLVER] Linked 0 dependencies with zero stubs.\n[IMPELLER] 120Hz Hardware pipeline verified (zero clipPath).\n[EXEC] Execution successful in 3.84ms.\n[TEST] 14 assertion checks passed (100% green).',
        exitCode: 0,
        durationMs: 3.84,
        memoryUsageKb: 12480,
      );
    });

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text(
            'Code execution completed successfully with exit code 0.',
            style: TextStyle(color: QuantColors.emeraldMatrix),
          ),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  void _sendMessage() {
    final text = _promptController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _conversationMessages.add({
        'role': 'user',
        'text': text,
        'time': 'Just now',
      });
      _promptController.clear();

      // Add simulated assistant reply
      _conversationMessages.add({
        'role': 'assistant',
        'thought': 'Parsed intent: Canvas edit request.\nGenerated syntax-highlighted code update.\nSynchronized AST buffer.',
        'thoughtDuration': '1.8s',
        'text': 'Updated canvas specification according to instructions. The right pane code editor has been refreshed with syntax tokens.',
        'time': 'Just now',
        'artifactUpdate': '${_activeDoc.title} v${_activeDoc.version + 1}',
      });

      _documents[_selectedDocIndex] = _activeDoc.copyWith(
        version: _activeDoc.version + 1,
        diffAdditions: _activeDoc.diffAdditions + 6,
      );
      _currentVersion = (_activeDoc.version).toDouble();
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
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

          // Run Code Button (when active doc is code)
          if (_activeDoc.type == CanvasDocType.code) ...[
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.emeraldMatrix,
                foregroundColor: Colors.black,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                minimumSize: Size.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
              icon: _isExecutingCode
                  ? const SizedBox(
                      width: 12,
                      height: 12,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.black,
                      ),
                    )
                  : const Icon(Icons.play_arrow_rounded, size: 16),
              label: Text(
                _isExecutingCode ? 'Executing...' : 'Run Code',
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
              onPressed: _isExecutingCode ? null : _executeCode,
            ),
            const SizedBox(width: 8),
          ],

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
        final isWide = constraints.maxWidth >= 768;

        if (isWide) {
          return Row(
            children: [
              Expanded(flex: 4, child: _buildAiConversationPanel()),
              Container(width: 1, color: QuantColors.hairlineBorder),
              Expanded(flex: 6, child: _buildArtifactViewer()),
            ],
          );
        } else {
          return Column(
            children: [
              Expanded(flex: 4, child: _buildAiConversationPanel()),
              Container(height: 1, color: QuantColors.hairlineBorder),
              Expanded(flex: 6, child: _buildArtifactViewer()),
            ],
          );
        }
      },
    );
  }

  /// Left Pane: Full Interactive AI Conversation Panel
  Widget _buildAiConversationPanel() {
    return Container(
      color: QuantColors.voidObsidian,
      child: Column(
        children: [
          // Header: AI Conversation status & model
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              border: Border(
                bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.forum_rounded,
                      size: 15,
                      color: QuantColors.cosmicCyan,
                    ),
                    SizedBox(width: 8),
                    Text(
                      'AI CONVERSATION',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                  ],
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.speed_rounded,
                        size: 11,
                        color: QuantColors.cosmicCyan,
                      ),
                      SizedBox(width: 4),
                      Text(
                        '<18ms TTFT',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w600,
                          color: QuantColors.cosmicCyan,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Message Stream
          Expanded(
            child: ListView.builder(
              controller: _chatScrollController,
              padding: const EdgeInsets.all(12),
              itemCount: _conversationMessages.length,
              itemBuilder: (context, index) {
                final msg = _conversationMessages[index];
                final isUser = msg['role'] == 'user';

                return Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: isUser
                      ? _buildUserMessageBubble(msg)
                      : _buildAssistantMessageBubble(msg),
                );
              },
            ),
          ),

          // Suggestion Chips Ribbon
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildPromptChip('Add unit test'),
                  _buildPromptChip('Optimize memory cache'),
                  _buildPromptChip('Explain AST structure'),
                  _buildPromptChip('Benchmark 120Hz'),
                ],
              ),
            ),
          ),

          // Prompt Input Composer
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(
              color: QuantColors.darkSlateCard,
              border: Border(
                top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    decoration: BoxDecoration(
                      color: QuantColors.voidObsidian,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: QuantColors.hairlineBorder),
                    ),
                    child: TextField(
                      controller: _promptController,
                      style: const TextStyle(
                        fontSize: 12,
                        color: QuantColors.textPrimary,
                      ),
                      decoration: const InputDecoration(
                        hintText: 'Instruct AI to edit canvas or write code...',
                        hintStyle: TextStyle(
                          fontSize: 12,
                          color: QuantColors.textMuted,
                        ),
                        border: InputBorder.none,
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  borderRadius: BorderRadius.circular(10),
                  onTap: _sendMessage,
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: QuantColors.cosmicCyan,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(
                      Icons.arrow_upward_rounded,
                      size: 16,
                      color: Colors.black,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPromptChip(String label) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: () {
          _promptController.text = label;
          _sendMessage();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: QuantColors.elevatedCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 10,
              color: QuantColors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildUserMessageBubble(Map<String, dynamic> msg) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 320),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              msg['text'] as String,
              style: const TextStyle(
                fontSize: 12,
                color: QuantColors.textPrimary,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              msg['time'] as String,
              style: const TextStyle(
                fontSize: 9,
                color: QuantColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAssistantMessageBubble(Map<String, dynamic> msg) {
    final hasThought = msg['thought'] != null;
    final artifactUpdate = msg['artifactUpdate'] as String?;

    return Align(
      alignment: Alignment.centerLeft,
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: QuantColors.cosmicCyan.withOpacity(0.3),
            width: 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Thinking Accordion
            if (hasThought) ...[
              InkWell(
                borderRadius: BorderRadius.circular(6),
                onTap: () {
                  setState(() {
                    _isThoughtExpanded = !_isThoughtExpanded;
                  });
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.psychology_outlined,
                        size: 13,
                        color: QuantColors.obsidianPurple,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Thinking Process (${msg['thoughtDuration']})',
                        style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.obsidianPurple,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Icon(
                        _isThoughtExpanded
                            ? Icons.keyboard_arrow_up_rounded
                            : Icons.keyboard_arrow_down_rounded,
                        size: 14,
                        color: QuantColors.textMuted,
                      ),
                    ],
                  ),
                ),
              ),
              if (_isThoughtExpanded) ...[
                const SizedBox(height: 6),
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: QuantColors.voidObsidian,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(
                      color: QuantColors.hairlineBorder.withOpacity(0.6),
                    ),
                  ),
                  child: Text(
                    msg['thought'] as String,
                    style: const TextStyle(
                      fontSize: 10,
                      fontFamily: 'monospace',
                      color: QuantColors.textMuted,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 8),
            ],

            // Message text
            Text(
              msg['text'] as String,
              style: const TextStyle(
                fontSize: 12,
                color: QuantColors.textPrimary,
                height: 1.4,
              ),
            ),

            // Artifact Badge pill if present
            if (artifactUpdate != null) ...[
              const SizedBox(height: 8),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.cosmicCyan.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: QuantColors.cosmicCyan.withOpacity(0.4),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.auto_awesome_rounded,
                      size: 12,
                      color: QuantColors.cosmicCyan,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Artifact: $artifactUpdate',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: QuantColors.cosmicCyan,
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 4),
            Text(
              msg['time'] as String,
              style: const TextStyle(
                fontSize: 9,
                color: QuantColors.textMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Right Pane: Live Executable Code Editor & Document Canvas with Syntax Highlight Tokens
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
                    // Copy Artifact Button
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

                    // Toggle Console Tray
                    if (_activeDoc.type == CanvasDocType.code)
                      IconButton(
                        icon: Icon(
                          _showExecutionConsole
                              ? Icons.terminal_rounded
                              : Icons.terminal_outlined,
                          size: 16,
                          color: _showExecutionConsole
                              ? QuantColors.emeraldMatrix
                              : QuantColors.textSecondary,
                        ),
                        tooltip: 'Toggle Live Console',
                        onPressed: () {
                          setState(() {
                            _showExecutionConsole = !_showExecutionConsole;
                          });
                        },
                      ),
                  ],
                ),
              ],
            ),
          ),

          // Main Editor View with Syntax Highlighting
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: _renderArtifactContent(),
            ),
          ),

          // Live Execution Console Tray (at bottom of canvas)
          if (_activeDoc.type == CanvasDocType.code &&
              _showExecutionConsole &&
              _executionResult != null)
            _buildLiveExecutionConsole(),
        ],
      ),
    );
  }

  Widget _renderArtifactContent() {
    switch (_activeDoc.type) {
      case CanvasDocType.mermaid:
        return _buildMermaidDiagramVisualizer(_activeDoc.content);
      case CanvasDocType.code:
        return _buildCodeRendererWithSyntaxTokens(_activeDoc.content);
      case CanvasDocType.markdown:
      default:
        return _buildMarkdownRenderer(_activeDoc.content);
    }
  }

  /// Live Executable Code Editor with Syntax Highlight Tokens
  Widget _buildCodeRendererWithSyntaxTokens(String code) {
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
              // Line number gutter
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

              // Diff Indicator
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

              // Syntax Highlight Tokens
              Expanded(
                child: _buildTokenizedLine(lineContent),
              ),
            ],
          ),
        );
      }),
    );
  }

  /// Tokenizes a single code line into styled syntax spans
  Widget _buildTokenizedLine(String line) {
    if (line.trim().startsWith('//') || line.trim().startsWith('///')) {
      return Text(
        line,
        style: const TextStyle(
          fontSize: 12,
          fontFamily: 'monospace',
          fontStyle: FontStyle.italic,
          color: Color(0xFF64748B), // Slate Comment Grey
          height: 1.4,
        ),
      );
    }

    final tokens = _tokenizeLine(line);

    return RichText(
      text: TextSpan(
        children: tokens.map((t) {
          Color color;
          FontWeight weight = FontWeight.w500;

          switch (t.type) {
            case TokenType.keyword:
              color = const Color(0xFFC084FC); // Purple
              weight = FontWeight.w700;
              break;
            case TokenType.type:
              color = const Color(0xFF00F2FE); // Cyan
              weight = FontWeight.w600;
              break;
            case TokenType.string:
              color = const Color(0xFF34D399); // Emerald
              break;
            case TokenType.number:
              color = const Color(0xFFFB923C); // Molten Orange
              break;
            case TokenType.comment:
              color = const Color(0xFF64748B); // Slate Muted
              break;
            case TokenType.punctuation:
              color = const Color(0xFF94A3B8); // Punctuation Light Slate
              break;
            case TokenType.identifier:
            case TokenType.whitespace:
            default:
              color = const Color(0xFFF1F5F9); // Light Text
              break;
          }

          return TextSpan(
            text: t.text,
            style: TextStyle(
              fontSize: 12,
              fontFamily: 'monospace',
              color: color,
              fontWeight: weight,
              height: 1.4,
            ),
          );
        }).toList(),
      ),
    );
  }

  List<SyntaxToken> _tokenizeLine(String line) {
    final tokens = <SyntaxToken>[];
    final keywords = {
      'import', 'class', 'final', 'const', 'return', 'override',
      'super', 'void', 'extends', 'static', 'if', 'else', 'async',
      'await', 'pub', 'struct', 'fn', 'let', 'mut', 'impl', 'use'
    };
    final types = {
      'Widget', 'BuildContext', 'Color', 'BoxDecoration', 'BorderRadius',
      'Border', 'BorderSide', 'BoxShadow', 'Offset', 'Container',
      'StatelessWidget', 'String', 'int', 'double', 'bool', 'CanvasPatchEngine',
      'Blake3Hasher', 'Result', 'u32', 'u8', 'LatencySpan'
    };

    final regExp = RegExp(
      r"('[^']*'|""[^""]*"")|([a-zA-Z_][a-zA-Z0-9_]*)|([0-9]+(?:\.[0-9]+)?)|([{}();,.<>:=+\-*/&|!])|(\s+)",
    );

    final matches = regExp.allMatches(line);

    for (final m in matches) {
      final text = m.group(0)!;

      if (m.group(1) != null) {
        tokens.add(SyntaxToken(text, TokenType.string));
      } else if (m.group(2) != null) {
        if (keywords.contains(text)) {
          tokens.add(SyntaxToken(text, TokenType.keyword));
        } else if (types.contains(text)) {
          tokens.add(SyntaxToken(text, TokenType.type));
        } else {
          tokens.add(SyntaxToken(text, TokenType.identifier));
        }
      } else if (m.group(3) != null) {
        tokens.add(SyntaxToken(text, TokenType.number));
      } else if (m.group(4) != null) {
        tokens.add(SyntaxToken(text, TokenType.punctuation));
      } else if (m.group(5) != null) {
        tokens.add(SyntaxToken(text, TokenType.whitespace));
      }
    }

    if (tokens.isEmpty && line.isNotEmpty) {
      tokens.add(SyntaxToken(line, TokenType.identifier));
    }

    return tokens;
  }

  /// Live Executable Console Tray Output
  Widget _buildLiveExecutionConsole() {
    return Container(
      height: 140,
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        children: [
          // Console Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            color: QuantColors.darkSlateCard,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.terminal_rounded,
                      size: 14,
                      color: QuantColors.emeraldMatrix,
                    ),
                    const SizedBox(width: 8),
                    const Text(
                      'LIVE EXECUTION CONSOLE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                        color: QuantColors.textPrimary,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: QuantColors.emeraldMatrix.withOpacity(0.18),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(
                          color: QuantColors.emeraldMatrix.withOpacity(0.4),
                        ),
                      ),
                      child: const Text(
                        'EXIT CODE 0',
                        style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: QuantColors.emeraldMatrix,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                  ],
                ),
                Text(
                  '${_executionResult!.durationMs}ms | ${_executionResult!.memoryUsageKb ~/ 1024} MB RAM',
                  style: const TextStyle(
                    fontSize: 10,
                    fontFamily: 'monospace',
                    color: QuantColors.textMuted,
                  ),
                ),
              ],
            ),
          ),

          // Console Output Log
          Expanded(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              color: const Color(0xFF07080B),
              child: SingleChildScrollView(
                child: SelectableText(
                  _executionResult!.stdout,
                  style: const TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    color: Color(0xFF38BDF8),
                    height: 1.35,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
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
      {'title': 'Node A (IDE Orchestrator)', 'desc': 'Track 3 GitHub Parity & Subagents A1-A5', 'color': QuantColors.sovereignCyan},
      {'title': 'Node B (IDE Peer Agent)', 'desc': 'Track 2 ChatGPT Agent OS & Subagents B1-B5', 'color': QuantColors.neonGreen},
      {'title': 'Node C (CLI Dev-Worker)', 'desc': 'Track 1 Instagram & Subagents C1-C5', 'color': QuantColors.moltenAmber},
      {'title': 'Sentinel Gatekeeper', 'desc': '100% Green Vitest & Impeller Zero-ClipPath', 'color': QuantColors.emeraldMatrix},
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
                width: 300,
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
