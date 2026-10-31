// QuantChat quick story upload sheet (Phase 2C).
//
// Creation entry point (a): the edit screen's "Story" button posts the
// current snap straight to the story. This sheet is the integration seam:
//
//   TODO-INTEGRATION (Phase 1A -- camera tab / snap editor, branch
//   quantchat-phase1a-camera): the snap edit screen's bottom bar "Story"
//   button should call:
//
//     showStoryUploadSheet(
//       context,
//       service: <StoryService>,
//       snap: PickedSnap(path: ..., bytes: <edited bytes>,
//                        contentType: 'image/jpeg'),
//     );
//
//   The edited snap bytes come from the 1A editor; this sheet owns the
//   audience pick + upload + POST /stories and is written against the
//   documented PickedSnap/StoryService interfaces only -- no code is
//   copied from the unmerged 1A branch.
//
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';

/// Quick-post a finished snap to the user's story.
Future<bool> showStoryUploadSheet(
  BuildContext context, {
  required StoryService service,
  required PickedSnap snap,
  String? text,
}) async {
  final result = await showModalBottomSheet<bool>(
    context: context,
    backgroundColor: QuantColors.darkSlateCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => _StoryUploadSheet(
      service: service,
      snap: snap,
      text: text,
    ),
  );
  return result ?? false;
}

class _StoryUploadSheet extends StatefulWidget {
  final StoryService service;
  final PickedSnap snap;
  final String? text;

  const _StoryUploadSheet({
    required this.service,
    required this.snap,
    this.text,
  });

  @override
  State<_StoryUploadSheet> createState() => _StoryUploadSheetState();
}

class _StoryUploadSheetState extends State<_StoryUploadSheet> {
  StoryAudience _audience = StoryAudience.public;
  bool _posting = false;
  String _status = '';

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.voidObsidian,
        content: Text(message,
            style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  Future<void> _post() async {
    if (_posting) return;
    setState(() {
      _posting = true;
      _status = 'Uploading';
    });
    try {
      final filename = widget.snap.path.split('/').last;
      final mediaUrl = await widget.service.uploadMedia(
        bytes: widget.snap.bytes,
        filename: filename.isEmpty ? 'snap.jpg' : filename,
        contentType: widget.snap.contentType,
      );
      if (!mounted) return;
      setState(() => _status = 'Publishing');
      await widget.service.createStory(
        type: widget.snap.contentType.startsWith('video/')
            ? StoryMediaType.video
            : StoryMediaType.photo,
        mediaUrl: mediaUrl,
        durationSec: 10,
        audience: _audience,
      );
      if (!mounted) return;
      Navigator.of(context).pop(true);
      _showSnack('Added to your story.');
    } on StoryStorageNotConfiguredException {
      if (!mounted) return;
      setState(() {
        _posting = false;
        _status = '';
      });
      _showSnack(
          'Uploads unavailable: object storage is not configured on this deployment.');
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _posting = false;
        _status = '';
      });
      _showSnack('Could not post story: ${e.message}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Post to Story',
                style: TextStyle(
                    color: QuantColors.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            const Text('This snap disappears after 24 hours.',
                style: TextStyle(color: QuantColors.textMuted)),
            const SizedBox(height: 16),
            ...StoryAudience.values.map((a) {
              final selected = _audience == a;
              return GestureDetector(
                onTap: _posting
                    ? null
                    : () => setState(() => _audience = a),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: selected
                        ? QuantColors.neonGreen.withOpacity(0.12)
                        : QuantColors.voidObsidian,
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
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(a.label,
                                style: const TextStyle(
                                    color:
                                        QuantColors.textPrimary,
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
                            : Icons
                                .radio_button_unchecked_rounded,
                        color: selected
                            ? QuantColors.neonGreen
                            : QuantColors.textMuted,
                      ),
                    ],
                  ),
                ),
              );
            }),
            const SizedBox(height: 8),
            SizedBox(
              height: 50,
              child: ElevatedButton(
                onPressed: _posting ? null : _post,
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.neonGreen,
                  foregroundColor: Colors.black,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: _posting
                    ? Row(
                        mainAxisAlignment:
                            MainAxisAlignment.center,
                        children: [
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.black,
                                strokeWidth: 2),
                          ),
                          const SizedBox(width: 12),
                          Text(_status,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w700)),
                        ],
                      )
                    : const Text('Post Story',
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 16)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
