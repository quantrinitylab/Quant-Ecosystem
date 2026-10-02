// Sovereign Quant Ecosystem - QuantWave Live Audio Spaces Screen
// Sovereign Twitter Spaces Parity Live Audio Discussion Rooms
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

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

class _WaveSpacesScreenState extends State<WaveSpacesScreen> {
  late List<WaveSpaceRoom> _rooms;
  WaveSpaceRoom? _activeJoinedRoom;
  bool _isMicMuted = false;
  bool _isHandRaised = false;

  @override
  void initState() {
    super.initState();
    _rooms = WaveMockData.getLiveAudioSpaces();
  }

  void _joinRoom(WaveSpaceRoom room) {
    setState(() {
      _activeJoinedRoom = room;
      _isMicMuted = false;
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
            return DraggableScrollableSheet(
              initialChildSize: 0.9,
              minChildSize: 0.6,
              maxChildSize: 0.95,
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
                                '${room.listenerCount} listening',
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
                            room.title,
                            style: const TextStyle(
                              color: QuantColors.textPrimary,
                              fontWeight: FontWeight.w700,
                              fontSize: 17,
                              height: 1.3,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            room.topic,
                            style: const TextStyle(
                              color: QuantColors.moltenAmber,
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const Divider(color: QuantColors.hairlineBorder, height: 1),

                    // Stage Area (Speakers & Listeners)
                    Expanded(
                      child: ListView(
                        controller: scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                        children: [
                          // Speakers Section Header
                          const Text(
                            'SPEAKERS ON STAGE',
                            style: TextStyle(
                              color: QuantColors.textMuted,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 0.5,
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Speakers Grid with Active Speaking Rings
                          GridView.builder(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                              crossAxisCount: 3,
                              mainAxisSpacing: 16,
                              crossAxisSpacing: 16,
                              childAspectRatio: 0.85,
                            ),
                            itemCount: room.speakers.length,
                            itemBuilder: (context, idx) {
                              return _buildSpeakerAvatar(room.speakers[idx]);
                            },
                          ),
                          const SizedBox(height: 24),

                          // Listeners Section Header with Amber Hand-Raising Beacons
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
                              if (room.listeners.any((l) => l.isHandRaised))
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: QuantColors.sunsetGold.withOpacity(0.2),
                                    borderRadius: BorderRadius.circular(6),
                                    border: Border.all(color: QuantColors.sunsetGold, width: 1),
                                  ),
                                  child: const Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(Icons.pan_tool_rounded, color: QuantColors.sunsetGold, size: 10),
                                      SizedBox(width: 4),
                                      Text(
                                        'HANDS RAISED',
                                        style: TextStyle(
                                          color: QuantColors.sunsetGold,
                                          fontSize: 9,
                                          fontWeight: FontWeight.w800,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                            ],
                          ),
                          const SizedBox(height: 16),

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
                            itemCount: room.listeners.length,
                            itemBuilder: (context, idx) {
                              return _buildListenerAvatar(room.listeners[idx]);
                            },
                          ),
                        ],
                      ),
                    ),

                    // In-Room Bottom Control Dock
                    Container(
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
                            // Mic Toggle
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

                            // Reaction Button
                            InkWell(
                              borderRadius: BorderRadius.circular(20),
                              onTap: () {
                                ScaffoldMessenger.of(context).showSnackBar(
                                  const SnackBar(
                                    backgroundColor: QuantColors.darkSlateCard,
                                    content: Text(
                                      'Rocket cheer sent to the stage!',
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
                                  Icons.rocket_launch_rounded,
                                  color: QuantColors.moltenAmber,
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
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }

  Widget _buildSpeakerAvatar(SpaceSpeaker speaker) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Active Speaking Ring Indicator (Hardware-accelerated BoxDecoration, ZERO clipPath)
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
              color: speaker.isSpeaking ? QuantColors.sovereignCyan : Colors.transparent,
              width: 2.5,
            ),
            boxShadow: speaker.isSpeaking
                ? [
                    BoxShadow(
                      color: QuantColors.sovereignCyan.withOpacity(0.4),
                      blurRadius: 10,
                      spreadRadius: 2,
                    ),
                  ]
                : null,
          ),
          child: Stack(
            children: [
              CircleAvatar(
                radius: 28,
                backgroundColor: speaker.avatarColor,
                child: Text(
                  speaker.initials,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                  ),
                ),
              ),
              if (speaker.isMuted)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    padding: const EdgeInsets.all(3),
                    decoration: const BoxDecoration(
                      color: QuantColors.darkSlateCard,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.mic_off_rounded,
                      size: 14,
                      color: QuantColors.textMuted,
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 6),
        Text(
          speaker.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: QuantColors.textPrimary,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
        Text(
          speaker.role == SpaceParticipantRole.host
              ? 'Host'
              : speaker.role == SpaceParticipantRole.coHost
                  ? 'Co-host'
                  : 'Speaker',
          style: TextStyle(
            color: speaker.role == SpaceParticipantRole.host ? QuantColors.moltenAmber : QuantColors.textMuted,
            fontSize: 10,
            fontWeight: FontWeight.w600,
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
          clipBehavior: Clip.none,
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: listener.avatarColor,
              child: Text(
                listener.initials,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),
            ),
            // Hand-Raising Amber Beacon Indicator
            if (listener.isHandRaised)
              Positioned(
                right: -4,
                top: -4,
                child: Container(
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: QuantColors.sunsetGold,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: QuantColors.sunsetGold.withOpacity(0.8),
                        blurRadius: 6,
                        spreadRadius: 1,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.pan_tool_rounded,
                    size: 10,
                    color: Colors.black,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          listener.name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: QuantColors.textSecondary,
            fontSize: 10,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Top Broadcast / Schedule Action Bar
        _buildTopSpacesBar(),

        // Rooms List Feed
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: _rooms.length,
            separatorBuilder: (context, index) => const SizedBox(height: 16),
            itemBuilder: (context, index) {
              return _buildRoomCard(_rooms[index]);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildTopSpacesBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          const Row(
            children: [
              Icon(Icons.spatial_audio_rounded, color: QuantColors.sovereignCyan, size: 20),
              SizedBox(width: 8),
              Text(
                'Live Wave Spaces',
                style: TextStyle(
                  color: QuantColors.textPrimary,
                  fontWeight: FontWeight.w700,
                  fontSize: 15,
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            icon: const Icon(Icons.add_rounded, size: 16, color: Colors.white),
            label: const Text(
              'Schedule',
              style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: QuantColors.moltenAmber,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              minimumSize: const Size(80, 32),
            ),
            onPressed: _showRoomScheduler,
          ),
        ],
      ),
    );
  }

  Widget _buildRoomCard(WaveSpaceRoom room) {
    return Container(
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: room.isLive ? QuantColors.sovereignCyan.withOpacity(0.5) : QuantColors.hairlineBorder,
          width: 1,
        ),
        boxShadow: room.isLive
            ? [
                BoxShadow(
                  color: QuantColors.sovereignCyan.withOpacity(0.08),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Room Status Tag & Listener Count
          Row(
            children: [
              if (room.isLive) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: QuantColors.crimsonRed.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.fiber_manual_record_rounded, color: QuantColors.crimsonRed, size: 10),
                      SizedBox(width: 4),
                      Text(
                        'LIVE NOW',
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
                const Icon(Icons.headset_rounded, color: QuantColors.sovereignCyan, size: 14),
                const SizedBox(width: 4),
                Text(
                  '${room.listenerCount} listening',
                  style: const TextStyle(
                    color: QuantColors.textSecondary,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ] else ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: QuantColors.sunsetGold.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.schedule_rounded, color: QuantColors.sunsetGold, size: 12),
                      const SizedBox(width: 4),
                      Text(
                        room.scheduledTime ?? 'SCHEDULED',
                        style: const TextStyle(
                          color: QuantColors.sunsetGold,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const Spacer(),
              const Icon(Icons.podcasts_rounded, color: QuantColors.sovereignCyan, size: 18),
            ],
          ),
          const SizedBox(height: 12),

          // Room Title
          Text(
            room.title,
            style: const TextStyle(
              color: QuantColors.textPrimary,
              fontWeight: FontWeight.w700,
              fontSize: 15,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 6),

          // Topic Focus
          Text(
            room.topic,
            style: const TextStyle(
              color: QuantColors.moltenAmber,
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 14),

          // Host & Speakers Preview Avatars
          Row(
            children: [
              CircleAvatar(
                radius: 14,
                backgroundColor: room.hostAvatarColor,
                child: Text(
                  room.hostName.substring(0, 1),
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                'Host: ${room.hostName}',
                style: const TextStyle(
                  color: QuantColors.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const Spacer(),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: room.isLive ? QuantColors.sovereignCyan : QuantColors.elevatedCard,
                  foregroundColor: room.isLive ? Colors.black : QuantColors.textPrimary,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  minimumSize: const Size(70, 32),
                ),
                onPressed: () {
                  if (room.isLive) {
                    _joinRoom(room);
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        backgroundColor: QuantColors.darkSlateCard,
                        content: Text(
                          'Reminder set for this scheduled Wave Space.',
                          style: TextStyle(color: QuantColors.textPrimary),
                        ),
                      ),
                    );
                  }
                },
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
