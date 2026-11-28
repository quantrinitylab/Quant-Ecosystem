// Sovereign Quant Ecosystem - QuantChat post-record interstitial.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// After a video stops recording, this dark interstitial appears before the
// editor: "Undo" (text button, bottom-left) discards the capture back to the
// camera; "Preview" (accent button, bottom-right) enters the editor. The
// editor result is forwarded straight to the camera because the editor route
// replaces this one.

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import 'snap_editor_screen.dart';

/// Dark interstitial shown after a video recording stops.
class CaptureReviewScreen extends StatelessWidget {
  final String filePath;
  final int durationSeconds;
  final List<SnapRecipient> recipients;

  const CaptureReviewScreen({
    super.key,
    required this.filePath,
    required this.durationSeconds,
    this.recipients = const [],
  });

  String get _durationLabel =>
      '0:${durationSeconds.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(
                        color: QuantColors.elevatedCard,
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(
                          color: QuantColors.hairlineBorder,
                        ),
                      ),
                      child: const Icon(
                        Icons.videocam_rounded,
                        color: QuantColors.textMuted,
                        size: 40,
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'Video recorded · $_durationLabel',
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Preview to edit and send, or undo to discard.',
                      style: TextStyle(
                        color: QuantColors.textMuted,
                        fontSize: 13,
                      ),
                    ),
                    // TODO: real in-interstitial video playback needs the
                    // video_player plugin.
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 16, 24),
              child: Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    style: TextButton.styleFrom(
                      foregroundColor: QuantColors.textSecondary,
                    ),
                    child: const Text(
                      'Undo',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  ElevatedButton(
                    onPressed: () {
                      // The editor replaces this interstitial, so its
                      // SnapSendResult pops straight back to the camera.
                      Navigator.of(context).pushReplacement<SnapSendResult>(
                        MaterialPageRoute(
                          builder: (_) => SnapEditorScreen(
                            capturedFilePath: filePath,
                            isVideo: true,
                            recipients: recipients,
                          ),
                        ),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: QuantColors.neonGreen,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 30,
                        vertical: 14,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    child: const Text(
                      'Preview',
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
