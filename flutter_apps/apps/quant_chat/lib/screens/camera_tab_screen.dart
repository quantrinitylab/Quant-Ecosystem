// Sovereign Quant Ecosystem - QuantChat Camera Tab (capture surface)
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).
// Phase 1A draft + B-recon deltas (reviewed against quant_theme tokens,
// all QuantColors names verified against quant_theme.dart):
// - TAP capture ring = photo; LONG-PRESS ring = video recording.
//   The Photo/Video toggle stays as an alternative ergonomics path.
// - Recording state: top-center tabular timer + accent progress arc around
//   the ring + stop square inside the ring; tap ring to stop.
// - Video stops go to a dark post-record interstitial (Undo / Preview);
//   photos still enter the editor directly.

import 'dart:async';
import 'dart:math';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';

import 'capture_review_screen.dart';
import 'snap_editor_screen.dart';

/// Capture mode for the camera tab.
enum CameraCaptureMode { photo, video }

/// Full-screen camera tab: live preview, labelled tools, one-handed capture.
///
/// Video captures pass through [CaptureReviewScreen] (Undo / Preview) before
/// the editor; photos go to [SnapEditorScreen] directly. The editor pops a
/// [SnapSendResult], which is forwarded through [onSnapReady] when provided.
/// Send-to-backend wiring is a later phase; see the TODO in
/// [_handleCapturedFile].
class CameraTabScreen extends StatefulWidget {
  final List<SnapRecipient> recipients;
  final ValueChanged<SnapSendResult>? onSnapReady;

  const CameraTabScreen({
    super.key,
    this.recipients = const [],
    this.onSnapReady,
  });

  @override
  State<CameraTabScreen> createState() => _CameraTabScreenState();
}

