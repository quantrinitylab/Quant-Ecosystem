import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/calendar_models.dart';

/// QuantMeet Launcher Screen - Sovereign HD Video Meeting Launcher
///
/// Features prominent molten action card ('[Start Instant Meeting]'),
/// upcoming scheduled video calls list, WebRTC hardware readiness status
/// ('Mic: Ready · Camera: Ready · AV1 120Hz Hardware-Accelerated'),
/// and room code direct-join input.
/// Strictly ZERO raw Unicode emojis and ZERO Skia clipPath calls.
class QuantMeetLauncherScreen extends StatefulWidget {
  const QuantMeetLauncherScreen({super.key});

  @override
  State<QuantMeetLauncherScreen> createState() => _QuantMeetLauncherScreenState();
}

class _QuantMeetLauncherScreenState extends State<QuantMeetLauncherScreen> {
  late List<MeetingCall> _upcomingCalls;
  final TextEditingController _roomCodeController = TextEditingController();

  bool _isMicReady = true;
  bool _isCamReady = true;
  bool _isHardwareAccelerated = true;
  bool _isMicMuted = false;
  bool _isCamOff = false;

  @override
  void initState() {
    super.initState();
    _upcomingCalls = MeetingCall.sampleCalls();
  }

  @override
  void dispose() {
    _roomCodeController.dispose();
    super.dispose();
  }

  void _startInstantMeeting() {
    final roomCode = 'qm-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';
    _showInMeetingDialog('Instant Sovereign Meeting', roomCode);
  }

