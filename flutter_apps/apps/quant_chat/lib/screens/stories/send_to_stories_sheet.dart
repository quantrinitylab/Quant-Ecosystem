// QuantChat Send To -> Stories section (Phase 2C).
//
// Creation entry point (b): the Send To sheet's "Stories" section --
// My Story (Friends Only), My Story (Public), a location/place story,
// and "+ New Story". This widget is the integration seam:
//
//   TODO-INTEGRATION (Phase 1A -- Send To screen, branch
//   quantchat-phase1a-camera): the Send To screen's "Stories" section
//   should embed this widget (or call showSendToStoriesSheet) with the
//   finished snap:
//
//     SendToStoriesSection(
//       service: <StoryService>,
//       snap: PickedSnap(path: ..., bytes: <edited bytes>,
//                        contentType: 'image/jpeg'),
//     )
//
//   Built against the documented PickedSnap/StoryService interfaces only;
//   no code is copied from the unmerged 1A branch.
//
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../../models/story_models.dart';
import '../../services/story_service.dart';
import 'story_create_screen.dart';

enum _StoryDestination { friendsOnly, public, place }

/// Inline embeddable Stories section for the Send To screen.
class SendToStoriesSection extends StatefulWidget {
  final StoryService service;
  final PickedSnap snap;

  const SendToStoriesSection({
    super.key,
    required this.service,
    required this.snap,
  });

  @override
  State<SendToStoriesSection> createState() =>
      _SendToStoriesSectionState();
}

class _SendToStoriesSectionState extends State<SendToStoriesSection> {
  _StoryDestination _selected = _StoryDestination.friendsOnly;
  final TextEditingController _placeController = TextEditingController();
  bool _posting = false;

  @override
  void dispose() {
    _placeController.dispose();
    super.dispose();
  }

  void _showSnack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.voidObsidian,
        content: Text(message,
            style: const TextStyle(color: QuantColors.textPrimary)),
      ),
    );
  }

  StoryAudience get _audience {
    switch (_selected) {
      case _StoryDestination.friendsOnly:
        return StoryAudience.friendsOnly;
      case _StoryDestination.public:
      case _StoryDestination.place:
        // Place stories are public editorial rows tagged with a place.
        return StoryAudience.public;
    }
  }

  Future<void> _post() async {
    if (_posting) return;
    if (_selected == _StoryDestination.place &&
        _placeController.text.trim().isEmpty) {
      _showSnack('Enter a place name for the place story.');
      return;
    }
    setState(() => _posting = true);
    try {
      final filename = widget.snap.path.split('/').last;
      final mediaUrl = await widget.service.uploadMedia(
        bytes: widget.snap.bytes,
        filename: filename.isEmpty ? 'snap.jpg' : filename,
        contentType: widget.snap.contentType,
      );
      await widget.service.createStory(
        type: widget.snap.contentType.startsWith('video/')
            ? StoryMediaType.video
            : StoryMediaType.photo,
        mediaUrl: mediaUrl,
        durationSec: 10,
        audience: _audience,
        placeName: _selected == _StoryDestination.place
            ? _placeController.text.trim()
            : null,
      );
      if (!mounted) return;
      _showSnack('Story posted.');
      Navigator.of(context).maybePop(true);
    } on StoryStorageNotConfiguredException {
      if (!mounted) return;
      setState(() => _posting = false);
      _showSnack(
          'Uploads unavailable: object storage is not configured on this deployment.');
    } on StoryApiException catch (e) {
      if (!mounted) return;
      setState(() => _posting = false);
      _showSnack('Could not post story: ${e.message}');
    }
  }

  void _openNewStory() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => StoryCreateScreen(
          service: widget.service,
          initialSnaps: [widget.snap],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text('Stories',
                  style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w800)),
            ),
            TextButton.icon(
              onPressed: _posting ? null : _openNewStory,
              icon: const Icon(Icons.add_rounded,
                  color: QuantColors.neonGreen, size: 18),
              label: const Text('New Story',
                  style: TextStyle(
                      color: QuantColors.neonGreen,
                      fontWeight: FontWeight.w700)),
            ),
          ],
        ),
        _destinationRow(
          value: _StoryDestination.friendsOnly,
          title: 'My Story - Friends Only',
          subtitle: 'Just for friends',
        ),
        _destinationRow(
          value: _StoryDestination.public,
          title: 'My Story - Public',
          subtitle: 'Everyone',
        ),
        _destinationRow(
          value: _StoryDestination.place,
          title: 'Place Story',
          subtitle: 'Add to a place story',
        ),
        if (_selected == _StoryDestination.place)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: TextField(
              controller: _placeController,
              style:
                  const TextStyle(color: QuantColors.textPrimary),
              decoration: InputDecoration(
                hintText: 'Place name',
                hintStyle:
                    const TextStyle(color: QuantColors.textMuted),
                filled: true,
                fillColor: QuantColors.darkSlateCard,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 12),
              ),
            ),
          ),
        const SizedBox(height: 8),
        SizedBox(
          height: 50,
          child: ElevatedButton.icon(
            onPressed: _posting ? null : _post,
            icon: _posting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                        color: Colors.black, strokeWidth: 2),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(_posting ? 'Posting' : 'Post to Story',
                style: const TextStyle(fontWeight: FontWeight.w800)),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.neonGreen,
              foregroundColor: Colors.black,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14)),
            ),
          ),
        ),
      ],
    );
  }

  Widget _destinationRow({
    required _StoryDestination value,
    required String title,
    required String subtitle,
  }) {
    final selected = _selected == value;
    return GestureDetector(
      onTap:
          _posting ? null : () => setState(() => _selected = value),
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
            const CircleAvatar(
              radius: 20,
              backgroundColor: QuantColors.voidObsidian,
              child: Icon(Icons.auto_stories_rounded,
                  color: QuantColors.textMuted, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: QuantColors.textPrimary,
                          fontWeight: FontWeight.w700)),
                  Text(subtitle,
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
  }
}

/// Convenience: open the Stories section as a bottom sheet (e.g. from a
/// standalone share flow) instead of embedding it in Send To.
Future<bool?> showSendToStoriesSheet(
  BuildContext context, {
  required StoryService service,
  required PickedSnap snap,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    backgroundColor: QuantColors.voidObsidian,
    isScrollControlled: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
    ),
    builder: (_) => SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16,
        ),
        child: SendToStoriesSection(service: service, snap: snap),
      ),
    ),
  );
}