class _CameraTabScreenState extends State<CameraTabScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription> _cameras = const [];
  bool _initializing = true;
  String? _errorMessage;

  CameraCaptureMode _mode = CameraCaptureMode.photo;
  FlashMode _flashMode = FlashMode.off;
  bool _isRecording = false;

  /// Recording timer state. The arc progress is seconds / max seconds.
  Timer? _recordingTimer;
  int _recordingSeconds = 0;
  static const int _maxRecordingSeconds = 60;

  // Effects-tray state.
  bool _gridEnabled = false;
  bool _shutterTimerEnabled = false;

  /// Recently used tool labels, most-recent first (in-memory only).
  final List<String> _recentTools = <String>[];

  /// First-use face-guide overlay flag: shown once per app session.
  /// TODO: persist with shared_preferences so it survives app restarts.
  static bool _faceGuideShown = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeCamera();
  }

  @override
  void dispose() {
    _recordingTimer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Release the camera when the app is backgrounded so other apps can
    // use it, and re-acquire it on resume.
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      if (_isRecording) {
        _recordingTimer?.cancel();
        _recordingTimer = null;
        _isRecording = false;
        _recordingSeconds = 0;
      }
      unawaited(controller.dispose());
      _controller = null;
    } else if (state == AppLifecycleState.resumed) {
      _initializeCamera();
    }
  }

  Future<void> _initializeCamera({CameraDescription? description}) async {
    if (!mounted) return;
    setState(() {
      _initializing = true;
      _errorMessage = null;
    });
    try {
      if (_cameras.isEmpty) {
        _cameras = await availableCameras();
      }
      if (_cameras.isEmpty) {
        throw CameraException(
          'NoCameraFound',
          'No cameras were found on this device.',
        );
      }
      final selected = description ??
          _cameras.firstWhere(
            (c) => c.lensDirection == CameraLensDirection.back,
            orElse: () => _cameras.first,
          );
      final controller = CameraController(
        selected,
        ResolutionPreset.high,
        enableAudio: true,
      );
      await _controller?.dispose();
      _controller = controller;
      await controller.initialize();
      await controller.setFlashMode(_flashMode);
      if (!mounted) return;
      setState(() => _initializing = false);
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _errorMessage = e.code == 'CameraAccessDenied'
            ? 'Camera access was denied. QuantChat needs camera permission '
                'to show the viewfinder.'
            : 'Camera unavailable (${e.code}). ${e.description ?? ''}'.trim();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _initializing = false;
        _errorMessage = 'Camera could not start: $e';
      });
    }
  }

  Future<void> _flipCamera() async {
    if (_isRecording) {
      _showMessage('Stop the recording before flipping the camera.');
      return;
    }
    final controller = _controller;
    if (controller == null || _cameras.length < 2) {
      _showMessage('Only one camera is available on this device.');
      return;
    }
    final nextDirection =
        controller.description.lensDirection == CameraLensDirection.back
            ? CameraLensDirection.front
            : CameraLensDirection.back;
    final next = _cameras.firstWhere(
      (c) => c.lensDirection == nextDirection,
      orElse: () => _cameras.first,
    );
    _markToolUsed('Flip');
    await _initializeCamera(description: next);
  }

  Future<void> _cycleFlash() async {
    final controller = _controller;
    if (controller == null) return;
    final next = _flashMode == FlashMode.off
        ? FlashMode.auto
        : _flashMode == FlashMode.auto
            ? FlashMode.always
            : FlashMode.off;
    try {
      await controller.setFlashMode(next);
    } on CameraException catch (e) {
      _showMessage('Flash unavailable: ${e.description ?? e.code}');
      return;
    }
    setState(() => _flashMode = next);
    _markToolUsed('Flash');
  }

  String get _flashLabel {
    switch (_flashMode) {
      case FlashMode.off:
        return 'Flash Off';
      case FlashMode.auto:
        return 'Flash Auto';
      case FlashMode.always:
        return 'Flash On';
      case FlashMode.torch:
        return 'Torch';
    }
  }

  /// Tap the ring: photo in photo mode, start/stop video in video mode,
  /// stop when a recording is running.
  Future<void> _onCaptureTap() async {
    if (_isRecording) {
      await _stopRecording();
      return;
    }
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    try {
      if (_mode == CameraCaptureMode.video) {
        await _startRecording();
      } else {
        // TODO: implement the 3s countdown shutter overlay when
        // _shutterTimerEnabled is true (see Effects tray).
        final file = await controller.takePicture();
        _markToolUsed('Photo');
        await _handleCapturedFile(file.path, isVideo: false);
      }
    } on CameraException catch (e) {
      _showMessage('Capture failed: ${e.description ?? e.code}');
    }
  }

  /// Long-press the ring: start a video recording in either mode.
  Future<void> _onCaptureLongPress() async {
    if (_isRecording) return;
    await _startRecording();
  }

  Future<void> _startRecording() async {
    final controller = _controller;
    if (controller == null ||
        !controller.value.isInitialized ||
        _isRecording) {
      return;
    }
    try {
      await controller.startVideoRecording();
      _recordingTimer?.cancel();
      _recordingSeconds = 0;
      _recordingTimer =
          Timer.periodic(const Duration(seconds: 1), (timer) async {
        if (!mounted) {
          timer.cancel();
          return;
        }
        if (_recordingSeconds + 1 >= _maxRecordingSeconds) {
          // TODO: surface a "max length reached" hint when stopping here.
          await _stopRecording();
        } else {
          setState(() => _recordingSeconds++);
        }
      });
      setState(() => _isRecording = true);
      _markToolUsed('Video');
    } on CameraException catch (e) {
      _showMessage('Recording failed: ${e.description ?? e.code}');
    }
  }

  Future<void> _stopRecording() async {
    final controller = _controller;
    _recordingTimer?.cancel();
    _recordingTimer = null;
    if (controller == null || !_isRecording) return;
    try {
      final file = await controller.stopVideoRecording();
      final durationSeconds = _recordingSeconds;
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _recordingSeconds = 0;
      });
      await _handleCapturedFile(
        file.path,
        isVideo: true,
        durationSeconds: durationSeconds,
      );
    } on CameraException catch (e) {
      if (!mounted) return;
      setState(() {
        _isRecording = false;
        _recordingSeconds = 0;
      });
      _showMessage('Recording failed: ${e.description ?? e.code}');
    }
  }

  String get _recordingLabel =>
      '0:${_recordingSeconds.toString().padLeft(2, '0')}';

  Future<void> _handleCapturedFile(
    String path, {
    required bool isVideo,
    int durationSeconds = 0,
  }) async {
    final SnapSendResult? result;
    if (isVideo) {
      // Post-record interstitial: Undo / Preview before the editor.
      result = await Navigator.of(context).push<SnapSendResult>(
        MaterialPageRoute(
          builder: (_) => CaptureReviewScreen(
            filePath: path,
            durationSeconds: durationSeconds,
            recipients: widget.recipients,
          ),
        ),
      );
    } else {
      result = await Navigator.of(context).push<SnapSendResult>(
        MaterialPageRoute(
          builder: (_) => SnapEditorScreen(
            capturedFilePath: path,
            isVideo: false,
            recipients: widget.recipients,
          ),
        ),
      );
    }
    if (result == null || !mounted) return;
    // TODO: hand the SnapSendResult to the chat send pipeline
    // (upload + disappearing-message scheduling) once it exists.
    if (widget.onSnapReady != null) {
      widget.onSnapReady!(result);
    } else {
      _showMessage('Snap prepared (${result.expiry.sendPhrase}).');
    }
  }

  void _markToolUsed(String label) {
    setState(() {
      _recentTools.remove(label);
      _recentTools.insert(0, label);
      if (_recentTools.length > 6) _recentTools.removeLast();
    });
  }

  void _runRecentTool(String label) {
    switch (label) {
      case 'Photo':
        setState(() => _mode = CameraCaptureMode.photo);
        break;
      case 'Video':
        setState(() => _mode = CameraCaptureMode.video);
        break;
      case 'Flip':
        _flipCamera();
        break;
      case 'Flash':
        _cycleFlash();
        break;
      case 'Effects':
        _openEffectsTray();
        break;
    }
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

  void _openEffectsTray() {
    _markToolUsed('Effects');
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (ctx) {
        bool grid = _gridEnabled;
        bool timer = _shutterTimerEnabled;
        return StatefulBuilder(
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
                  'EFFECTS',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 8),
                _buildEffectToggle(
                  title: 'Grid',
                  subtitle: 'Rule-of-thirds composition overlay',
                  icon: Icons.grid_3x3_rounded,
                  value: grid,
                  onChanged: (v) {
                    setSheetState(() => grid = v);
                    setState(() => _gridEnabled = v);
                  },
                ),
                _buildEffectToggle(
                  title: 'Shutter timer',
                  subtitle: '3s countdown before capture (not implemented yet)',
                  icon: Icons.timer_rounded,
                  value: timer,
                  onChanged: (v) {
                    setSheetState(() => timer = v);
                    setState(() => _shutterTimerEnabled = v);
                  },
                ),
                // TODO: lens/filter carousel backed by GPU image filters.
                _buildStubRow(
                  icon: Icons.filter_vintage_rounded,
                  title: 'Filters',
                  subtitle: 'Color looks for your snap',
                ),
                // TODO: 120fps slow-motion capture where the device supports it.
                _buildStubRow(
                  icon: Icons.slow_motion_video_rounded,
                  title: 'Slow motion',
                  subtitle: 'High-frame-rate video capture',
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildEffectToggle({
    required String title,
    required String subtitle,
    required IconData icon,
    required bool value,
    required ValueChanged<bool> onChanged,
  }) {
    return SwitchListTile(
      value: value,
      onChanged: onChanged,
      activeColor: QuantColors.neonGreen,
      contentPadding: EdgeInsets.zero,
      title: Text(
        title,
        style: const TextStyle(
          color: QuantColors.textPrimary,
          fontSize: 14,
          fontWeight: FontWeight.w600,
        ),
      ),
      subtitle: Text(
        subtitle,
        style: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
      ),
      secondary: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(icon, color: QuantColors.neonGreen, size: 20),
      ),
    );
  }

  Widget _buildStubRow({
    required IconData icon,
    required String title,
    required String subtitle,
  }) {
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(child: _buildPreviewArea()),
          if (_gridEnabled && _errorMessage == null)
            const Positioned.fill(
              child: IgnorePointer(child: CustomPaint(painter: _GridPainter())),
            ),
          Positioned(top: 0, left: 0, right: 0, child: _buildTopChrome()),
          if (_isRecording) _buildRecordingTimer(),
          if (_recentTools.isNotEmpty && !_isRecording)
            Positioned(
              top: 92,
              left: 0,
              right: 0,
              child: _buildRecentToolsRow(),
            ),
          if (!_initializing &&
              _errorMessage == null &&
              !_faceGuideShown &&
              _controller?.value.isInitialized == true)
            Positioned.fill(child: _buildFaceGuideOverlay()),
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildBottomControls(),
          ),
        ],
      ),
    );
  }

  /// Top-center recording timer with tabular numerals, shown while
  /// a video is being recorded.
  Widget _buildRecordingTimer() {
    return Positioned(
      top: 60,
      left: 0,
      right: 0,
      child: Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.55),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.fiber_manual_record_rounded,
                color: QuantColors.statusError,
                size: 10,
              ),
              const SizedBox(width: 8),
              Text(
                _recordingLabel,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPreviewArea() {
    if (_initializing) {
      return const Center(
        child: CircularProgressIndicator(color: QuantColors.neonGreen),
      );
    }
    if (_errorMessage != null) {
      return _buildErrorView();
    }
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) {
      return const SizedBox.shrink();
    }
    // Cover the full tab area with the sensor feed.
    final previewSize = controller.value.previewSize;
    if (previewSize == null) {
      return CameraPreview(controller);
    }
    return FittedBox(
      fit: BoxFit.cover,
      child: SizedBox(
        width: previewSize.height,
        height: previewSize.width,
        child: CameraPreview(controller),
      ),
    );
  }

  Widget _buildErrorView() {
    return Container(
      color: QuantColors.voidObsidian,
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.videocam_off_rounded,
            color: QuantColors.textMuted,
            size: 56,
          ),
          const SizedBox(height: 16),
          const Text(
            'Camera unavailable',
            style: TextStyle(
              color: QuantColors.textPrimary,
              fontSize: 18,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _errorMessage ?? 'Something went wrong.',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: QuantColors.textSecondary,
              fontSize: 13,
            ),
          ),
          const SizedBox(height: 8),
          // Hint only: a real deep-link needs the app_settings plugin.
          // TODO: add app_settings and wire a real "Open Settings" button.
          const Text(
            'Hint: open system Settings, find QuantChat, allow camera '
            'access, then tap Retry.',
            textAlign: TextAlign.center,
            style: TextStyle(color: QuantColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: () => _initializeCamera(),
            style: OutlinedButton.styleFrom(
              foregroundColor: QuantColors.neonGreen,
              side: const BorderSide(color: QuantColors.neonGreen),
            ),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }

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
              _buildLabelledTool(
                icon: _flashMode == FlashMode.off
                    ? Icons.flash_off_rounded
                    : Icons.flash_on_rounded,
                label: _flashLabel,
                isActive: _flashMode != FlashMode.off,
                onTap: _cycleFlash,
              ),
              const Spacer(),
              _buildLabelledTool(
                icon: Icons.auto_awesome_rounded,
                label: 'Effects',
                onTap: _openEffectsTray,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRecentToolsRow() {
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: _recentTools.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (ctx, i) {
          final label = _recentTools[i];
          return InkWell(
            onTap: () => _runRecentTool(label),
            borderRadius: BorderRadius.circular(20),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.55),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildFaceGuideOverlay() {
    return Stack(
      children: [
        const Positioned.fill(
          child: CustomPaint(painter: _FaceGuidePainter()),
        ),
        Positioned(
          left: 32,
          right: 32,
          bottom: 170,
          child: Column(
            children: [
              const Text(
                'Center your face in the oval',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'Hold the phone at arm\'s length for the best snap framing.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => setState(() => _faceGuideShown = true),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.neonGreen,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text('Got it'),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBottomControls() {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black.withOpacity(0.75), Colors.transparent],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildModeToggle(),
          const SizedBox(height: 18),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _buildLabelledTool(
                icon: Icons.flip_camera_ios_rounded,
                label: 'Flip',
                onTap: _flipCamera,
              ),
              _buildCaptureButton(),
              // Balances the Flip button so the capture stays centered
              // and reachable with one thumb.
              const SizedBox(width: 56),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildModeToggle() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _buildModePill('Photo', CameraCaptureMode.photo),
          _buildModePill('Video', CameraCaptureMode.video),
        ],
      ),
    );
  }

  Widget _buildModePill(String label, CameraCaptureMode mode) {
    final selected = _mode == mode;
    return GestureDetector(
      onTap: () {
        if (_isRecording) return;
        setState(() => _mode = mode);
        _markToolUsed(label);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? QuantColors.neonGreen : Colors.transparent,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : QuantColors.textSecondary,
            fontSize: 13,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  /// Capture ring: tap = photo (or start/stop video), long-press = video.
  /// While recording, an accent progress arc wraps the ring and a stop
  /// square sits inside it.
  Widget _buildCaptureButton() {
    return GestureDetector(
      onTap: _onCaptureTap,
      onLongPress: _onCaptureLongPress,
      child: SizedBox(
        width: 92,
        height: 92,
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (_isRecording)
              CustomPaint(
                size: const Size(92, 92),
                painter: _RecordingArcPainter(
                  progress: _recordingSeconds / _maxRecordingSeconds,
                ),
              )
            else
              Container(
                width: 78,
                height: 78,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: QuantColors.neonGreen,
                    width: 4,
                  ),
                ),
              ),
            if (_isRecording)
              // Stop square: tapping it stops the recording.
              Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(7),
                ),
              )
            else
              Container(
                width: 62,
                height: 62,
                decoration: const BoxDecoration(
                  color: Colors.white,
                  shape: BoxShape.circle,
                ),
              ),
          ],
        ),
      ),
    );
  }

  /// Labelled tool button: icon + text label, never icon-only.
  Widget _buildLabelledTool({
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isActive = false,
  }) {
    final color = isActive ? QuantColors.neonGreen : Colors.white;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
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
}

/// Progress arc around the capture ring while recording.
/// Uses drawArc only - no clipPath calls.
class _RecordingArcPainter extends CustomPainter {
  final double progress;

  const _RecordingArcPainter({required this.progress});

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 5;
    final track = Paint()
      ..color = Colors.white.withOpacity(0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5;
    canvas.drawCircle(center, radius, track);
    final arc = Paint()
      ..color = QuantColors.statusError
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..strokeCap = StrokeCap.round;
    final sweep = progress.clamp(0.0, 1.0) * 2 * pi;
    if (sweep > 0) {
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        -pi / 2,
        sweep,
        false,
        arc,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _RecordingArcPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

/// First-use overlay painter: dimmed scrim with an oval face guide.
/// Uses drawPath only - no clipPath calls.
class _FaceGuidePainter extends CustomPainter {
  const _FaceGuidePainter();

  @override
  void paint(Canvas canvas, Size size) {
    final ovalRect = Rect.fromCenter(
      center: Offset(size.width / 2, size.height * 0.42),
      width: size.width * 0.62,
      height: size.height * 0.32,
    );
    final scrim = Path()
      ..addRect(Rect.fromLTWH(0, 0, size.width, size.height))
      ..addOval(ovalRect)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(scrim, Paint()..color = Colors.black.withOpacity(0.55));
    canvas.drawOval(
      ovalRect,
      Paint()
        ..color = QuantColors.neonGreen
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.5,
    );
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

/// Rule-of-thirds composition grid painter.
class _GridPainter extends CustomPainter {
  const _GridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.35)
      ..strokeWidth = 1;
    for (var i = 1; i < 3; i++) {
      final dx = size.width * i / 3;
      canvas.drawLine(Offset(dx, 0), Offset(dx, size.height), paint);
      final dy = size.height * i / 3;
      canvas.drawLine(Offset(0, dy), Offset(size.width, dy), paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