  void _joinWithCode() {
    final code = _roomCodeController.text.trim();
    if (code.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          backgroundColor: QuantColors.statusError,
          content: Text('Please enter a valid QuantMeet room code or link.'),
        ),
      );
      return;
    }
    _showInMeetingDialog('Meeting Room: $code', code);
  }

  void _showInMeetingDialog(String title, String roomCode) {
    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: QuantColors.darkSlateCard,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: QuantColors.hairlineBorder),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: QuantColors.sunsetGold.withOpacity(0.16),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: QuantColors.sunsetGold.withOpacity(0.4)),
                ),
                child: const Icon(Icons.videocam_rounded, size: 32, color: QuantColors.sunsetGold),
              ),
              const SizedBox(height: 16),
              Text(title, style: QuantTypography.titleMedium, textAlign: TextAlign.center),
              const SizedBox(height: 6),
              Text('Room: $roomCode · E2EE Signal WebRTC Active', style: QuantTypography.bodySmall),
              const SizedBox(height: 16),

              // Mock Active Stream Container
              Container(
                height: 120,
                width: double.infinity,
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _isCamOff ? Icons.videocam_off_rounded : Icons.account_circle_rounded,
                          size: 40,
                          color: QuantColors.sunsetGold,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          _isCamOff ? 'Video Muted' : 'Impeller AV1 1080p60 Stream Active',
                          style: QuantTypography.microCapsule.copyWith(color: QuantColors.textSecondary),
                        ),
                      ],
                    ),
                    Positioned(
                      bottom: 8,
                      left: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: QuantColors.darkSlateCard,
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text(
                          _isMicMuted ? 'Muted' : 'Opus 48kHz Active',
                          style: QuantTypography.labelSpeed.copyWith(
                            fontSize: 9,
                            color: _isMicMuted ? QuantColors.statusError : QuantColors.statusSuccess,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Leave Stage', style: TextStyle(color: QuantColors.statusError)),
            ),
          ],
        );
      },
    );
  }

  void _copyMeetingLink(String roomCode) {
    final link = 'https://meet.quantrinity.in/$roomCode';
    Clipboard.setData(ClipboardData(text: link));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Row(
          children: [
            const Icon(Icons.link_rounded, color: QuantColors.sunsetGold, size: 18),
            const SizedBox(width: 8),
            Text('Meeting link copied: $link', style: const TextStyle(color: QuantColors.textPrimary)),
          ],
        ),
        duration: const Duration(seconds: 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Hardware Readiness Status Strip
              _buildHardwareStatusStrip(),

              const SizedBox(height: 14),

              // Prominent Molten Instant Meeting Action Card
              _buildInstantMeetingCard(),

              const SizedBox(height: 16),

              // Pre-Flight Device Toggles (Mic / Cam quick toggle)
              _buildPreflightControls(),

              const SizedBox(height: 18),

              // Join Room by Code Row
              _buildJoinByCodeRow(),

              const SizedBox(height: 24),

              // Upcoming Scheduled Video Calls Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'UPCOMING VIDEO STAGES',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.6,
                      color: QuantColors.textMuted,
                    ),
                  ),
                  QuantBadge(
                    label: '${_upcomingCalls.length} SCHEDULED',
                    variant: QuantBadgeVariant.amber,
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Upcoming Calls List
              ListView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _upcomingCalls.length,
                itemBuilder: (context, index) {
                  return _buildUpcomingCallCard(_upcomingCalls[index]);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHardwareStatusStrip() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: QuantColors.statusSuccess,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'WebRTC Hardware Status: Mic: Ready · Camera: Ready',
                  style: QuantTypography.bodySmall.copyWith(
                    fontWeight: FontWeight.w700,
                    color: QuantColors.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'AV1 Hardware Encode · Opus 48kHz Beamforming · <12ms Jitter',
                  style: QuantTypography.microCapsule.copyWith(
                    color: QuantColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const QuantBadge(
            label: '120Hz AV1',
            variant: QuantBadgeVariant.cyan,
            leadingIcon: Icons.speed_rounded,
          ),
        ],
      ),
    );
  }

  Widget _buildInstantMeetingCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            QuantColors.sunsetGold.withOpacity(0.95),
            QuantColors.moltenAmber,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
            color: QuantColors.sunsetGold.withOpacity(0.35),
            blurRadius: 20,
            spreadRadius: 2,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.voidObsidian.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.bolt_rounded, size: 14, color: Colors.white),
                    SizedBox(width: 4),
                    Text(
                      'INSTANT QUANTMEET',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                        color: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.shield_outlined, color: Colors.white, size: 18),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Host Sovereign HD Video Stage',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.5,
              color: QuantColors.voidObsidian,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'Up to 100 participants with Zero-Knowledge E2EE, AI live transcription, and sub-10ms audio.',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: QuantColors.voidObsidian,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: SquircleButton(
                  label: 'Start Instant Meeting',
                  icon: Icons.videocam_rounded,
                  height: 48,
                  backgroundColor: QuantColors.voidObsidian,
                  textColor: QuantColors.sunsetGold,
                  onPressed: _startInstantMeeting,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: SquircleButton(
                  label: 'Copy Link',
                  icon: Icons.link_rounded,
                  height: 48,
                  backgroundColor: QuantColors.voidObsidian.withOpacity(0.15),
                  textColor: QuantColors.voidObsidian,
                  border: BorderSide(color: QuantColors.voidObsidian.withOpacity(0.3)),
                  onPressed: () {
                    final defaultCode = 'qm-${DateTime.now().millisecondsSinceEpoch.toString().substring(7)}';
                    _copyMeetingLink(defaultCode);
                  },
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPreflightControls() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.hairlineBorder),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildPreflightItem(
            label: _isMicMuted ? 'Mic Muted' : 'Mic On',
            icon: _isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
            isActive: !_isMicMuted,
            onTap: () => setState(() => _isMicMuted = !_isMicMuted),
          ),
          Container(width: 1, height: 28, color: QuantColors.hairlineBorder),
          _buildPreflightItem(
            label: _isCamOff ? 'Cam Off' : 'Cam On',
            icon: _isCamOff ? Icons.videocam_off_rounded : Icons.videocam_rounded,
            isActive: !_isCamOff,
            onTap: () => setState(() => _isCamOff = !_isCamOff),
          ),
          Container(width: 1, height: 28, color: QuantColors.hairlineBorder),
          _buildPreflightItem(
            label: 'Noise Suppress',
            icon: Icons.graphic_eq_rounded,
            isActive: true,
            onTap: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildPreflightItem({
    required String label,
    required IconData icon,
    required bool isActive,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Row(
        children: [
          Icon(
            icon,
            size: 16,
            color: isActive ? QuantColors.sunsetGold : QuantColors.statusError,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isActive ? QuantColors.textPrimary : QuantColors.statusError,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildJoinByCodeRow() {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: _roomCodeController,
            style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
            decoration: InputDecoration(
              hintText: 'Enter room code (e.g. swarm-76)',
              hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 12),
              prefixIcon: const Icon(Icons.dialpad_rounded, color: QuantColors.textSecondary, size: 18),
              filled: true,
              fillColor: QuantColors.darkSlateCard,
              contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: QuantColors.hairlineBorder),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: QuantColors.hairlineBorder),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: const BorderSide(color: QuantColors.sunsetGold),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        SquircleButton(
          label: 'Join',
          height: 48,
          backgroundColor: QuantColors.darkSlateCard,
          textColor: QuantColors.sunsetGold,
          border: const BorderSide(color: QuantColors.sunsetGold, width: 1.2),
          onPressed: _joinWithCode,
        ),
      ],
    );
  }

  Widget _buildUpcomingCallCard(MeetingCall call) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: FrostedCard(
        borderRadius: 16,
        padding: const EdgeInsets.all(16),
        borderColor: call.isLiveNow ? QuantColors.sunsetGold.withOpacity(0.6) : QuantColors.hairlineBorder,
        backgroundColor: QuantColors.darkSlateCard,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                if (call.isLiveNow)
                  const QuantBadge(
                    label: 'LIVE NOW',
                    variant: QuantBadgeVariant.amber,
                    leadingIcon: Icons.sensors_rounded,
                  )
                else
                  Text(
                    'In ${call.scheduledTime.difference(DateTime.now()).inHours}h ${call.scheduledTime.difference(DateTime.now()).inMinutes % 60}m',
                    style: QuantTypography.labelSpeed.copyWith(color: QuantColors.textSecondary),
                  ),
                Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.link_rounded, size: 18, color: QuantColors.textSecondary),
                      onPressed: () => _copyMeetingLink(call.roomCode),
                      tooltip: 'Copy Link',
                    ),
                    const SizedBox(width: 4),
                    const QuantBadge(
                      label: 'E2EE',
                      variant: QuantBadgeVariant.success,
                      leadingIcon: Icons.lock_rounded,
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              call.title,
              style: QuantTypography.titleMedium.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              'Host: ${call.hostName} · ${call.attendeeCount} participants · Room: ${call.roomCode}',
              style: QuantTypography.bodySmall,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: SquircleButton(
                    label: call.isLiveNow ? 'Join Active Stage' : 'Enter Green Room',
                    icon: Icons.videocam_rounded,
                    backgroundColor: call.isLiveNow ? QuantColors.sunsetGold : QuantColors.darkSlateSurface,
                    textColor: call.isLiveNow ? QuantColors.voidObsidian : QuantColors.textPrimary,
                    border: call.isLiveNow ? null : const BorderSide(color: QuantColors.hairlineBorder),
                    onPressed: () => _showInMeetingDialog(call.title, call.roomCode),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
