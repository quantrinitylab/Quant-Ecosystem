// Sovereign Quant Ecosystem - QuantChat Snap Editor (capture -> edit -> send)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).
// Phase 1A draft + B-recon deltas (reviewed against quant_theme tokens,
// all QuantColors names verified against quant_theme.dart):
// - Edit tools live in a RIGHT VERTICAL RAIL (Text, Draw, Sticker, Scissors,
//   Sound, Timer, Effects, Crop, Link) with text labels, never icon-only.
//   Text/Draw are functional; Sticker keeps its tray; the rest are stubbed
//   with explicit TODOs and "Soon" messaging.
// - Bottom bar left->right: Save (private-copy confirm sheet), Story
//   (stub with TODO), accent Send To (opens the upgraded Send To sheet).
// - The expiry picker moved into the Send To sheet; expiry + audience stay
//   visible on the send action there.

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import 'send_to_screen.dart';

/// Snap expiry options shown in the Send To sheet and on the send action.
enum SnapExpiry {
  viewOnce,
  tenSeconds,
  twentyFourHours;

  String get label {
    switch (this) {
      case SnapExpiry.viewOnce:
        return 'View once';
      case SnapExpiry.tenSeconds:
        return '10 seconds';
      case SnapExpiry.twentyFourHours:
        return '24 hours';
    }
  }

  /// Short phrase embedded in the send action, e.g. "disappears in 10s".
  String get sendPhrase {
    switch (this) {
      case SnapExpiry.viewOnce:
        return 'view once';
      case SnapExpiry.tenSeconds:
        return 'disappears in 10s';
      case SnapExpiry.twentyFourHours:
        return 'disappears in 24h';
    }
  }

  /// Seconds after viewing before the snap disappears (0 = view-once).
  int get seconds {
    switch (this) {
      case SnapExpiry.viewOnce:
        return 0;
      case SnapExpiry.tenSeconds:
        return 10;
      case SnapExpiry.twentyFourHours:
        return 86400;
    }
  }
}

/// A sendable recipient for a snap. Passed in by the caller; defaults to empty.
class SnapRecipient {
  final String id;
  final String displayName;

  const SnapRecipient({required this.id, required this.displayName});
}

/// Result returned via Navigator.pop when the user taps Send.
class SnapSendResult {
  final String filePath;
  final bool isVideo;
  final SnapExpiry expiry;
  final List<SnapRecipient> audience;
  final bool saveCopy;

  const SnapSendResult({
    required this.filePath,
    required this.isVideo,
    required this.expiry,
    required this.audience,
    required this.saveCopy,
  });
}

enum _EditMode { none, text, draw }

/// Draggable text overlay. Position is fractional (0..1) so it survives
/// layout changes.
class _TextOverlay {
  String text;
  Offset position;
  Color color;

  _TextOverlay({
    required this.text,
    required this.position,
    required this.color,
  });
}

/// One freehand stroke. Points are fractional (0..1) of the canvas size.
class _Stroke {
  final List<Offset> points;
  final Color color;

  _Stroke({required this.points, required this.color});
}

/// Right-rail tool definition: label, icon and whether tapping it is
/// implemented yet.
class _RailTool {
  final String label;
  final IconData icon;
  final bool implemented;

  const _RailTool(this.label, this.icon, {this.implemented = true});
}

/// Capture -> edit -> send. Receives the captured file, offers the edit tools
/// in a right vertical rail, and a bottom bar with Save, Story and Send To.
class SnapEditorScreen extends StatefulWidget {
  final String capturedFilePath;
  final bool isVideo;
  final List<SnapRecipient> recipients;

  const SnapEditorScreen({
    super.key,
    required this.capturedFilePath,
    required this.isVideo,
    this.recipients = const [],
  });

  @override
  State<SnapEditorScreen> createState() => _SnapEditorScreenState();
}

class _SnapEditorScreenState extends State<SnapEditorScreen> {
  _EditMode _editMode = _EditMode.none;
  final List<_TextOverlay> _textOverlays = <_TextOverlay>[];
  final List<_Stroke> _strokes = <_Stroke>[];
  _Stroke? _currentStroke;
  Color _drawColor = Colors.white;

  SnapExpiry _expiry = SnapExpiry.tenSeconds;
  bool _saveCopy = false;

