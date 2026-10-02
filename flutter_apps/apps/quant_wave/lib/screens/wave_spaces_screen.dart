// Sovereign Quant Ecosystem - QuantWave Live Audio Spaces Screen
// Sovereign Twitter Spaces Parity Live Audio Discussion Rooms
// Strictly ZERO raw Unicode emojis throughout this file.
// Pure 120Hz Impeller & Skia hardware acceleration.

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/wave_models.dart';
import '../services/wave_mock_data.dart';

class WaveSpacesScreen extends StatefulWidget {
  const WaveSpacesScreen({super.key});

  @override
  State<WaveSpacesScreen> createState() => _WaveSpacesScreenState();
}

class _WaveSpacesScreenState extends State<WaveSpacesScreen> with SingleTickerProviderStateMixin {
  late List<WaveSpaceRoom> _rooms;
  WaveSpaceRoom? _activeJoinedRoom;
  bool _isMicMuted = false;
  bool _isHandRaised = false;
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _rooms = WaveMockData.getLiveAudioSpaces();
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

  void _joinRoom(WaveSpaceRoom room) {
    setState(() {
      _activeJoinedRoom = room;
      _isMicMuted = room.isMicMuted;
      _isHandRaised = false;
    });
    _showActiveSpaceModal(room);
  }

  void _leaveRoom() {
    setState(() {
      _activeJoinedRoom = null;
    });
  }

