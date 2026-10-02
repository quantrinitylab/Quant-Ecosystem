// Sovereign Quant Ecosystem - QuantChat HD WebRTC Call Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/chat_models.dart';
import '../services/chat_mock_data.dart';

class CallScreen extends StatefulWidget {
  final ChatConversation conversation;
  final QuantCallType callType;

  const CallScreen({
    super.key,
    required this.conversation,
    required this.callType,
  });

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> with SingleTickerProviderStateMixin {
  late QuantCallType _activeCallType;
  QuantCallState _callState = QuantCallState.connecting;
  bool _isAudioMuted = false;
  bool _isVideoEnabled = true;
  bool _isFrontCamera = true;
  bool _isSpeakerOn = true;
  bool _isScreenSharing = false;
  bool _isGridView = false; // Grid view vs Spotlight + Floating participant grid
  int _durationSeconds = 0;
  Timer? _callTimer;
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late List<CallParticipant> _participants;
  late String _spotlightParticipantId;

  // Real-time WebRTC telemetry metrics
  final int _latencyMs = 18;
  final double _packetLoss = 0.0;
  final double _jitterMs = 1.1;

  @override
  void initState() {
    super.initState();
    _activeCallType = widget.callType;
    _isVideoEnabled = widget.callType == QuantCallType.video;
    _participants = List.from(ChatMockData.getInitialCallParticipants());
    _spotlightParticipantId = _participants.first.id;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.95, end: 1.15).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // Simulate WebRTC peer connection handshake
    Timer(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      setState(() {
        _callState = QuantCallState.connected;
      });
      _startTimer();
    });
  }

  @override
  void dispose() {
    _callTimer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  void _startTimer() {
    _callTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        _durationSeconds++;
      });
    });
  }

  String _formatDuration(int totalSecs) {
    final mins = (totalSecs ~/ 60).toString().padLeft(2, '0');
    final secs = (totalSecs % 60).toString().padLeft(2, '0');
    return '$mins:$secs';
  }

  void _toggleMute() {
    setState(() {
      _isAudioMuted = !_isAudioMuted;
      // Update local participant mute state
      final idx = _participants.indexWhere((p) => p.id == 'part-local-me');
      if (idx != -1) {
        _participants[idx] = _participants[idx].copyWith(isAudioMuted: _isAudioMuted);
      }
    });
  }

  void _toggleVideo() {
    setState(() {
      _isVideoEnabled = !_isVideoEnabled;
      final idx = _participants.indexWhere((p) => p.id == 'part-local-me');
      if (idx != -1) {
        _participants[idx] = _participants[idx].copyWith(isVideoEnabled: _isVideoEnabled);
      }
    });
  }

  void _switchCamera() {
    setState(() => _isFrontCamera = !_isFrontCamera);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 1),
        content: Text(
          _isFrontCamera ? 'Front Camera Active (1080p60)' : 'Rear Camera Active (4K30 HDR)',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _toggleSpeaker() {
    setState(() => _isSpeakerOn = !_isSpeakerOn);
  }

  void _toggleScreenShare() {
    setState(() {
      _isScreenSharing = !_isScreenSharing;
      final idx = _participants.indexWhere((p) => p.id == 'part-local-me');
      if (idx != -1) {
        _participants[idx] = _participants[idx].copyWith(isScreenSharing: _isScreenSharing);
      }
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Row(
          children: [
            Icon(
              _isScreenSharing ? Icons.screen_share_rounded : Icons.stop_screen_share_rounded,
              color: QuantColors.moltenOrange,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              _isScreenSharing
                  ? 'Screen Share Started: 1080p 60fps Impeller WebRTC Stream'
                  : 'Screen Share Stopped',
              style: const TextStyle(color: QuantColors.textPrimary),
            ),
          ],
        ),
      ),
    );
  }

  void _toggleGridLayout() {
    setState(() => _isGridView = !_isGridView);
  }

  void _selectSpotlight(String id) {
    setState(() => _spotlightParticipantId = id);
  }

  void _endCall() {
    _callTimer?.cancel();
    setState(() {
      _callState = QuantCallState.ended;
    });
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Stack(
          children: [
            // Stage View: Matrix Grid vs Spotlight + Floating Participant Grid
            if (_isGridView)
              _buildMatrixGridStage()
            else
              _buildSpotlightStage(),

            // Top Telemetry Header
            Positioned(
              top: 14,
              left: 14,
              right: 14,
              child: _buildTelemetryHeader(),
            ),

            // Floating Participant Grid Overlay (Spotlight View)
            if (!_isGridView)
              Positioned(
                top: 80,
                left: 14,
                right: 14,
                child: _buildFloatingParticipantStrip(),
              ),

            // Bottom Call Controls Dock
            Positioned(
              left: 16,
              right: 16,
              bottom: 22,
              child: _buildCallControlsDock(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTelemetryHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard.withOpacity(0.92),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.hairlineBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: _callState == QuantCallState.connected
                      ? QuantColors.statusSuccess
                      : QuantColors.statusWarning,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: (_callState == QuantCallState.connected
                              ? QuantColors.statusSuccess
                              : QuantColors.statusWarning)
                          .withOpacity(0.6),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                _callState == QuantCallState.connected
                    ? _formatDuration(_durationSeconds)
                    : 'Connecting WebRTC...',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'monospace',
                ),
              ),
              if (_isScreenSharing) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.moltenOrange.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: QuantColors.moltenOrange, width: 0.8),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.screen_share_rounded, size: 10, color: QuantColors.moltenOrange),
                      SizedBox(width: 3),
                      Text(
                        'SHARING',
                        style: TextStyle(
                          color: QuantColors.moltenOrange,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.statusSuccess.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.statusSuccess.withOpacity(0.4)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.bolt_rounded, size: 12, color: QuantColors.statusSuccess),
                    const SizedBox(width: 4),
                    Text(
                      '<$_latencyMs ms E2EE',
                      style: const TextStyle(
                        color: QuantColors.statusSuccess,
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Text(
                  'Loss: $_packetLoss% | ${_activeCallType == QuantCallType.video ? "VP9/1080p" : "Opus"}',
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// Horizontal floating participant strip above the spotlight stage
  Widget _buildFloatingParticipantStrip() {
    return SizedBox(
      height: 108,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _participants.length,
        separatorBuilder: (_, __) => const SizedBox(width: 10),
        itemBuilder: (context, idx) {
          final participant = _participants[idx];
          final isSelected = participant.id == _spotlightParticipantId;

          return InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => _selectSpotlight(participant.id),
            child: Container(
              width: 96,
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard.withOpacity(0.85),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSelected
                      ? QuantColors.moltenOrange
                      : (participant.isSpeaking
                          ? QuantColors.statusSuccess
                          : QuantColors.hairlineBorder),
                  width: isSelected || participant.isSpeaking ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.35),
                    blurRadius: 8,
                    offset: const Offset(0, 3),
                  ),
                ],
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Stack(
                    children: [
                      Container(
                        width: 44,
                        height: 44,
                        decoration: BoxDecoration(
                          color: participant.avatarColor.withOpacity(0.2),
                          shape: BoxShape.circle,
                          border: Border.all(color: participant.avatarColor, width: 1.5),
                        ),
                        child: Center(
                          child: Text(
                            participant.avatarInitials,
                            style: TextStyle(
                              color: participant.avatarColor,
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ),
                      ),
                      if (participant.isSpeaking)
                        Positioned(
                          right: 0,
                          bottom: 0,
                          child: Container(
                            width: 12,
                            height: 12,
                            decoration: BoxDecoration(
                              color: QuantColors.statusSuccess,
                              shape: BoxShape.circle,
                              border: Border.all(color: QuantColors.voidObsidian, width: 2),
                            ),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 5),
                  Text(
                    participant.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        participant.isAudioMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                        size: 10,
                        color: participant.isAudioMuted ? QuantColors.statusError : QuantColors.textMuted,
                      ),
                      const SizedBox(width: 3),
                      Text(
                        '${participant.latencyMs}ms',
                        style: const TextStyle(
                          fontSize: 9,
                          color: QuantColors.textMuted,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  /// Spotlight View (Active participant in main canvas)
  Widget _buildSpotlightStage() {
    final spotlight = _participants.firstWhere(
      (p) => p.id == _spotlightParticipantId,
      orElse: () => _participants.first,
    );

    if (_isScreenSharing && spotlight.id == 'part-local-me') {
      return _buildScreenShareStage();
    }

    if (_activeCallType == QuantCallType.video && spotlight.isVideoEnabled) {
      return _buildVideoSpotlightStage(spotlight);
    } else {
      return _buildAudioSpotlightStage(spotlight);
    }
  }

  Widget _buildScreenShareStage() {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFF0A0D14),
      padding: const EdgeInsets.only(top: 200, bottom: 120, left: 20, right: 20),
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: QuantColors.moltenOrange.withOpacity(0.5)),
            boxShadow: [
              BoxShadow(
                color: QuantColors.moltenOrange.withOpacity(0.15),
                blurRadius: 30,
                spreadRadius: 2,
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.screen_share_rounded, size: 54, color: QuantColors.moltenOrange),
              const SizedBox(height: 16),
              const Text(
                'Sovereign Desktop Stream Active',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Broadcasting 1080p 60fps Impeller WebRTC buffer to all peers.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Text(
                  'Zero-Cloud Relay · Hardware Keystore Encrypted',
                  style: TextStyle(
                    color: QuantColors.sovereignCyan,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildVideoSpotlightStage(CallParticipant spotlight) {
    return Container(
      width: double.infinity,
      height: double.infinity,
      color: const Color(0xFF0F121B),
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 60),
            Container(
              width: 110,
              height: 110,
              decoration: BoxDecoration(
                color: spotlight.avatarColor.withOpacity(0.2),
                shape: BoxShape.circle,
                border: Border.all(color: spotlight.avatarColor, width: 2.5),
                boxShadow: [
                  BoxShadow(
                    color: spotlight.avatarColor.withOpacity(0.3),
                    blurRadius: 20,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Center(
                child: Text(
                  spotlight.avatarInitials,
                  style: TextStyle(
                    color: spotlight.avatarColor,
                    fontSize: 42,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              spotlight.name,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                '${spotlight.videoResolution} · ${spotlight.frameRateFps}fps · Hardware Impeller Feed',
                style: const TextStyle(
                  fontSize: 12,
                  color: QuantColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAudioSpotlightStage(CallParticipant spotlight) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const SizedBox(height: 60),
          // Animated Concentric Pulsing Rings (Zero clipPath)
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Stack(
                alignment: Alignment.center,
                children: [
                  Container(
                    width: 180 * _pulseAnimation.value,
                    height: 180 * _pulseAnimation.value,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: spotlight.avatarColor.withOpacity(0.18),
                        width: 1.5,
                      ),
                    ),
                  ),
                  Container(
                    width: 140 * _pulseAnimation.value,
                    height: 140 * _pulseAnimation.value,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: spotlight.avatarColor.withOpacity(0.35),
                        width: 1.5,
                      ),
                    ),
                  ),
                  // Central Avatar
                  Container(
                    width: 104,
                    height: 104,
                    decoration: BoxDecoration(
                      color: spotlight.avatarColor.withOpacity(0.2),
                      shape: BoxShape.circle,
                      border: Border.all(color: spotlight.avatarColor, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: spotlight.avatarColor.withOpacity(0.3),
                          blurRadius: 24,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                    child: Center(
                      child: Text(
                        spotlight.avatarInitials,
                        style: TextStyle(
                          color: spotlight.avatarColor,
                          fontSize: 38,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
          const SizedBox(height: 28),
          Text(
            spotlight.name,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.lock_rounded, size: 14, color: QuantColors.sovereignCyan),
              const SizedBox(width: 6),
              Text(
                _callState == QuantCallState.connected
                    ? 'Encrypted WebRTC Audio Channel (Opus 48kHz)'
                    : 'Establishing Peer Connection...',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: QuantColors.sovereignCyan,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// 2x2 Matrix Participant Grid
  Widget _buildMatrixGridStage() {
    return Container(
      padding: const EdgeInsets.only(top: 80, bottom: 100, left: 12, right: 12),
      child: GridView.builder(
        itemCount: _participants.length,
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          crossAxisSpacing: 10,
          mainAxisSpacing: 10,
          childAspectRatio: 0.85,
        ),
        itemBuilder: (context, idx) {
          final participant = _participants[idx];
          return _buildGridParticipantTile(participant);
        },
      ),
    );
  }

  Widget _buildGridParticipantTile(CallParticipant participant) {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: participant.isSpeaking ? QuantColors.statusSuccess : QuantColors.hairlineBorder,
          width: participant.isSpeaking ? 2 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Stack(
        children: [
          Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: participant.avatarColor.withOpacity(0.2),
                    shape: BoxShape.circle,
                    border: Border.all(color: participant.avatarColor, width: 1.5),
                  ),
                  child: Center(
                    child: Text(
                      participant.avatarInitials,
                      style: TextStyle(
                        color: participant.avatarColor,
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  participant.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${participant.videoResolution} · ${participant.frameRateFps}fps',
                  style: const TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),

          // Bottom Bar in Tile
          Positioned(
            left: 8,
            right: 8,
            bottom: 8,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Icon(
                      participant.isAudioMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                      size: 13,
                      color: participant.isAudioMuted ? QuantColors.statusError : Colors.white,
                    ),
                    if (participant.isScreenSharing) ...[
                      const SizedBox(width: 4),
                      const Icon(Icons.screen_share_rounded, size: 13, color: QuantColors.moltenOrange),
                    ],
                  ],
                ),
                Text(
                  '${participant.latencyMs}ms',
                  style: const TextStyle(
                    color: QuantColors.statusSuccess,
                    fontSize: 10,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// Call Controls Dock (with Mute mic, Camera, Switch camera, Screen share, Layout toggle, End call)
  Widget _buildCallControlsDock() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard.withOpacity(0.95),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: QuantColors.hairlineBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.5),
            blurRadius: 20,
            spreadRadius: 2,
          ),
        ],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          // Audio Mute Toggle
          _buildControlButton(
            icon: _isAudioMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
            isActive: !_isAudioMuted,
            activeColor: QuantColors.elevatedCard,
            activeIconColor: Colors.white,
            inactiveColor: QuantColors.statusError.withOpacity(0.2),
            inactiveIconColor: QuantColors.statusError,
            tooltip: 'Mute/Unmute Mic',
            onPressed: _toggleMute,
          ),

          // Speakerphone Toggle
          _buildControlButton(
            icon: _isSpeakerOn ? Icons.volume_up_rounded : Icons.volume_off_rounded,
            isActive: _isSpeakerOn,
            activeColor: QuantColors.elevatedCard,
            activeIconColor: Colors.white,
            inactiveColor: QuantColors.elevatedCard,
            inactiveIconColor: QuantColors.textMuted,
            tooltip: 'Toggle Speaker',
            onPressed: _toggleSpeaker,
          ),

          // Video Camera Toggle
          _buildControlButton(
            icon: _isVideoEnabled ? Icons.videocam_rounded : Icons.videocam_off_rounded,
            isActive: _isVideoEnabled,
            activeColor: QuantColors.elevatedCard,
            activeIconColor: Colors.white,
            inactiveColor: QuantColors.elevatedCard,
            inactiveIconColor: QuantColors.textMuted,
            tooltip: 'Toggle Camera',
            onPressed: _toggleVideo,
          ),

          // Switch Camera Toggle
          if (_activeCallType == QuantCallType.video)
            _buildControlButton(
              icon: Icons.flip_camera_ios_rounded,
              isActive: true,
              activeColor: QuantColors.elevatedCard,
              activeIconColor: Colors.white,
              inactiveColor: QuantColors.elevatedCard,
              inactiveIconColor: QuantColors.textMuted,
              tooltip: 'Switch Camera',
              onPressed: _switchCamera,
            ),

          // Screen Share Toggle
          _buildControlButton(
            icon: _isScreenSharing ? Icons.stop_screen_share_rounded : Icons.screen_share_rounded,
            isActive: _isScreenSharing,
            activeColor: QuantColors.moltenOrange,
            activeIconColor: Colors.white,
            inactiveColor: QuantColors.elevatedCard,
            inactiveIconColor: Colors.white,
            tooltip: 'Toggle Screen Share',
            onPressed: _toggleScreenShare,
          ),

          // Floating Grid / Matrix Layout Toggle
          _buildControlButton(
            icon: _isGridView ? Icons.view_sidebar_rounded : Icons.grid_view_rounded,
            isActive: _isGridView,
            activeColor: QuantColors.sovereignCyan,
            activeIconColor: QuantColors.voidObsidian,
            inactiveColor: QuantColors.elevatedCard,
            inactiveIconColor: Colors.white,
            tooltip: 'Toggle Grid / Floating Layout',
            onPressed: _toggleGridLayout,
          ),

          // Prominent End Call Button
          InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: _endCall,
            child: Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: QuantColors.statusError,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.statusError.withOpacity(0.4),
                    blurRadius: 12,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: const Icon(
                Icons.call_end_rounded,
                color: Colors.white,
                size: 24,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required bool isActive,
    required Color activeColor,
    required Color activeIconColor,
    required Color inactiveColor,
    required Color inactiveIconColor,
    required String tooltip,
    required VoidCallback onPressed,
  }) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onPressed,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: isActive ? activeColor : inactiveColor,
            shape: BoxShape.circle,
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Icon(
            icon,
            size: 20,
            color: isActive ? activeIconColor : inactiveIconColor,
          ),
        ),
      ),
    );
  }
}
