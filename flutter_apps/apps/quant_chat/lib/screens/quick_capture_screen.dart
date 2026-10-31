// QuantChat Quick Capture — Phase 2A.
// Strictly ZERO raw Unicode emojis throughout this file.
//
// Addressed quick-snap capture opened from a chat list row (camera
// quick-action) or an "Added Me" row. The screen is addressed to one
// recipient: the header names them and the capture result carries their id.
//
// Uses the `camera` plugin (BSD-3, flutter.dev). If the camera is unavailable
// the screen explains why and offers a retry — never a dead surface.
//
// Privacy honesty: end-to-end encryption is NOT enabled yet — nothing here
// claims it.

import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import '../models/chat_list_models.dart';
import '../models/chat_models.dart';

/// Full-screen addressed capture.
///
/// [recipient] is the friend the snap is addressed to. [onSnapReady] fires
/// when the user confirms a capture; upload/send wiring is a later phase
/// (see the TODO in [_confirmCapture]).
class QuickCaptureScreen extends StatefulWidget {
  final ChatConversation recipient;
  final ValueChanged<QuickSnapResult>? onSnapReady;

  const QuickCaptureScreen({
    super.key,
    required this.recipient,
    this.onSnapReady,
  });

  @override
  State<QuickCaptureScreen> createState() => _QuickCaptureScreenState();
}

class _QuickCaptureScreenState extends State<QuickCaptureScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  bool _initializing = true;
  String? _errorMessage;
  FlashMode _flashMode = FlashMode.off;
  bool _capturing = false;

  /// Review state: shows the captured photo with Retake / Send actions.
  XFile? _capturedPhoto;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      controller.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initCamera();
    }
  }

  Future<void> _initCamera() async {
    setState(() {
      _initializing = true;
      _errorMessage = null;
    });
    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() {
          _initializing = false;
          _errorMessage = 'No camera found on this device.';
        });
        return;
      }
      final controller = CameraController(
        _cameras.first,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _controller?.dispose();
      setState(() {
        _controller = controller;
        _initializing = false;
      });
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _errorMessage = 'Camera unavailable (${e.code}). '
            'Check app permissions and try again.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _errorMessage =
            'Could not start the camera. Check permissions and retry.';
      });
    }
  }

  Future<void> _toggleCamera() async {
    if (_cameras.length < 2) return;
    final current = _controller?.description;
    final next = _cameras.firstWhere(
      (c) => c != current,
      orElse: () => _cameras.first,
    );
    try {
      final controller = CameraController(
        next,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();
      if (!mounted) {
        await controller.dispose();
        return;
      }
      await _controller?.dispose();
      setState(() => _controller = controller);
    } on CameraException {
      // Keep the current camera on failure; surface nothing fatal.
    }
  }

  Future<void> _toggleFlash() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    final next =
        _flashMode == FlashMode.off ? FlashMode.torch : FlashMode.off;
    try {
      await controller.setFlashMode(next);
      setState(() => _flashMode = next);
    } on CameraException {
      // Flash unsupported on this lens — leave the mode unchanged.
    }
  }

  Future<void> _capturePhoto() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        _capturing) {
      return;
    }
    setState(() => _capturing = true);
    try {
      final photo = await controller.takePicture();
      if (!mounted) return;
      setState(() => _capturedPhoto = photo);
    } on CameraException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: QuantColors.darkSlateCard,
          content: Text('Capture failed (${e.code}). Try again.'),
        ),
      );
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _confirmCapture() {
    final photo = _capturedPhoto;
    if (photo == null) return;
    // TODO(phase-2b): hand the file to the snap upload pipeline addressed to
    // widget.recipient.contactId instead of just returning it.
    widget.onSnapReady?.call(
      QuickSnapResult(
        recipientId: widget.recipient.contactId,
        recipientName: widget.recipient.name,
        filePath: photo.path,
      ),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final recipient = widget.recipient;
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(recipient),
            Expanded(
              child: _capturedPhoto != null
                  ? _buildReview()
                  : _buildPreview(),
            ),
            if (_capturedPhoto == null) _buildCaptureBar(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ChatConversation recipient) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      color: Colors.black,
      child: Row(
        children: [
          IconButton(
            tooltip: 'Close quick snap',
            onPressed: () => Navigator.of(context).pop(),
            icon: const Icon(Icons.close_rounded,
                color: Colors.white, size: 24),
          ),
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: recipient.avatarColor.withOpacity(0.2),
              border: Border.all(
                color: recipient.avatarColor.withOpacity(0.6),
                width: 1.2,
              ),
            ),
            child: Center(
              child: Text(
                recipient.avatarInitials,
                style: TextStyle(
                  color: recipient.avatarColor,
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Quick Snap',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0.6,
                  ),
                ),
                Text(
                  'To: ${recipient.name}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: _flashMode == FlashMode.off
                ? 'Turn flash on'
                : 'Turn flash off',
            onPressed: _toggleFlash,
            icon: Icon(
              _flashMode == FlashMode.off
                  ? Icons.flash_off_rounded
                  : Icons.flash_on_rounded,
              color: _flashMode == FlashMode.off
                  ? Colors.white70
                  : QuantColors.moltenOrange,
              size: 22,
            ),
          ),
          IconButton(
            tooltip: 'Flip camera',
            onPressed: _toggleCamera,
            icon: const Icon(Icons.flip_camera_android_rounded,
                color: Colors.white70, size: 22),
          ),
        ],
      ),
    );
  }

  Widget _buildPreview() {
    if (_initializing) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: QuantColors.moltenOrange),
            SizedBox(height: 12),
            Text(
              'Starting camera…',
              style: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      );
    }
    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.videocam_off_rounded,
                  color: QuantColors.textMuted, size: 40),
              const SizedBox(height: 12),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: QuantColors.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: _initCamera,
                icon: const Icon(Icons.refresh_rounded, size: 16),
                label: const Text('Retry'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: QuantColors.moltenOrange,
                  side: const BorderSide(color: QuantColors.moltenOrange),
                ),
              ),
            ],
          ),
        ),
      );
    }
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const SizedBox.shrink();
    }
    return ClipRect(child: CameraPreview(controller));
  }

  Widget _buildCaptureBar() {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 22),
      color: Colors.black,
      child: Center(
        child: Semantics(
          label: 'Capture photo for ${widget.recipient.name}',
          button: true,
          child: GestureDetector(
            onTap: _capturePhoto,
            child: Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 4),
                color: _capturing
                    ? QuantColors.moltenOrange.withOpacity(0.5)
                    : Colors.transparent,
              ),
              child: Center(
                child: Container(
                  width: 56,
                  height: 56,
                  decoration: const BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildReview() {
    final photo = _capturedPhoto!;
    return Stack(
      fit: StackFit.expand,
      children: [
        Image.file(
          File(photo.path),
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => const Center(
            child: Text(
              'Could not load the captured photo.',
              style: TextStyle(color: QuantColors.textSecondary),
            ),
          ),
        ),
        Positioned(
          left: 16,
          right: 16,
          bottom: 24,
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => setState(() => _capturedPhoto = null),
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  label: const Text('Retake'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: Colors.white,
                    side: const BorderSide(color: Colors.white54),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton.icon(
                  onPressed: _confirmCapture,
                  icon: const Icon(Icons.send_rounded, size: 18),
                  label: const Text('Send snap'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: QuantColors.moltenOrange,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Positioned(
          left: 16,
          top: 12,
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Text(
              'To: ${widget.recipient.name}',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
