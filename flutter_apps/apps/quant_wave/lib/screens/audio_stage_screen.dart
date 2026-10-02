// Sovereign Quant Ecosystem - QuantWave Live Audio Stage Screen
// Dedicated Full-Screen Live Audio Spaces Stage with Host Podium, Avatar Grid, Neon Halos, Queue, and Mute Controls
// Strictly ZERO raw Unicode emojis throughout this file.
// Pure 120Hz Impeller & Skia hardware acceleration.

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';
import '../services/wave_mock_data.dart';

class AudioStageScreen extends StatefulWidget {
  final WaveSpaceRoom? room;

  const AudioStageScreen({super.key, this.room});

  @override
  State<AudioStageScreen> createState() => _AudioStageScreenState();
}

class _AudioStageScreenState extends State<AudioStageScreen> with SingleTickerProviderStateMixin {
  late WaveSpaceRoom _room;
  late AnimationController _pulseController;
  bool _isMicMuted = false;
  bool _isHandRaised = false;

  @override
  void initState() {
    super.initState();
    _room = widget.room ?? WaveMockData.getLiveAudioSpaces().first;
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  void _toggleMic() {
    setState(() {
      _isMicMuted = !_isMicMuted;
    });
  }

  void _toggleHandRaise() {
    setState(() {
      _isHandRaised = !_isHandRaised;
    });
  }

  void _promoteListener(SpaceListener listener) {
    final newSpeaker = SpaceSpeaker(
      id: 'spk-${listener.id}',
      name: listener.name,
      handle: listener.handle,
      initials: listener.initials,
      role: SpaceParticipantRole.speaker,
      isSpeaking: false,
      isMuted: false,
      avatarColor: listener.avatarColor,
    );

    setState(() {
      final updatedListeners = _room.listeners.where((l) => l.id != listener.id).toList();
      final updatedQueue = _room.raisedHandsQueue.where((id) => id != listener.id).toList();
      _room = _room.copyWith(
        speakers: [..._room.speakers, newSpeaker],
        listeners: updatedListeners,
        raisedHandsQueue: updatedQueue,
      );
    });

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          '${listener.name} welcomed to stage as speaker.',
          style: const TextStyle(color: QuantColors.sovereignCyan),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hostSpeaker = _room.speakers.firstWhere(
      (s) => s.role == SpaceParticipantRole.host,
      orElse: () => _room.speakers.first,
    );
    final otherSpeakers = _room.speakers.where((s) => s.id != hostSpeaker.id).toList();
    final queuedListeners = _room.listeners.where((l) => l.isHandRaised || _room.raisedHandsQueue.contains(l.id)).toList();

    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: AppBar(
        backgroundColor: QuantColors.voidObsidian,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded, color: QuantColors.textPrimary),
          onPressed: () => Navigator.maybePop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.crimsonRed.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: QuantColors.crimsonRed, width: 0.8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.fiber_manual_record_rounded, color: QuantColors.crimsonRed, size: 8),
                      SizedBox(width: 3),
                      Text('LIVE STAGE', style: TextStyle(color: QuantColors.crimsonRed, fontSize: 9, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${_room.listenerCount} listening',
                  style: const TextStyle(color: QuantColors.textSecondary, fontSize: 11),
                ),
              ],
            ),
            Text(
              _room.title,
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13, fontWeight: FontWeight.bold),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // 1. HOST PODIUM
                  _buildHostPodium(hostSpeaker),
                  const SizedBox(height: 18),

                  // 2. RAISE HAND QUEUE
                  if (queuedListeners.isNotEmpty) ...[
                    _buildRaiseHandQueue(queuedListeners),
                    const SizedBox(height: 18),
                  ],

