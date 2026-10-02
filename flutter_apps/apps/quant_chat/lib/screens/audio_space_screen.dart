// Sovereign Quant Ecosystem - QuantChat Chatter-Class Live Audio Space Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';
import '../models/chat_models.dart';
import '../services/chat_mock_data.dart';

class AudioSpaceScreen extends StatefulWidget {
  const AudioSpaceScreen({super.key});

  @override
  State<AudioSpaceScreen> createState() => _AudioSpaceScreenState();
}

class _AudioSpaceScreenState extends State<AudioSpaceScreen> with SingleTickerProviderStateMixin {
  late AudioSpaceRoom _room;
  bool _isMyMicMuted = true;
  bool _isMyHandRaised = false;
  late AnimationController _waveController;
  late Animation<double> _waveAnimation;

  @override
  void initState() {
    super.initState();
    _room = ChatMockData.getInitialSpaceRoom();

    _waveController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);

    _waveAnimation = Tween<double>(begin: 0.94, end: 1.08).animate(
      CurvedAnimation(parent: _waveController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _waveController.dispose();
    super.dispose();
  }

  void _toggleMic() {
    setState(() => _isMyMicMuted = !_isMyMicMuted);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 1),
        content: Text(
          _isMyMicMuted ? 'Microphone muted' : 'Microphone broadcasting live to stage',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _toggleHandRaise() {
    setState(() => _isMyHandRaised = !_isMyHandRaised);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 1),
        content: Text(
          _isMyHandRaised
              ? 'Hand raised! Host notified to grant speaker stage access.'
              : 'Hand lowered.',
          style: const TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _triggerReaction(IconData icon, String label) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(milliseconds: 800),
        content: Row(
          children: [
            Icon(icon, color: QuantColors.moltenOrange, size: 18),
            const SizedBox(width: 8),
            Text(
              'Reaction sent: $label',
              style: const TextStyle(color: QuantColors.textPrimary),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      body: SafeArea(
        child: Column(
          children: [
            // Stage Header
            _buildStageHeader(),

            // Stage Main Content (Host, Speakers, Listeners)
            Expanded(
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                children: [
                  // Host VIP Spotlight Card
                  _buildHostSection(),
                  const SizedBox(height: 18),

                  // Active Speakers Grid
                  _buildSectionTitle(
                    'STAGE SPEAKERS (${_room.speakers.length + 1})',
                    Icons.record_voice_over_rounded,
                  ),
                  const SizedBox(height: 10),
                  _buildSpeakersGrid(),
                  const SizedBox(height: 22),

                  // Listeners Grid with Hand-Raising Beacons
                  _buildSectionTitle(
                    'LISTENERS (${_room.listeners.length + _room.listenersCount})',
                    Icons.headphones_rounded,
                  ),
                  const SizedBox(height: 10),
                  _buildListenersGrid(),
                  const SizedBox(height: 90), // Bottom padding for dock
                ],
              ),
            ),

            // Bottom Audio Stage Action Dock
            _buildStageBottomDock(),
          ],
        ),
      ),
    );
  }

  Widget _buildStageHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          bottom: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: QuantColors.statusError.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: QuantColors.statusError.withOpacity(0.5)),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: QuantColors.statusError,
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        const Text(
                          'LIVE STAGE',
                          style: TextStyle(
                            color: QuantColors.statusError,
                            fontSize: 10,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: QuantColors.hairlineBorder),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.people_alt_rounded, size: 12, color: QuantColors.textSecondary),
                        const SizedBox(width: 4),
                        Text(
                          '${_room.listenersCount + 5} listening',
                          style: const TextStyle(
                            color: QuantColors.textSecondary,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Left the sovereign stage quietly.',
                        style: TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.directions_walk_rounded, size: 14, color: QuantColors.statusError),
                      SizedBox(width: 4),
                      Text(
                        'Leave Quietly',
                        style: TextStyle(
                          color: QuantColors.statusError,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            _room.title,
            style: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            _room.topic,
            style: const TextStyle(
              fontSize: 12,
              color: QuantColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHostSection() {
    final host = _room.host;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QuantColors.darkSlateCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: QuantColors.moltenOrange.withOpacity(0.4), width: 1.2),
        boxShadow: [
          BoxShadow(
            color: QuantColors.moltenOrange.withOpacity(0.08),
            blurRadius: 16,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Row(
        children: [
          // Host Pulsing Avatar
          AnimatedBuilder(
            animation: _waveAnimation,
            builder: (context, child) {
              return Container(
                width: 52 * _waveAnimation.value,
                height: 52 * _waveAnimation.value,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: QuantColors.moltenOrange.withOpacity(0.8),
                    width: 2,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: QuantColors.moltenOrange.withOpacity(0.35),
                      blurRadius: 12,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Center(
                  child: Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: QuantColors.moltenOrange.withOpacity(0.2),
                      shape: BoxShape.circle,
                    ),
                    child: Center(
                      child: Text(
                        host.avatarInitials,
                        style: const TextStyle(
                          color: QuantColors.moltenOrange,
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(width: 14),

          // Host Info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      host.name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: QuantColors.moltenOrange,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.star_rounded, size: 10, color: Colors.white),
                          SizedBox(width: 2),
                          Text(
                            'HOST',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 3),
                const Text(
                  'Stage Moderator | Speaking live',
                  style: TextStyle(
                    fontSize: 12,
                    color: QuantColors.statusSuccess,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // Speaking waveform icon
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: QuantColors.statusSuccess.withOpacity(0.15),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.graphic_eq_rounded,
              color: QuantColors.statusSuccess,
              size: 20,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title, IconData icon) {
    return Row(
      children: [
        Icon(icon, size: 14, color: QuantColors.textMuted),
        const SizedBox(width: 6),
        Text(
          title,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.6,
            color: QuantColors.textMuted,
          ),
        ),
      ],
    );
  }

  Widget _buildSpeakersGrid() {
    final speakers = _room.speakers;
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.85,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: speakers.length,
      itemBuilder: (context, idx) {
        final spk = speakers[idx];
        return Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: spk.isSpeaking
                  ? QuantColors.statusSuccess
                  : QuantColors.hairlineBorder,
              width: spk.isSpeaking ? 1.5 : 1,
            ),
            boxShadow: spk.isSpeaking
                ? [
                    BoxShadow(
                      color: QuantColors.statusSuccess.withOpacity(0.2),
                      blurRadius: 10,
                      spreadRadius: 1,
                    )
                  ]
                : null,
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: spk.accentColor.withOpacity(0.2),
                      shape: BoxShape.circle,
                      border: Border.all(color: spk.accentColor.withOpacity(0.6), width: 1.5),
                    ),
                    child: Center(
                      child: Text(
                        spk.avatarInitials,
                        style: TextStyle(
                          color: spk.accentColor,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: spk.isMuted ? QuantColors.statusError : QuantColors.statusSuccess,
                        shape: BoxShape.circle,
                        border: Border.all(color: QuantColors.voidObsidian, width: 1.5),
                      ),
                      child: Icon(
                        spk.isMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                        size: 9,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                spk.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                spk.isSpeaking ? 'Speaking' : (spk.isMuted ? 'Muted' : 'Listening'),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w500,
                  color: spk.isSpeaking ? QuantColors.statusSuccess : QuantColors.textMuted,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildListenersGrid() {
    final listeners = _room.listeners;
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 0.9,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
      ),
      itemCount: listeners.length,
      itemBuilder: (context, idx) {
        final lis = listeners[idx];
        return Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: QuantColors.darkSlateCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: lis.isHandRaised
                  ? QuantColors.sunsetGold.withOpacity(0.6)
                  : QuantColors.hairlineBorder,
              width: lis.isHandRaised ? 1.5 : 1,
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Stack(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: lis.accentColor.withOpacity(0.18),
                      shape: BoxShape.circle,
                      border: Border.all(color: lis.accentColor.withOpacity(0.4), width: 1),
                    ),
                    child: Center(
                      child: Text(
                        lis.avatarInitials,
                        style: TextStyle(
                          color: lis.accentColor,
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                  if (lis.isHandRaised)
                    Positioned(
                      right: 0,
                      bottom: 0,
                      child: Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          color: QuantColors.sunsetGold,
                          shape: BoxShape.circle,
                          border: Border.all(color: QuantColors.voidObsidian, width: 1.5),
                        ),
                        child: const Icon(
                          Icons.pan_tool_rounded,
                          size: 9,
                          color: Colors.white,
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                lis.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: Colors.white,
                ),
              ),
              const SizedBox(height: 1),
              Text(
                lis.isHandRaised ? 'Hand Raised' : 'Listener',
                style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w500,
                  color: lis.isHandRaised ? QuantColors.sunsetGold : QuantColors.textMuted,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStageBottomDock() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: const BoxDecoration(
        color: QuantColors.darkSlateCard,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Vector Reactions Row (Strictly zero Unicode emojis)
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _reactionBtn(Icons.thumb_up_rounded, 'Thumbs Up'),
              _reactionBtn(Icons.local_fire_department_rounded, 'Fire'),
              _reactionBtn(Icons.rocket_launch_rounded, 'Rocket'),
              _reactionBtn(Icons.sign_language_rounded, 'Clap'),
              _reactionBtn(Icons.favorite_rounded, 'Heart'),
            ],
          ),
          const SizedBox(height: 8),

          // Main Controls (Mute Mic, Raise Hand, Invite)
          Row(
            children: [
              // Mute Mic Toggle Button
              Expanded(
                flex: 2,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _toggleMic,
                  child: Container(
                    height: 42,
                    decoration: BoxDecoration(
                      color: _isMyMicMuted ? QuantColors.elevatedCard : QuantColors.statusSuccess,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _isMyMicMuted ? QuantColors.hairlineBorder : QuantColors.statusSuccess,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          _isMyMicMuted ? Icons.mic_off_rounded : Icons.mic_rounded,
                          size: 18,
                          color: _isMyMicMuted ? QuantColors.textSecondary : Colors.white,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _isMyMicMuted ? 'Mute' : 'Live On Mic',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: _isMyMicMuted ? QuantColors.textSecondary : Colors.white,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Request to Speak / Raise Hand Toggle
              Expanded(
                flex: 2,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _toggleHandRaise,
                  child: Container(
                    height: 42,
                    decoration: BoxDecoration(
                      color: _isMyHandRaised
                          ? QuantColors.sunsetGold
                          : QuantColors.elevatedCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: _isMyHandRaised
                            ? QuantColors.sunsetGold
                            : QuantColors.hairlineBorder,
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.pan_tool_rounded,
                          size: 16,
                          color: _isMyHandRaised ? Colors.white : QuantColors.sunsetGold,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          _isMyHandRaised ? 'Hand Raised' : 'Raise Hand',
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: _isMyHandRaised ? Colors.white : QuantColors.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Share Invite Button
              InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      backgroundColor: QuantColors.darkSlateCard,
                      content: Text(
                        'Encrypted Space invite link copied to clipboard.',
                        style: TextStyle(color: QuantColors.textPrimary),
                      ),
                    ),
                  );
                },
                child: Container(
                  height: 42,
                  width: 42,
                  decoration: BoxDecoration(
                    color: QuantColors.elevatedCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: QuantColors.hairlineBorder),
                  ),
                  child: const Icon(
                    Icons.share_rounded,
                    size: 18,
                    color: QuantColors.sovereignCyan,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _reactionBtn(IconData icon, String label) {
    return InkWell(
      borderRadius: BorderRadius.circular(8),
      onTap: () => _triggerReaction(icon, label),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: QuantColors.elevatedCard,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Icon(icon, size: 16, color: QuantColors.moltenOrange),
      ),
    );
  }
}