  static const List<_RailTool> _railTools = [
    _RailTool('Text', Icons.text_fields_rounded),
    _RailTool('Draw', Icons.brush_rounded),
    _RailTool('Sticker', Icons.emoji_emotions_rounded),
    _RailTool('Scissors', Icons.content_cut_rounded, implemented: false),
    _RailTool('Sound', Icons.music_note_rounded, implemented: false),
    _RailTool('Timer', Icons.timer_rounded, implemented: false),
    _RailTool('Effects', Icons.auto_awesome_rounded, implemented: false),
    _RailTool('Crop', Icons.crop_rounded, implemented: false),
    _RailTool('Link', Icons.link_rounded, implemented: false),
  ];

  static const List<Color> _drawPalette = [
    Colors.white,
    QuantColors.neonGreen,
    QuantColors.moltenOrange,
    QuantColors.sovereignCyan,
    QuantColors.sunriseRose,
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Column(
            children: [
              Expanded(child: _buildEditingCanvas()),
              SafeArea(top: false, child: _buildBottomPanel()),
            ],
          ),
          Positioned(top: 0, left: 0, right: 0, child: _buildTopChrome()),
          Positioned(
            right: 4,
            top: 0,
            bottom: 0,
            child: Center(child: _buildToolRail()),
          ),
          if (_editMode == _EditMode.draw)
            Positioned(
              top: 88,
              left: 0,
              right: 64,
              child: _buildDrawPalette(),
            ),
        ],
      ),
    );
  }

  // ---------------------------------------------------------------- preview

  Widget _buildEditingCanvas() {
    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return Stack(
          children: [
            Positioned.fill(child: _buildPreview()),
            CustomPaint(
              painter: _DrawingPainter(
                strokes: _strokes,
                current: _currentStroke,
              ),
              size: size,
            ),
            for (final overlay in _textOverlays)
              Positioned(
                left: overlay.position.dx * size.width - 60,
                top: overlay.position.dy * size.height - 20,
                child: GestureDetector(
                  // Double-tap a caption to remove it.
                  onDoubleTap: () =>
                      setState(() => _textOverlays.remove(overlay)),
                  onPanUpdate: _editMode == _EditMode.draw
                      ? null
                      : (details) {
                          setState(() {
                            overlay.position = Offset(
                              (overlay.position.dx +
                                      details.delta.dx / size.width)
                                  .clamp(0.0, 1.0),
                              (overlay.position.dy +
                                      details.delta.dy / size.height)
                                  .clamp(0.0, 1.0),
                            );
                          });
                        },
                  child: Container(
                    width: 120,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    child: Text(
                      overlay.text,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: overlay.color,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        shadows: [
                          Shadow(
                            color: Colors.black.withOpacity(0.7),
                            blurRadius: 6,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            // Draw gesture catcher sits on top only in draw mode.
            if (_editMode == _EditMode.draw)
              Positioned.fill(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onPanStart: (details) => setState(() {
                    _currentStroke = _Stroke(
                      color: _drawColor,
                      points: [_toFraction(details.localPosition, size)],
                    );
                  }),
                  onPanUpdate: (details) => setState(() {
                    _currentStroke?.points
                        .add(_toFraction(details.localPosition, size));
                  }),
                  onPanEnd: (_) => setState(() {
                    if (_currentStroke != null) {
                      _strokes.add(_currentStroke!);
                      _currentStroke = null;
                    }
                  }),
                ),
              ),
          ],
        );
      },
    );
  }

  Offset _toFraction(Offset local, Size size) {
    return Offset(
      (local.dx / size.width).clamp(0.0, 1.0),
      (local.dy / size.height).clamp(0.0, 1.0),
    );
  }

  Widget _buildPreview() {
    if (widget.isVideo) {
      // TODO: add the video_player plugin for in-editor video playback.
      return Container(
        color: Colors.black,
        child: const Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.videocam_rounded,
                color: QuantColors.textMuted,
                size: 48,
              ),
              SizedBox(height: 12),
              Text(
                'Video preview',
                style: TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                ),
              ),
              SizedBox(height: 4),
              Text(
                'Playback needs the video_player plugin.',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Image.file(
      File(widget.capturedFilePath),
      fit: BoxFit.contain,
      errorBuilder: (_, __, ___) => const Center(
        child: Text(
          'Could not load the captured image.',
          style: TextStyle(color: QuantColors.textMuted, fontSize: 13),
        ),
      ),
    );
  }

  // --------------------------------------------------------------- top bar

  Widget _buildTopChrome() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Colors.black.withOpacity(0.6), Colors.transparent],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              IconButton(
                tooltip: 'Discard snap',
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(
                  Icons.close_rounded,
                  color: Colors.white,
                ),
              ),
              const Spacer(),
              const Text(
                'EDIT SNAP',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              const Spacer(),
              // Balances the discard button; the tool rail now owns the
              // right edge of the screen.
              const SizedBox(width: 48),
            ],
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------- tool rail

  /// Right vertical rail of labelled edit tools, never icon-only.
  Widget _buildToolRail() {
    return SingleChildScrollView(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final tool in _railTools)
            _buildRailTool(
              tool,
              isActive: (tool.label == 'Text' &&
                      _editMode == _EditMode.text) ||
                  (tool.label == 'Draw' && _editMode == _EditMode.draw),
            ),
        ],
      ),
    );
  }

  Widget _buildRailTool(_RailTool tool, {bool isActive = false}) {
    final color = isActive
        ? QuantColors.neonGreen
        : tool.implemented
            ? Colors.white
            : QuantColors.textSecondary;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _onEditTool(tool),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(tool.icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(
              tool.label,
              style: TextStyle(
                color: color,
                fontSize: 9,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawPalette() {
    return Center(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.55),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final color in _drawPalette)
              GestureDetector(
                onTap: () => setState(() => _drawColor = color),
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 5),
                  width: 26,
                  height: 26,
                  decoration: BoxDecoration(
                    color: color,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _drawColor == color
                          ? Colors.white
                          : Colors.transparent,
                      width: 2,
                    ),
                  ),
                ),
              ),
            const SizedBox(width: 6),
            TextButton(
              onPressed: () => setState(() {
                _strokes.clear();
                _currentStroke = null;
              }),
              child: const Text(
                'Clear',
                style:
                    TextStyle(color: QuantColors.textSecondary, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _onEditTool(_RailTool tool) {
    switch (tool.label) {
      case 'Text':
        final entering =
            _editMode != _EditMode.text ? _EditMode.text : _EditMode.none;
        setState(() => _editMode = entering);
        if (entering == _EditMode.text) _addTextOverlay();
        break;
      case 'Draw':
        setState(() {
          _editMode =
              _editMode == _EditMode.draw ? _EditMode.none : _EditMode.draw;
        });
        break;
      case 'Sticker':
        _openStickerTray();
        break;
      case 'Scissors':
        // TODO: implement cutout (tap object -> isolate as sticker).
        _showMessage('Cutout is not implemented yet.');
        break;
      case 'Sound':
        // TODO: implement sound attach sheet (search, trim, attach).
        _showMessage('Sound is not implemented yet.');
        break;
      case 'Timer':
        // TODO: implement the snap self-timer picker.
        _showMessage('Timer is not implemented yet.');
        break;
      case 'Effects':
        // TODO: implement post-capture effects (retouch, enhance).
        _showMessage('Effects are not implemented yet.');
        break;
      case 'Crop':
        // TODO: implement crop (aspect presets + freeform) on the canvas.
        _showMessage('Crop is not implemented yet.');
        break;
      case 'Link':
        // TODO: implement link attach (URL entry -> preview -> attach).
        _showMessage('Link attachments are not implemented yet.');
        break;
    }
  }

  Future<void> _addTextOverlay() async {
    final controller = TextEditingController();
    final text = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        title: const Text(
          'Add text',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
        content: TextField(
          controller: controller,
          autofocus: true,
          style: const TextStyle(color: QuantColors.textPrimary),
          decoration: const InputDecoration(
            hintText: 'Type something...',
            hintStyle: TextStyle(color: QuantColors.textMuted),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(controller.text.trim()),
            child: const Text('Add'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (text != null && text.isNotEmpty && mounted) {
      setState(() {
        _textOverlays.add(_TextOverlay(
          text: text,
          position: const Offset(0.5, 0.35),
          color: Colors.white,
        ));
        _editMode = _EditMode.none;
      });
    } else if (mounted) {
      setState(() => _editMode = _EditMode.none);
    }
  }

  void _openStickerTray() {
    // TODO: sticker pack data, search, and drag-to-place on the canvas.
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => Container(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
        decoration: const BoxDecoration(
          color: QuantColors.darkSlateCard,
          borderRadius: BorderRadius.only(
            topLeft: Radius.circular(24),
            topRight: Radius.circular(24),
          ),
          border: Border(
            top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: QuantColors.activeBorder,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'STICKERS',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 12),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 4,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
              ),
              itemCount: 8,
              itemBuilder: (_, __) => Container(
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Icon(
                  Icons.emoji_emotions_rounded,
                  color: QuantColors.textMuted,
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Sticker packs are not implemented yet.',
              style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  // ------------------------------------------------------------ bottom bar

  /// Bottom bar left->right: Save (private copy), Story (stub), Send To.
  Widget _buildBottomPanel() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 20),
      child: Row(
        children: [
          _buildPanelAction(
            icon: Icons.download_rounded,
            label: 'Save',
            onTap: _openSaveCopySheet,
          ),
          const SizedBox(width: 4),
          _buildStoryButton(),
          const Spacer(),
          ElevatedButton.icon(
            onPressed: _openSendTo,
            icon: const Icon(Icons.send_rounded, size: 16),
            label: const Text(
              'Send To',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.neonGreen,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPanelAction({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
  }) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: Colors.white, size: 22),
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStoryButton() {
    return TextButton.icon(
      onPressed: _onStory,
      icon: const Icon(Icons.auto_stories_rounded, size: 18),
      label: const Text(
        'Story',
        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      ),
      style: TextButton.styleFrom(
        foregroundColor: QuantColors.textPrimary,
      ),
    );
  }

  void _onStory() {
    // TODO: post the edited snap to the user's story once the story
    // backend exists.
    _showMessage('Story posting is not implemented yet.');
  }

  /// "Save a private copy" confirm sheet: the switch moved here from the
  /// old bottom panel.
  void _openSaveCopySheet() {
    var save = _saveCopy;
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) => StatefulBuilder(
        builder: (sheetCtx, setSheetState) => Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
          decoration: const BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.only(
              topLeft: Radius.circular(24),
              topRight: Radius.circular(24),
            ),
            border: Border(
              top: BorderSide(color: QuantColors.hairlineBorder, width: 1.5),
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  decoration: BoxDecoration(
                    color: QuantColors.activeBorder,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Text(
                'SAVE A PRIVATE COPY',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              SwitchListTile(
                value: save,
                activeColor: QuantColors.neonGreen,
                contentPadding: EdgeInsets.zero,
                title: const Text(
                  'Save a private copy',
                  style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: const Text(
                  'Keep a copy in your private gallery before this snap '
                  'disappears.',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 12,
                  ),
                ),
                onChanged: (v) => setSheetState(() => save = v),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.of(sheetCtx).pop(),
                      child: const Text('Cancel'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () {
                        setState(() => _saveCopy = save);
                        Navigator.of(sheetCtx).pop();
                        _showMessage(save
                            ? 'Private copy will be saved with this snap.'
                            : 'Private copy skipped.');
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: QuantColors.neonGreen,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: const Text('Save'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _openSendTo() async {
    final result = await showModalBottomSheet<SendToResult>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => SendToSheet(
        recipients: widget.recipients,
        initialExpiry: _expiry,
      ),
    );
    if (result == null || !mounted) return;
    if (result.storyDestination != null) {
      // TODO: post to the story destination once the story backend exists.
      _showMessage('Story posting is not implemented yet.');
      return;
    }
    _showMessage('Sent!');
    Navigator.of(context).pop(SnapSendResult(
      filePath: widget.capturedFilePath,
      isVideo: widget.isVideo,
      expiry: result.expiry,
      audience: result.recipients,
      saveCopy: _saveCopy,
    ));
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          message,
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }
}

/// Freehand drawing painter. Uses drawPath only - no clipPath calls.
class _DrawingPainter extends CustomPainter {
  final List<_Stroke> strokes;
  final _Stroke? current;

  _DrawingPainter({required this.strokes, required this.current});

  @override
  void paint(Canvas canvas, Size size) {
    final all = [...strokes, if (current != null) current!];
    for (final stroke in all) {
      if (stroke.points.length < 2) continue;
      final paint = Paint()
        ..color = stroke.color
        ..strokeWidth = 4
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;
      final path = Path()
        ..moveTo(
          stroke.points.first.dx * size.width,
          stroke.points.first.dy * size.height,
        );
      for (final point in stroke.points.skip(1)) {
        path.lineTo(point.dx * size.width, point.dy * size.height);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _DrawingPainter oldDelegate) => true;
}