                  // 3. PARTICIPANT FLOATING AVATAR GRID
                  if (otherSpeakers.isNotEmpty) ...[
                    const Text(
                      'SPEAKERS ON STAGE',
                      style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                    ),
                    const SizedBox(height: 12),
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 14,
                        crossAxisSpacing: 14,
                        childAspectRatio: 0.85,
                      ),
                      itemCount: otherSpeakers.length,
                      itemBuilder: (context, idx) => _buildSpeakerAvatar(otherSpeakers[idx]),
                    ),
                    const SizedBox(height: 20),
                  ],

                  // 4. LISTENERS GRID
                  Row(
                    children: [
                      const Text(
                        'AUDIENCE',
                        style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                      ),
                      const Spacer(),
                      Text('${_room.listeners.length} listening', style: const TextStyle(color: QuantColors.textMuted, fontSize: 11)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 4,
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.8,
                    ),
                    itemCount: _room.listeners.length,
                    itemBuilder: (context, idx) => _buildListenerAvatar(_room.listeners[idx]),
                  ),
                ],
              ),
            ),

            // 5. MUTE CONTROLS DOCK
            _buildControlDock(),
          ],
        ),
      ),
    );
  }

  Widget _buildHostPodium(SpaceSpeaker host) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.moltenAmber, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: QuantColors.moltenAmber.withOpacity(0.18),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Row(
        children: [
          AnimatedBuilder(
            animation: _pulseController,
            builder: (context, child) {
              final glow = 2.0 + (_pulseController.value * 4.0);
              return Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: QuantColors.moltenAmber, width: 2),
                  boxShadow: [
                    BoxShadow(color: QuantColors.moltenAmber.withOpacity(0.4), blurRadius: glow, spreadRadius: 1),
                  ],
                ),
                child: CircleAvatar(
                  radius: 24,
                  backgroundColor: host.avatarColor,
                  child: Text(
                    host.initials,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15),
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.moltenAmber,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.workspace_premium_rounded, color: Colors.white, size: 10),
                      SizedBox(width: 3),
                      Text('HOST PODIUM', style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800)),
                    ],
                  ),
                ),
                const SizedBox(height: 4),
                Text(host.name, style: const TextStyle(color: QuantColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
                Text(host.handle, style: const TextStyle(color: QuantColors.textMuted, fontSize: 11)),
              ],
            ),
          ),
          _buildEqualizerVisualizer(),
        ],
      ),
    );
  }

  Widget _buildEqualizerVisualizer() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        final val = _pulseController.value;
        return Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _buildBar(8 + (val * 14)),
            const SizedBox(width: 3),
            _buildBar(16 - (val * 8)),
            const SizedBox(width: 3),
            _buildBar(6 + (val * 20)),
            const SizedBox(width: 3),
            _buildBar(18 - (val * 10)),
            const SizedBox(width: 3),
            _buildBar(10 + (val * 12)),
          ],
        );
      },
    );
  }

  Widget _buildBar(double height) {
    return Container(
      width: 3.5,
      height: height.clamp(4.0, 26.0),
      decoration: BoxDecoration(
        color: QuantColors.sovereignCyan,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }

  Widget _buildRaiseHandQueue(List<SpaceListener> queued) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: QuantColors.sunsetGold, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.pan_tool_rounded, color: QuantColors.sunsetGold, size: 16),
              const SizedBox(width: 6),
              Text(
                'Raise Hand Queue (${queued.length})',
                style: const TextStyle(color: QuantColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 13),
              ),
              const Spacer(),
              const Text('Approval Stage', style: TextStyle(color: QuantColors.textMuted, fontSize: 11)),
            ],
          ),
          const SizedBox(height: 8),
          ...queued.map((listener) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: listener.avatarColor,
                  child: Text(listener.initials, style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(listener.name, style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                ),
                ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: QuantColors.sovereignCyan,
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    minimumSize: const Size(60, 28),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () => _promoteListener(listener),
                  child: const Text('Accept', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white)),
                ),
              ],
            ),
          )),
        ],
      ),
    );
  }

  Widget _buildSpeakerAvatar(SpaceSpeaker speaker) {
    final isActive = speaker.isSpeaking || _room.activeSpeakerId == speaker.id;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        AnimatedBuilder(
          animation: _pulseController,
          builder: (context, child) {
            final haloBlur = isActive ? (4.0 + (_pulseController.value * 8.0)) : 0.0;
            return Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: isActive ? QuantColors.sovereignCyan : Colors.transparent,
                  width: isActive ? 2.5 : 1,
                ),
                boxShadow: isActive
                    ? [
                        BoxShadow(
                          color: QuantColors.sovereignCyan.withOpacity(0.55),
                          blurRadius: haloBlur,
                          spreadRadius: 2,
                        ),
                      ]
                    : [],
              ),
              child: Stack(
                children: [
                  CircleAvatar(
                    radius: 26,
                    backgroundColor: speaker.avatarColor,
                    child: Text(speaker.initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      padding: const EdgeInsets.all(3),
                      decoration: BoxDecoration(
                        color: speaker.isMuted ? QuantColors.crimsonRed : QuantColors.emeraldMatrix,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.voidObsidian, width: 2),
                      ),
                      child: Icon(speaker.isMuted ? Icons.mic_off_rounded : Icons.mic_rounded, color: Colors.white, size: 10),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 6),
        Text(speaker.name, style: const TextStyle(color: QuantColors.textPrimary, fontWeight: FontWeight.w600, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
        Container(
          margin: const EdgeInsets.only(top: 2),
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
          decoration: BoxDecoration(color: QuantColors.elevatedCard, borderRadius: BorderRadius.circular(4)),
          child: Text(speaker.role.name.toUpperCase(), style: const TextStyle(color: QuantColors.textMuted, fontSize: 9, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }

  Widget _buildListenerAvatar(SpaceListener listener) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          children: [
            CircleAvatar(
              radius: 18,
              backgroundColor: listener.avatarColor,
              child: Text(listener.initials, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
            ),
            if (listener.isHandRaised)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(color: QuantColors.sunsetGold, shape: BoxShape.circle),
                  child: const Icon(Icons.pan_tool_rounded, color: Colors.black, size: 8),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(listener.name, style: const TextStyle(color: QuantColors.textSecondary, fontSize: 10), maxLines: 1, overflow: TextOverflow.ellipsis),
      ],
    );
  }

  Widget _buildControlDock() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(top: BorderSide(color: QuantColors.hairlineBorder, width: 1)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          // Mute Mic Control
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _toggleMic,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _isMicMuted ? QuantColors.elevatedCard : QuantColors.neonGreen.withOpacity(0.2),
                shape: BoxShape.circle,
                border: Border.all(color: _isMicMuted ? QuantColors.hairlineBorder : QuantColors.neonGreen),
              ),
              child: Icon(_isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded, color: _isMicMuted ? QuantColors.textMuted : QuantColors.neonGreen, size: 22),
            ),
          ),

          // Raise Hand Control
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _toggleHandRaise,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: _isHandRaised ? QuantColors.sunsetGold.withOpacity(0.25) : QuantColors.elevatedCard,
                shape: BoxShape.circle,
                border: Border.all(color: _isHandRaised ? QuantColors.sunsetGold : QuantColors.hairlineBorder, width: 1.5),
              ),
              child: Icon(Icons.pan_tool_rounded, color: _isHandRaised ? QuantColors.sunsetGold : QuantColors.textSecondary, size: 22),
            ),
          ),

          // Audio Output
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text('Audio routing: Low latency WebRTC speaker mode active.', style: TextStyle(color: QuantColors.textPrimary)),
                ),
              );
            },
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: QuantColors.elevatedCard, shape: BoxShape.circle, border: Border.all(color: QuantColors.hairlineBorder)),
              child: const Icon(Icons.volume_up_rounded, color: QuantColors.sovereignCyan, size: 22),
            ),
          ),

          // Leave Stage
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.elevatedCard,
              foregroundColor: QuantColors.crimsonRed,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: const BorderSide(color: QuantColors.crimsonRed, width: 0.8)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            ),
            onPressed: () => Navigator.maybePop(context),
            child: const Text('Leave Stage', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}