  void _toggleHandRaise() {
    setState(() {
      _isHandRaised = !_isHandRaised;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          _isHandRaised
              ? 'Hand raised. Amber beacon broadcasted to host stage.'
              : 'Hand lowered.',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _promoteListenerToSpeaker(WaveSpaceRoom room, SpaceListener listener, StateSetter setModalState) {
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

    final updatedListeners = room.listeners.where((l) => l.id != listener.id).toList();
    final updatedQueue = room.raisedHandsQueue.where((id) => id != listener.id).toList();
    final updatedSpeakers = [...room.speakers, newSpeaker];

    final updatedRoom = room.copyWith(
      speakers: updatedSpeakers,
      listeners: updatedListeners,
      raisedHandsQueue: updatedQueue,
    );

    setState(() {
      _rooms = _rooms.map((r) => r.id == room.id ? updatedRoom : r).toList();
      _activeJoinedRoom = updatedRoom;
    });

    setModalState(() {});

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        content: Text(
          '${listener.name} invited to stage as speaker.',
          style: const TextStyle(color: QuantColors.sovereignCyan),
        ),
      ),
    );
  }

  void _showRoomScheduler() {
    final titleController = TextEditingController();
    final topicController = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20,
            right: 20,
            top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.calendar_month_rounded, color: QuantColors.sunsetGold),
                  const SizedBox(width: 8),
                  const Text(
                    'Schedule Sovereign Wave Space',
                    style: TextStyle(
                      color: QuantColors.textPrimary,
                      fontWeight: FontWeight.w700,
                      fontSize: 16,
                    ),
                  ),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close_rounded, color: QuantColors.textMuted),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'ROOM TITLE',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: titleController,
                style: const TextStyle(color: QuantColors.textPrimary),
                decoration: InputDecoration(
                  hintText: 'e.g. Sovereign AI & Systems Architecture',
                  hintStyle: const TextStyle(color: QuantColors.textMuted),
                  filled: true,
                  fillColor: QuantColors.elevatedCard,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                'TOPIC FOCUS',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 11, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 6),
              TextField(
                controller: topicController,
                style: const TextStyle(color: QuantColors.textPrimary),
                decoration: InputDecoration(
                  hintText: 'e.g. Distributed Consensus & WebRTC',
                  hintStyle: const TextStyle(color: QuantColors.textMuted),
                  filled: true,
                  fillColor: QuantColors.elevatedCard,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: QuantColors.hairlineBorder),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                height: 46,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.podcasts_rounded, color: Colors.white),
                  label: const Text(
                    'Broadcast & Schedule Space',
                    style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: QuantColors.moltenAmber,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () {
                    if (titleController.text.trim().isNotEmpty) {
                      final newRoom = WaveSpaceRoom(
                        id: 'space-${DateTime.now().millisecondsSinceEpoch}',
                        title: titleController.text.trim(),
                        topic: topicController.text.trim().isNotEmpty ? topicController.text.trim() : 'General Discussion',
                        hostName: 'Quant Sovereign',
                        hostHandle: '@quant_user',
                        hostAvatarColor: QuantColors.moltenAmber,
                        listenerCount: 0,
                        isLive: false,
                        scheduledTime: 'Tomorrow at 15:00 UTC',
                      );
                      setState(() {
                        _rooms.add(newRoom);
                      });
                    }
                    Navigator.pop(ctx);
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        backgroundColor: QuantColors.darkSlateCard,
                        content: Text(
                          'Wave Space scheduled and published to mesh listeners.',
                          style: TextStyle(color: QuantColors.textPrimary),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _showActiveSpaceModal(WaveSpaceRoom room) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: QuantColors.voidObsidian,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        side: BorderSide(color: QuantColors.hairlineBorder, width: 1),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setModalState) {
            final currentRoom = _rooms.firstWhere((r) => r.id == room.id, orElse: () => room);
            final hostSpeaker = currentRoom.speakers.firstWhere(
              (s) => s.role == SpaceParticipantRole.host,
              orElse: () => currentRoom.speakers.first,
            );
            final otherSpeakers = currentRoom.speakers.where((s) => s.id != hostSpeaker.id).toList();
            final queuedListeners = currentRoom.listeners.where((l) => l.isHandRaised || currentRoom.raisedHandsQueue.contains(l.id)).toList();

            return DraggableScrollableSheet(
              initialChildSize: 0.92,
              minChildSize: 0.65,
              maxChildSize: 0.98,
              expand: false,
              builder: (context, scrollController) {
                return Column(
                  children: [
                    // Handle
                    Container(
                      width: 44,
                      height: 4,
                      margin: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: QuantColors.activeBorder,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),

                    // Top Room Header
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: QuantColors.crimsonRed.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: QuantColors.crimsonRed, width: 1),
                            ),
                            child: const Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.fiber_manual_record_rounded, color: QuantColors.crimsonRed, size: 10),
                                SizedBox(width: 4),
                                Text(
                                  'LIVE STAGE',
                                  style: TextStyle(
                                    color: QuantColors.crimsonRed,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 10),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.headset_rounded, color: QuantColors.sovereignCyan, size: 14),
                              const SizedBox(width: 4),
                              Text(
                                '${currentRoom.listenerCount} listening',
                                style: const TextStyle(
                                  color: QuantColors.textSecondary,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          const Spacer(),
                          IconButton(
                            icon: const Icon(Icons.keyboard_arrow_down_rounded, color: QuantColors.textMuted, size: 28),
                            onPressed: () => Navigator.pop(ctx),
                          ),
                        ],
                      ),
                    ),

                    // Room Title & Topic
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            currentRoom.title,
                            style: const TextStyle(
                              color: QuantColors.textPrimary,
                              fontWeight: FontWeight.w700,
                              fontSize: 17,
                              height: 1.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: QuantColors.moltenAmber.withOpacity(0.15),
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: Text(
                                  currentRoom.topic,
                                  style: const TextStyle(
                                    color: QuantColors.moltenAmber,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                '• 120Hz WebRTC Audio Mesh',
                                style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const Divider(color: QuantColors.hairlineBorder, height: 1),

                    // Stage Area (Host Podium, Speakers Grid, Raise Hand Queue, Listeners)
                    Expanded(
                      child: ListView(
                        controller: scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                        children: [
                          // 1. HOST PODIUM ELEVATED CARD
                          _buildHostPodium(hostSpeaker),
                          const SizedBox(height: 20),

                          // 2. RAISE HAND QUEUE BANNER (if any)
                          if (queuedListeners.isNotEmpty) ...[
                            _buildRaiseHandQueueSection(currentRoom, queuedListeners, setModalState),
                            const SizedBox(height: 20),
                          ],

                          // 3. CO-HOSTS & SPEAKERS GRID (Pulsing Neon Halos)
                          if (otherSpeakers.isNotEmpty) ...[
                            const Text(
                              'CO-HOSTS & SPEAKERS',
                              style: TextStyle(
                                color: QuantColors.textMuted,
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.5,
                              ),
                            ),
                            const SizedBox(height: 14),
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
                              itemBuilder: (context, idx) {
                                return _buildSpeakerAvatar(otherSpeakers[idx], currentRoom.activeSpeakerId);
                              },
                            ),
                            const SizedBox(height: 24),
                          ],

                          // 4. LISTENERS IN AUDIENCE
                          Row(
                            children: [
                              const Text(
                                'LISTENERS IN AUDIENCE',
                                style: TextStyle(
                                  color: QuantColors.textMuted,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  letterSpacing: 0.5,
                                ),
                              ),
                              const Spacer(),
                              Text(
                                '${currentRoom.listeners.length} users',
                                style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                              ),
                            ],
                          ),
                          const SizedBox(height: 14),

                          // Listeners Grid
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 4,
                              mainAxisSpacing: 12,
                              crossAxisSpacing: 12,
                              childAspectRatio: 0.8,
                            ),
                            itemCount: currentRoom.listeners.length,
                            itemBuilder: (context, idx) {
                              return _buildListenerAvatar(currentRoom.listeners[idx]);
                            },
                          ),
                        ],
                      ),
                    ),

                    // In-Room Bottom Control Dock (Mute Controls)
                    _buildInRoomControlDock(setModalState, ctx),
                  ],
                );
              },
            );
          },
        );
      },
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
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          // Host Pulsing Avatar
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
                    BoxShadow(
                      color: QuantColors.moltenAmber.withOpacity(0.4),
                      blurRadius: glow,
                      spreadRadius: 1,
                    ),
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

          // Host Metadata
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
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
                          Text(
                            'HOST PODIUM',
                            style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w800),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 6),
                    if (host.isSpeaking)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: QuantColors.sovereignCyan.withOpacity(0.2),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: QuantColors.sovereignCyan, width: 0.8),
                        ),
                        child: const Text(
                          'SPEAKING',
                          style: TextStyle(color: QuantColors.sovereignCyan, fontSize: 9, fontWeight: FontWeight.w800),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  host.name,
                  style: const TextStyle(
                    color: QuantColors.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                  ),
                ),
                Text(
                  host.handle,
                  style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),

          // Real-time Audio Waveform Equalizer (5 Animated Bars)
          _buildAudioEqualizerVisualizer(),
        ],
      ),
    );
  }

  Widget _buildAudioEqualizerVisualizer() {
    return AnimatedBuilder(
      animation: _pulseController,
      builder: (context, child) {
        final val = _pulseController.value;
        return Row(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            _buildEqualizerBar(8 + (val * 14)),
            const SizedBox(width: 3),
            _buildEqualizerBar(16 - (val * 8)),
            const SizedBox(width: 3),
            _buildEqualizerBar(6 + (val * 20)),
            const SizedBox(width: 3),
            _buildEqualizerBar(18 - (val * 10)),
            const SizedBox(width: 3),
            _buildEqualizerBar(10 + (val * 12)),
          ],
        );
      },
    );
  }

  Widget _buildEqualizerBar(double height) {
    return Container(
      width: 3.5,
      height: height.clamp(4.0, 26.0),
      decoration: BoxDecoration(
        color: QuantColors.sovereignCyan,
        borderRadius: BorderRadius.circular(2),
      ),
    );
  }

  Widget _buildRaiseHandQueueSection(WaveSpaceRoom room, List<SpaceListener> queued, StateSetter setModalState) {
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
                style: const TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 13,
                ),
              ),
              const Spacer(),
              const Text(
                'Awaiting Stage Approval',
                style: TextStyle(color: QuantColors.textMuted, fontSize: 11),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ...queued.map((listener) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 12,
                    backgroundColor: listener.avatarColor,
                    child: Text(
                      listener.initials,
                      style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          listener.name,
                          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                        ),
                        Text(
                          listener.handle,
                          style: const TextStyle(color: QuantColors.textMuted, fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: QuantColors.sovereignCyan,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      minimumSize: const Size(60, 28),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: () => _promoteListenerToSpeaker(room, listener, setModalState),
                    child: const Text('Accept', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700)),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildSpeakerAvatar(SpaceSpeaker speaker, String? activeSpeakerId) {
    final isActive = speaker.isSpeaking || activeSpeakerId == speaker.id;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Pulsing Neon Halo around Active Speaker
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
                    child: Text(
                      speaker.initials,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 15,
                      ),
                    ),
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
                      child: Icon(
                        speaker.isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                        color: Colors.white,
                        size: 10,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
        const SizedBox(height: 6),
        Text(
          speaker.name,
          style: const TextStyle(
            color: QuantColors.textPrimary,
            fontWeight: FontWeight.w600,
            fontSize: 12,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        Container(
          margin: const EdgeInsets.only(top: 2),
          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
          decoration: BoxDecoration(
            color: QuantColors.elevatedCard,
            borderRadius: BorderRadius.circular(4),
          ),
          child: Text(
            speaker.role.name.toUpperCase(),
            style: const TextStyle(
              color: QuantColors.textMuted,
              fontSize: 9,
              fontWeight: FontWeight.w700,
            ),
          ),
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
              radius: 20,
              backgroundColor: listener.avatarColor,
              child: Text(
                listener.initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                ),
              ),
            ),
            if (listener.isHandRaised)
              Positioned(
                right: 0,
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: QuantColors.sunsetGold,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.pan_tool_rounded,
                    color: Colors.black,
                    size: 9,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          listener.name,
          style: const TextStyle(
            color: QuantColors.textSecondary,
            fontSize: 10,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  Widget _buildInRoomControlDock(StateSetter setModalState, BuildContext ctx) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            // Mic Toggle (Mute Controls)
            InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                setModalState(() {
                  _isMicMuted = !_isMicMuted;
                });
                setState(() {
                  _isMicMuted = _isMicMuted;
                });
              },
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isMicMuted ? QuantColors.elevatedCard : QuantColors.neonGreen.withOpacity(0.2),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _isMicMuted ? QuantColors.hairlineBorder : QuantColors.neonGreen,
                  ),
                ),
                child: Icon(
                  _isMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                  color: _isMicMuted ? QuantColors.textMuted : QuantColors.neonGreen,
                  size: 22,
                ),
              ),
            ),

            // Raise Hand Button (Amber Beacon)
            InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                setModalState(() {
                  _isHandRaised = !_isHandRaised;
                });
                _toggleHandRaise();
              },
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: _isHandRaised
                      ? QuantColors.sunsetGold.withOpacity(0.25)
                      : QuantColors.elevatedCard,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _isHandRaised ? QuantColors.sunsetGold : QuantColors.hairlineBorder,
                    width: 1.5,
                  ),
                ),
                child: Icon(
                  Icons.pan_tool_rounded,
                  color: _isHandRaised ? QuantColors.sunsetGold : QuantColors.textSecondary,
                  size: 22,
                ),
              ),
            ),

            // Speaker Output Button
            InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    backgroundColor: QuantColors.darkSlateCard,
                    content: Text(
                      'Audio routing: Low latency WebRTC speaker mode active.',
                      style: TextStyle(color: QuantColors.textPrimary),
                    ),
                  ),
                );
              },
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: QuantColors.elevatedCard,
                  shape: BoxShape.circle,
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Icon(
                  Icons.volume_up_rounded,
                  color: QuantColors.sovereignCyan,
                  size: 22,
                ),
              ),
            ),

            // Leave Room Quietly Button
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: QuantColors.elevatedCard,
                foregroundColor: QuantColors.crimsonRed,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                  side: const BorderSide(color: QuantColors.crimsonRed, width: 0.8),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              ),
              onPressed: () {
                Navigator.pop(ctx);
                _leaveRoom();
              },
              child: const Text(
                'Leave Quietly',
                style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Header
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              const Text(
                'Live Wave Spaces',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const Spacer(),
              ElevatedButton.icon(
                icon: const Icon(Icons.add_rounded, size: 18, color: Colors.white),
                label: const Text('Schedule', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: QuantColors.moltenAmber,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                ),
                onPressed: _showRoomScheduler,
              ),
            ],
          ),
        ),

        // Rooms List
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: _rooms.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              return _buildRoomCard(_rooms[index]);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildRoomCard(WaveSpaceRoom room) {
    final isJoined = _activeJoinedRoom?.id == room.id;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isJoined ? QuantColors.sovereignCyan : QuantColors.hairlineBorder,
          width: isJoined ? 1.5 : 1,
        ),
        boxShadow: isJoined
            ? [
                BoxShadow(
                  color: QuantColors.sovereignCyan.withOpacity(0.2),
                  blurRadius: 10,
                  spreadRadius: 1,
                ),
              ]
            : [],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (room.isLive) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.crimsonRed.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: QuantColors.crimsonRed, width: 0.8),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.fiber_manual_record_rounded, color: QuantColors.crimsonRed, size: 9),
                      SizedBox(width: 4),
                      Text(
                        'LIVE NOW',
                        style: TextStyle(
                          color: QuantColors.crimsonRed,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${room.listenerCount} listening',
                  style: const TextStyle(color: QuantColors.textMuted, fontSize: 11),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.schedule_rounded, color: QuantColors.textMuted, size: 10),
                      const SizedBox(width: 4),
                      Text(
                        room.scheduledTime ?? 'Scheduled',
                        style: const TextStyle(color: QuantColors.textMuted, fontSize: 10, fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 10),
          Text(
            room.title,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            room.topic,
            style: const TextStyle(
              color: QuantColors.moltenAmber,
              fontSize: 12,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              CircleAvatar(
                radius: 12,
                backgroundColor: room.hostAvatarColor,
                child: Text(
                  room.hostName.isNotEmpty ? room.hostName.substring(0, 1) : 'Q',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      room.hostName,
                      style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12, fontWeight: FontWeight.w600),
                    ),
                    Text(
                      room.hostHandle,
                      style: const TextStyle(color: QuantColors.textMuted, fontSize: 10),
                    ),
                  ],
                ),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: room.isLive ? QuantColors.sovereignCyan : QuantColors.elevatedCard,
                  foregroundColor: room.isLive ? Colors.white : QuantColors.textPrimary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                ),
                onPressed: () => _joinRoom(room),
                child: Text(
                  room.isLive ? 'Join Space' : 'Set Reminder',
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
