// QuantChat Create Story screen (Phase 2C).
//
// Creation entry point (c): Memories -> Create Story. Name field, Add Snaps
// grid (Gallery / Camera tabs with select circles), press-and-hold reorder
// of the chosen snaps, audience picker, and a blue "Save Story" commit that
// uploads every snap (presigned PUT via the storage interface) and posts
// one story segment per snap under the shared name. Progress and errors
// are shown honestly per snap -- a failed upload blocks the commit with the
// real error, never a fake success.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:quant_theme/quant_theme.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';

class StoryCreateScreen extends StatefulWidget {
  final StoryService service;
  final List<PickedSnap>? initialSnaps;

  const StoryCreateScreen({super.key, required this.service, this.initialSnaps});

  @override
  State<StoryCreateScreen> createState() => _StoryCreateScreenState();
}

class _StoryCreateScreenState extends State<StoryCreateScreen> {
  final TextEditingController _nameController = TextEditingController();
  final ImagePicker _picker = ImagePicker();
  final List<PickedSnap> _snaps = [];
  StoryAudience _audience = StoryAudience.public;
  bool _saving = false;
  double _progress = 0;
  String _status = '';

  @override
  void initState() {
    super.initState();
    if (widget.initialSnaps != null) _snaps.addAll(widget.initialSnaps!);
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(message,
            style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  Future<void> _openAddSnaps() async {
    final added = await showModalBottomSheet<List<PickedSnap>>(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => _AddSnapsSheet(picker: _picker),
    );
    if (added != null && added.isNotEmpty && mounted) {
      setState(() => _snaps.addAll(added));
    }
  }

  Future<void> _saveStory() async {
    if (_snaps.isEmpty) {
      _showSnack('Add at least one snap first.');
      return;
    }
    if (_saving) return;
    setState(() {
      _saving = true;
      _progress = 0;
      _status = 'Uploading 1 of ${_snaps.length}';
    });
    final name = _nameController.text.trim().isEmpty
        ? null
        : _nameController.text.trim();
    try {
      for (var i = 0; i < _snaps.length; i++) {
        final snap = _snaps[i];
        if (!mounted) return;
        setState(() {
          _status = 'Uploading ${i + 1} of ${_snaps.length}';
          _progress = i / _snaps.length;
        });
        final filename = snap.path.split('/').last;
        final mediaUrl = await widget.service.uploadMedia(
          bytes: snap.bytes,
          filename: filename,
          contentType: snap.contentType,
        );
        if (!mounted) return;
        setState(() {
          _status = 'Publishing ${i + 1} of ${_snaps.length}';
          _progress = (i + 0.5) / _snaps.length;
        });
        await widget.service.createStory(
          type: snap.contentType.startsWith('video/')
              ? StoryMediaType.video
              : StoryMediaType.photo,
          mediaUrl: mediaUrl,
          durationSec: 10,
          audience: _audience,
          name: name,
        );
        if (!mounted) return;
        setState(() => _progress = (i + 1) / _snaps.length);
      }
      if (!mounted) return;
      _showSnack('Story published (${_snaps.length} snaps).');
      Navigator.of(context).pop(true);
    } on StoryStorageNotConfiguredException {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _status = '';
      });
      _showSnack(
          'Uploads unavailable: object storage is not configured on this deployment.');
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _status = '';
      });
      _showSnack('Publish failed: ${e.message}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        leading: IconButton(
          tooltip: 'Close',
          icon: const Icon(Icons.close_rounded,
              color: QuantColors.textPrimary),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Create Story',
            style: TextStyle(
                color: QuantColors.textPrimary,
                fontWeight: FontWeight.w800)),
        actions: [
          TextButton(
            onPressed: _saving ? null : _saveStory,
            child: const Text('Save',
                style: TextStyle(
                    color: QuantColors.neonGreen,
                    fontWeight: FontWeight.w700)),
          ),
        ],
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('Name Story',
                style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            TextField(
              controller: _nameController,
              style:
                  const TextStyle(color: QuantColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'e.g. Weekend trip',
                hintStyle:
                    const TextStyle(color: QuantColors.textMuted),
                filled: true,
                fillColor: QuantColors.darkSlateCard,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 8),
            const Text('Press and hold a snap to reorder',
                style: TextStyle(
                    color: QuantColors.textMuted, fontSize: 12)),
            const SizedBox(height: 12),
            _buildSnapGrid(),
            const SizedBox(height: 16),
            const Text('Who can see this story',
                style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 8),
            _buildAudiencePicker(),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 52,
              child: ElevatedButton(
                onPressed: _saving ? null : _saveStory,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2B7FFF),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: _saving
                    ? Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2),
                          ),
                          const SizedBox(width: 12),
                          Text(_status,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700)),
                        ],
                      )
                    : const Text('Save Story',
                        style: TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 16)),
              ),
            ),
            if (_saving) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(
                value: _progress,
                color: const Color(0xFF2B7FFF),
                backgroundColor: QuantColors.darkSlateCard,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildSnapGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        mainAxisSpacing: 8,
        crossAxisSpacing: 8,
      ),
      itemCount: _snaps.length + 1,
      itemBuilder: (context, index) {
        if (index == _snaps.length) {
          // "Add Snaps" empty tile.
          return GestureDetector(
            onTap: _saving ? null : _openAddSnaps,
            child: Container(
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: QuantColors.hairlineBorder,
                    style: BorderStyle.solid),
              ),
              child: const Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add_photo_alternate_rounded,
                      color: QuantColors.neonGreen, size: 28),
                  SizedBox(height: 4),
                  Text('Add Snaps',
                      style: TextStyle(
                          color: QuantColors.textPrimary,
                          fontWeight: FontWeight.w600,
                          fontSize: 12)),
                ],
              ),
            ),
          );
        }
        final snap = _snaps[index];
        final tile = Stack(
          children: [
            Positioned.fill(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.memory(snap.bytes, fit: BoxFit.cover),
              ),
            ),
            Positioned(
              top: 4,
              right: 4,
              child: GestureDetector(
                onTap: _saving
                    ? null
                    : () => setState(() => _snaps.removeAt(index)),
                child: Container(
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.close_rounded,
                      color: Colors.white, size: 18),
                ),
              ),
            ),
            Positioned(
              bottom: 4,
              left: 4,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.black54,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('${index + 1}',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        );
        // Long-press drag to reorder.
        return LongPressDraggable<int>(
          data: index,
          feedback: SizedBox(
              width: 100, height: 100, child: tile),
          childWhenDragging: Opacity(opacity: 0.3, child: tile),
          child: DragTarget<int>(
            onAcceptWithDetails: (details) {
              final from = details.data;
              if (from == index || _saving) return;
              setState(() {
                final moved = _snaps.removeAt(from);
                _snaps.insert(index, moved);
              });
            },
            builder: (_, __, ___) => tile,
          ),
        );
      },
    );
  }

  Widget _buildAudiencePicker() {
    return Column(
      children: StoryAudience.values.map((a) {
        final selected = _audience == a;
        return GestureDetector(
          onTap: _saving ? null : () => setState(() => _audience = a),
          child: Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: selected
                  ? QuantColors.neonGreen.withOpacity(0.12)
                  : QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected
                    ? QuantColors.neonGreen
                    : QuantColors.hairlineBorder,
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.label,
                          style: const TextStyle(
                              color: QuantColors.textPrimary,
                              fontWeight: FontWeight.w700)),
                      Text(a.subtitle,
                          style: const TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 12)),
                    ],
                  ),
                ),
                Icon(
                  selected
                      ? Icons.radio_button_checked_rounded
                      : Icons.radio_button_unchecked_rounded,
                  color: selected
                      ? QuantColors.neonGreen
                      : QuantColors.textMuted,
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// Add-snaps picker sheet: Gallery (multi-select with circles) and Camera
/// tabs. Returns the picked snaps; selection state lives here so the
/// parent screen stays simple.
class _AddSnapsSheet extends StatefulWidget {
  final ImagePicker picker;

  const _AddSnapsSheet({required this.picker});

  @override
  State<_AddSnapsSheet> createState() => _AddSnapsSheetState();
}

class _AddSnapsSheetState extends State<_AddSnapsSheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final List<PickedSnap> _selected = [];
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  Future<void> _pickGallery() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final files = await widget.picker.pickMultiImage();
      for (final f in files) {
        final bytes = await f.readAsBytes();
        _selected.add(PickedSnap(
            path: f.path, bytes: bytes, contentType: contentTypeForPath(f.path)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (mounted) setState(() {});
  }

  Future<void> _takePhoto() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final file =
          await widget.picker.pickImage(source: ImageSource.camera);
      if (file != null) {
        final bytes = await file.readAsBytes();
        _selected.add(PickedSnap(
            path: file.path,
            bytes: bytes,
            contentType: contentTypeForPath(file.path)));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding:
            EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: Column(
            children: [
              TabBar(
                controller: _tabs,
                labelColor: QuantColors.neonGreen,
                unselectedLabelColor: QuantColors.textMuted,
                indicatorColor: QuantColors.neonGreen,
                tabs: const [
                  Tab(text: 'Gallery', icon: Icon(Icons.photo_library_rounded)),
                  Tab(text: 'Camera', icon: Icon(Icons.photo_camera_rounded)),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _buildGalleryTab(),
                    _buildCameraTab(),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  width: double.infinity,
                  height: 50,
                  child: ElevatedButton(
                    onPressed: _selected.isEmpty
                        ? null
                        : () => Navigator.of(context).pop(_selected),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2B7FFF),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                    ),
                    child: Text(
                        'Add ${_selected.length} snap${_selected.length == 1 ? '' : 's'}',
                        style: const TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGalleryTab() {
    if (_selected.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.photo_library_rounded,
                color: QuantColors.textMuted, size: 40),
            const SizedBox(height: 8),
            const Text('No snaps selected yet.',
                style: TextStyle(color: QuantColors.textMuted)),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _pickGallery,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Choose from gallery'),
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.neonGreen,
                foregroundColor: Colors.black,
              ),
            ),
          ],
        ),
      );
    }
    return Column(
      children: [
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: _busy ? null : _pickGallery,
            icon: const Icon(Icons.add_rounded,
                color: QuantColors.neonGreen),
            label: const Text('Add more',
                style: TextStyle(color: QuantColors.neonGreen)),
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            gridDelegate:
                const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
            ),
            itemCount: _selected.length,
            itemBuilder: (_, i) {
              final snap = _selected[i];
              return GestureDetector(
                onTap: () => setState(() => _selected.removeAt(i)),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child:
                            Image.memory(snap.bytes, fit: BoxFit.cover),
                      ),
                    ),
                    // Select circle (selected = filled check).
                    const Positioned(
                      top: 6,
                      right: 6,
                      child: Icon(Icons.check_circle_rounded,
                          color: QuantColors.neonGreen, size: 24),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildCameraTab() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.photo_camera_rounded,
              color: QuantColors.textMuted, size: 40),
          const SizedBox(height: 8),
          const Text('Capture snaps to add them here.',
              style: TextStyle(color: QuantColors.textMuted)),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _takePhoto,
            icon: const Icon(Icons.photo_camera_rounded),
            label: const Text('Take photo'),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.neonGreen,
              foregroundColor: Colors.black,
            ),
          ),
          if (_selected.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('${_selected.length} selected',
                style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}
