// Sovereign Quant Ecosystem - QuantChat HD WebRTC Call Sheet
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/chat_models.dart';
import '../screens/call_screen.dart';

/// Interactive HD WebRTC Audio & Video Call Bottom Sheet
/// Featuring:
/// - Connection-state badge (honest: calls cannot connect in this build)
/// - Mute mic toggle
/// - Speakerphone toggle
/// - Video camera toggle
/// - Camera flip toggle
/// - Fullscreen expansion to CallScreen
class WebRTCCallSheet extends StatefulWidget {
  final ChatConversation conversation;
  final QuantCallType callType;

  const WebRTCCallSheet({
    super.key,
    required this.conversation,
    required this.callType,
  });

  /// Static helper to summon the Sovereign Call Sheet
  static Future<void> show(
    BuildContext context, {
    required ChatConversation conversation,
    required QuantCallType callType,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => WebRTCCallSheet(
        conversation: conversation,
        callType: callType,
      ),
    );
  }

  @override
  State<WebRTCCallSheet> createState() => _WebRTCCallSheetState();
}

class _WebRTCCallSheetState extends State<WebRTCCallSheet> with SingleTickerProviderStateMixin {
  bool _isAudioMuted = false;
  bool _isSpeakerOn = true;
  late bool _isVideoEnabled;
  bool _isFrontCamera = true;

  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _isVideoEnabled = widget.callType == QuantCallType.video;

    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _pulseAnimation = Tween<double>(begin: 0.96, end: 1.08).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    // HONEST CALL STATE: no WebRTC stack is wired into this build, so no
    // connection is ever established here. This sheet previously simulated
    // a handshake (600ms timer -> "Connected" + a ticking duration and an
    // invented sub-18ms mesh latency claim). It now shows the truthful
    // unavailable state; the controls remain as chrome for the future real
    // implementation.
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _toggleMute() {
    setState(() {
      _isAudioMuted = !_isAudioMuted;
    });
  }

  void _toggleSpeaker() {
    setState(() {
      _isSpeakerOn = !_isSpeakerOn;
    });
  }

  void _toggleVideo() {
    setState(() {
      _isVideoEnabled = !_isVideoEnabled;
    });
  }

  void _switchCamera() {
    setState(() {
      _isFrontCamera = !_isFrontCamera;
    });
  }

  void _expandFullscreen() {
    Navigator.of(context).pop();
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          conversation: widget.conversation,
          callType: widget.callType,
        ),
      ),
    );
  }

  void _endCall() {
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final conv = widget.conversation;
    final isVideo = widget.callType == QuantCallType.video;

    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      decoration: BoxDecoration(
        color: const Color(0xFF0D1017),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        border: Border.all(color: QuantColors.hairlineBorder, width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.7),
            blurRadius: 28,
            offset: const Offset(0, -6),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Pull Handle
            Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(
                color: QuantColors.hairlineBorder,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 14),

            // Top connection-state badge
            _buildEncryptionBadge(),
            const SizedBox(height: 18),

            // Contact Avatar & Animated Calling Rings
            _buildAvatarStage(conv),
            const SizedBox(height: 14),

            // Contact Name
            Text(
              conv.name,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),

            // Call Status: no connection exists, and no telemetry is
            // measured, so the sheet says exactly that.
            const Text(
              'Calls are not available in this build yet',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 10),

            // Call Type Chip
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Text(
                isVideo ? 'Video call' : 'Voice call',
                style: const TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            const SizedBox(height: 22),

            // Interactive Controls Dock
            _buildCallControlsDock(isVideo),
          ],
        ),
      ),
    );
  }

  Widget _buildEncryptionBadge() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: QuantColors.sovereignCyan.withOpacity(0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: QuantColors.sovereignCyan.withOpacity(0.35)),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.lock_rounded, size: 12, color: QuantColors.sovereignCyan),
          SizedBox(width: 5),
          Text(
            'Not connected — no call is in progress',
            style: TextStyle(
              color: QuantColors.sovereignCyan,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAvatarStage(ChatConversation conv) {
    return AnimatedBuilder(
      animation: _pulseAnimation,
      builder: (context, child) {
        return Stack(
          alignment: Alignment.center,
          children: [
            // Outer Concentric Glow Ring (Zero clipPath)
            Container(
              width: 86 * _pulseAnimation.value,
              height: 86 * _pulseAnimation.value,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: conv.avatarColor.withOpacity(0.25),
                  width: 1.5,
                ),
              ),
            ),
            // Avatar Circle
            Container(
              width: 68,
              height: 68,
              decoration: BoxDecoration(
                color: conv.avatarColor.withOpacity(0.2),
                shape: BoxShape.circle,
                border: Border.all(color: conv.avatarColor, width: 2),
                boxShadow: [
                  BoxShadow(
                    color: conv.avatarColor.withOpacity(0.3),
                    blurRadius: 16,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: Center(
                child: Text(
                  conv.avatarInitials,
                  style: TextStyle(
                    color: conv.avatarColor,
                    fontSize: 26,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildCallControlsDock(bool isVideo) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
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

          // Camera Flip Toggle (if video)
          if (isVideo)
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

          // Expand to Fullscreen Call
          _buildControlButton(
            icon: Icons.fullscreen_rounded,
            isActive: true,
            activeColor: QuantColors.elevatedCard,
            activeIconColor: QuantColors.sovereignCyan,
            inactiveColor: QuantColors.elevatedCard,
            inactiveIconColor: Colors.white,
            tooltip: 'Expand Fullscreen Call',
            onPressed: _expandFullscreen,
          ),

          // Prominent End Call Button
          InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: _endCall,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: QuantColors.statusError,
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: QuantColors.statusError.withOpacity(0.4),
                    blurRadius: 10,
                    spreadRadius: 1,
                  ),
                ],
              ),
              child: const Icon(
                Icons.call_end_rounded,
                color: Colors.white,
                size: 22,
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
        borderRadius: BorderRadius.circular(18),
        onTap: onPressed,
        child: Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            color: isActive ? activeColor : inactiveColor,
            shape: BoxShape.circle,
            border: Border.all(color: QuantColors.hairlineBorder),
          ),
          child: Icon(
            icon,
            size: 18,
            color: isActive ? activeIconColor : inactiveIconColor,
          ),
        ),
      ),
    );
  }
}
