// Sovereign Quant Ecosystem - QuantChat Snap Editor (capture -> edit -> send)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).
// Phase 1A draft — reviewed against quant_theme tokens (all QuantColors names verified).

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

/// Snap expiry options shown in the expiry picker and on the send button.
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

  /// Short phrase embedded in the send button, e.g. "disappears in 10s".
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

/// Capture -> edit -> send. Receives the captured file, offers the top edit
/// actions in one row plus a "More" overflow tray, and a send button that
/// shows the chosen expiry and audience.
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
  final Set<String> _selectedRecipientIds = <String>{};
  bool _saveCopy = false;

  static const List<Color> _drawPalette = [
    Colors.white,
    QuantColors.neonGreen,
    QuantColors.moltenOrange,
    QuantColors.sovereignCyan,
    QuantColors.sunriseRose,
  ];

  String get _audienceLabel {
    if (_selectedRecipientIds.isEmpty) return 'no recipient';
    final names = widget.recipients
        .where((r) => _selectedRecipientIds.contains(r.id))
        .map((r) => r.displayName)
        .toList();
    if (names.isEmpty) return 'no recipient';
    if (names.length == 1) return names.first;
    return '${names.first} +${names.length - 1}';
  }

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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
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
                  const SizedBox(width: 48),
                ],
              ),
              const SizedBox(height: 4),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    _buildEditTool('Text', Icons.text_fields_rounded,
                        _editMode == _EditMode.text),
                    _buildEditTool('Draw', Icons.brush_rounded,
                        _editMode == _EditMode.draw),
                    _buildEditTool(
                        'Sticker', Icons.emoji_emotions_rounded, false),
                    _buildEditTool('Crop', Icons.crop_rounded, false),
                    _buildEditTool('Timer', Icons.timer_rounded, false),
                    _buildEditTool('More', Icons.more_horiz_rounded, false),
                  ],
                ),
              ),
              if (_editMode == _EditMode.draw) _buildDrawPalette(),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEditTool(String label, IconData icon, bool isActive) {
    final color = isActive ? QuantColors.neonGreen : Colors.white;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => _onEditTool(label),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDrawPalette() {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final color in _drawPalette)
            GestureDetector(
              onTap: () => setState(() => _drawColor = color),
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 6),
                width: 28,
                height: 28,
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
          const SizedBox(width: 8),
          TextButton(
            onPressed: () => setState(() {
              _strokes.clear();
              _currentStroke = null;
            }),
            child: const Text(
              'Clear',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 12),
            ),
          ),
        ],
      ),
    );
  }

  void _onEditTool(String label) {
    switch (label) {
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
      case 'Crop':
        // TODO: implement crop (aspect presets + freeform) on the canvas.
        _showMessage('Crop is not implemented yet.');
        break;
      case 'Timer':
        // TODO: implement self-timer capture countdown.
        _showMessage('Self-timer is not implemented yet.');
        break;
      case 'More':
        _openMoreTray();
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

  void _openMoreTray() {
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
              'MORE',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            // TODO: implement each of these snap attachments.
            _buildMoreRow(Icons.music_note_rounded, 'Music',
                'Attach a soundtrack to your snap'),
            _buildMoreRow(Icons.mic_rounded, 'Voice note',
                'Record a voice overlay'),
            _buildMoreRow(Icons.location_on_rounded, 'Location',
                'Tag where this was taken'),
            _buildMoreRow(
                Icons.link_rounded, 'Link', 'Attach a link to your snap'),
          ],
        ),
      ),
    );
  }

  Widget _buildMoreRow(IconData icon, String title, String subtitle) {
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: QuantColors.textMuted, size: 20),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: QuantColors.textSecondary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
      ),
      trailing: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: QuantColors.hairlineBorder),
        ),
        child: const Text(
          'Soon',
          style: TextStyle(
            color: QuantColors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      onTap: () => _showMessage('$title is not implemented yet.'),
    );
  }

  // ------------------------------------------------------------ bottom panel

  Widget _buildBottomPanel() {
    return Container(
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: _buildAudienceButton()),
              const SizedBox(width: 8),
              Expanded(child: _buildExpiryButton()),
            ],
          ),
          const SizedBox(height: 4),
          _buildSaveCopyRow(),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: _buildSendButton(),
          ),
        ],
      ),
    );
  }

  Widget _buildAudienceButton() {
    return OutlinedButton.icon(
      onPressed: _openAudiencePicker,
      icon: const Icon(Icons.person_rounded, size: 16),
      label: Text(
        _audienceLabel,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      style: OutlinedButton.styleFrom(
        foregroundColor: QuantColors.textPrimary,
        side: const BorderSide(color: QuantColors.activeBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  Widget _buildExpiryButton() {
    return OutlinedButton.icon(
      onPressed: _openExpiryPicker,
      icon: const Icon(Icons.timer_rounded, size: 16),
      label: Text(
        _expiry.label,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
      ),
      style: OutlinedButton.styleFrom(
        foregroundColor: QuantColors.textPrimary,
        side: const BorderSide(color: QuantColors.activeBorder),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
    );
  }

  Widget _buildSaveCopyRow() {
    return Row(
      children: [
        const Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Save a private copy',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Text(
                'Keep a copy in your private gallery before this snap disappears.',
                style: TextStyle(
                  color: QuantColors.textMuted,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
        Switch(
          value: _saveCopy,
          activeColor: QuantColors.neonGreen,
          onChanged: (v) => setState(() => _saveCopy = v),
        ),
      ],
    );
  }

  Widget _buildSendButton() {
    final canSend = _selectedRecipientIds.isNotEmpty;
    final label = canSend
        ? 'Send · ${_expiry.sendPhrase} · to $_audienceLabel'
        : 'Send · select a recipient';
    return ElevatedButton(
      onPressed: canSend ? _send : null,
      style: ElevatedButton.styleFrom(
        backgroundColor: QuantColors.neonGreen,
        disabledBackgroundColor: QuantColors.darkSlateCard,
        foregroundColor: Colors.white,
        disabledForegroundColor: QuantColors.textMuted,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
        ),
      ),
      child: Text(
        label,
        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    );
  }

  void _openExpiryPicker() {
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
              'SNAP EXPIRY',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 8),
            for (final option in SnapExpiry.values)
              RadioListTile<SnapExpiry>(
                value: option,
                groupValue: _expiry,
                activeColor: QuantColors.neonGreen,
                contentPadding: EdgeInsets.zero,
                title: Text(
                  option.label,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onChanged: (v) {
                  if (v != null) setState(() => _expiry = v);
                  Navigator.of(ctx).pop();
                },
              ),
          ],
        ),
      ),
    );
  }

  void _openAudiencePicker() {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (ctx) {
        final selected = Set<String>.from(_selectedRecipientIds);
        return StatefulBuilder(
          builder: (sheetCtx, setSheetState) => Container(
            constraints: BoxConstraints(
              maxHeight: MediaQuery.of(sheetCtx).size.height * 0.7,
            ),
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
                  'SEND TO',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                if (widget.recipients.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'No recipients yet. Add contacts to send snaps.',
                      style: TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 13,
                      ),
                    ),
                  )
                else
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final recipient in widget.recipients)
                          CheckboxListTile(
                            value: selected.contains(recipient.id),
                            activeColor: QuantColors.neonGreen,
                            contentPadding: EdgeInsets.zero,
                            title: Text(
                              recipient.displayName,
                              style: const TextStyle(
                                color: QuantColors.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            onChanged: (v) => setSheetState(() {
                              if (v == true) {
                                selected.add(recipient.id);
                              } else {
                                selected.remove(recipient.id);
                              }
                            }),
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: () {
                      setState(() {
                        _selectedRecipientIds
                          ..clear()
                          ..addAll(selected);
                      });
                      Navigator.of(sheetCtx).pop();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: QuantColors.neonGreen,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Done'),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _send() {
    final audience = widget.recipients
        .where((r) => _selectedRecipientIds.contains(r.id))
        .toList();
    Navigator.of(context).pop(SnapSendResult(
      filePath: widget.capturedFilePath,
      isVideo: widget.isVideo,
      expiry: _expiry,
      audience: audience,
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
