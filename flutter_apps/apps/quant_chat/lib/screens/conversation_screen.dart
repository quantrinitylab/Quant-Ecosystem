// Sovereign Quant Ecosystem - QuantChat High-Performance Conversation Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/chat_models.dart';
import '../services/chat_mock_data.dart';
import 'call_screen.dart';

class ConversationScreen extends StatefulWidget {
  final ChatConversation conversation;

  const ConversationScreen({
    super.key,
    required this.conversation,
  });

  @override
  State<ConversationScreen> createState() => _ConversationScreenState();
}

class _ConversationScreenState extends State<ConversationScreen> {
  late List<ChatMessage> _messages;
  final TextEditingController _composerController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final Set<String> _playingAudioMsgIds = {};
  final Map<String, double> _audioProgress = {};
  final Map<String, double> _audioPlaybackSpeeds = {}; // 1.0, 1.5, 2.0
  Timer? _audioPlaybackTimer;
  Timer? _disappearingCountdownTimer;
  bool _isDisappearingMode = false;
  final int _disappearingTtlSeconds = 30;

  @override
  void initState() {
    super.initState();
    _messages = List.from(ChatMockData.getInitialMessages(widget.conversation.id));
    _isDisappearingMode = widget.conversation.isDisappearingModeEnabled;
    _startDisappearingCountdown();
  }

  @override
  void dispose() {
    _composerController.dispose();
    _scrollController.dispose();
    _audioPlaybackTimer?.cancel();
    _disappearingCountdownTimer?.cancel();
    super.dispose();
  }

  void _startDisappearingCountdown() {
    _disappearingCountdownTimer?.cancel();
    _disappearingCountdownTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      bool hasChanges = false;
      for (int i = 0; i < _messages.length; i++) {
        final m = _messages[i];
        if (m.isDisappearing && !m.isServerDestroyed && m.secondsRemaining > 0) {
          final nextRemaining = m.secondsRemaining - 1;
          if (nextRemaining <= 0) {
            _messages[i] = m.copyWith(
              secondsRemaining: 0,
              isServerDestroyed: true,
              text: 'HTTP 410 GONE · Server Destroyed & Purged from Sovereign Mesh',
            );
          } else {
            _messages[i] = m.copyWith(secondsRemaining: nextRemaining);
          }
          hasChanges = true;
        }
      }
      if (hasChanges) {
        setState(() {});
      }
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOutQuad,
        );
      }
    });
  }

  void _sendMessage() {
    final text = _composerController.text.trim();
    if (text.isEmpty) return;

    final newId = 'msg-${DateTime.now().millisecondsSinceEpoch}';
    final now = TimeOfDay.now();
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final outgoingMessage = ChatMessage(
      id: newId,
      conversationId: widget.conversation.id,
      senderId: 'usr-me',
      senderName: 'You',
      text: text,
      timestamp: timeStr,
      isOutgoing: true,
      deliveryStatus: MessageDeliveryStatus.pending,
      type: MessageType.text,
      isDisappearing: _isDisappearingMode,
      disappearingDurationSeconds: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      secondsRemaining: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      isServerDestroyed: false,
      serverDestructionCode: 410,
    );

    setState(() {
      _messages.add(outgoingMessage);
      _composerController.clear();
    });
    _scrollToBottom();

    // 4-stage tick progression:
    // 1. pending (clock icon) -> immediate on send
    // 2. sent (single check) -> 350ms
    // 3. delivered (double check grey) -> 900ms
    // 4. read (double check molten amber #FF8C42) -> 1800ms
    Timer(const Duration(milliseconds: 350), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.sent);
    });

    Timer(const Duration(milliseconds: 900), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.delivered);
    });

    Timer(const Duration(milliseconds: 1800), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.read);
    });
  }

  void _sendVoiceNote() {
    final newId = 'msg-vn-${DateTime.now().millisecondsSinceEpoch}';
    final now = TimeOfDay.now();
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    final outgoingAudio = ChatMessage(
      id: newId,
      conversationId: widget.conversation.id,
      senderId: 'usr-me',
      senderName: 'You',
      text: 'Encrypted Sovereign Voice Memo',
      timestamp: timeStr,
      isOutgoing: true,
      deliveryStatus: MessageDeliveryStatus.pending,
      type: MessageType.audio,
      audioDurationSeconds: 18,
      audioWaveform: const [
        0.2, 0.5, 0.8, 0.4, 0.9, 0.7, 0.3, 0.6,
        0.8, 0.9, 0.5, 0.3, 0.7, 0.8, 0.6, 0.4,
        0.7, 0.9, 0.8, 0.5, 0.3, 0.6, 0.8, 0.4,
      ],
      isDisappearing: _isDisappearingMode,
      disappearingDurationSeconds: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      secondsRemaining: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      isServerDestroyed: false,
      serverDestructionCode: 410,
    );

    setState(() {
      _messages.add(outgoingAudio);
    });
    _scrollToBottom();

    // 4-stage tick progression
    Timer(const Duration(milliseconds: 400), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.sent);
    });
    Timer(const Duration(milliseconds: 1000), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.delivered);
    });
    Timer(const Duration(milliseconds: 2000), () {
      if (!mounted) return;
      _updateMessageStatus(newId, MessageDeliveryStatus.read);
    });
  }

  void _updateMessageStatus(String msgId, MessageDeliveryStatus status) {
    setState(() {
      final idx = _messages.indexWhere((m) => m.id == msgId);
      if (idx != -1) {
        _messages[idx] = _messages[idx].copyWith(deliveryStatus: status);
      }
    });
  }

  void _toggleAudioPlayback(ChatMessage message) {
    setState(() {
      if (_playingAudioMsgIds.contains(message.id)) {
        _playingAudioMsgIds.remove(message.id);
        _audioPlaybackTimer?.cancel();
      } else {
        _playingAudioMsgIds.clear();
        _playingAudioMsgIds.add(message.id);
        _startAudioPlaybackSimulation(message);
      }
    });
  }

  void _cycleAudioPlaybackSpeed(String msgId) {
    final currentSpeed = _audioPlaybackSpeeds[msgId] ?? 1.0;
    final nextSpeed = currentSpeed == 1.0
        ? 1.5
        : (currentSpeed == 1.5 ? 2.0 : 1.0);

    setState(() {
      _audioPlaybackSpeeds[msgId] = nextSpeed;
    });

    // If currently playing this message, restart timer to adopt new speed
    if (_playingAudioMsgIds.contains(msgId)) {
      final msg = _messages.firstWhere((m) => m.id == msgId);
      _startAudioPlaybackSimulation(msg);
    }
  }

  void _scrubAudioProgress(String msgId, double progress) {
    setState(() {
      _audioProgress[msgId] = progress.clamp(0.0, 1.0);
    });
  }

  void _startAudioPlaybackSimulation(ChatMessage message) {
    _audioPlaybackTimer?.cancel();
    final speed = _audioPlaybackSpeeds[message.id] ?? 1.0;
    final durationSecs = message.audioDurationSeconds > 0 ? message.audioDurationSeconds : 10;
    final tickIntervalMs = (100 / speed).round();

    _audioPlaybackTimer = Timer.periodic(Duration(milliseconds: tickIntervalMs), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      final current = _audioProgress[message.id] ?? 0.0;
      final step = 0.1 / durationSecs;
      final next = current + step;

      if (next >= 1.0) {
        timer.cancel();
        setState(() {
          _audioProgress[message.id] = 0.0;
          _playingAudioMsgIds.remove(message.id);
        });
      } else {
        setState(() {
          _audioProgress[message.id] = next;
        });
      }
    });
  }

  void _toggleDisappearingMode() {
    setState(() {
      _isDisappearingMode = !_isDisappearingMode;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Row(
          children: [
            Icon(
              _isDisappearingMode ? Icons.auto_delete_rounded : Icons.timer_off_rounded,
              color: QuantColors.moltenOrange,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              _isDisappearingMode
                  ? 'Disappearing Mode ON: ${_disappearingTtlSeconds}s HTTP 410 server destruction'
                  : 'Disappearing Mode OFF: Standard persistent E2EE',
              style: const TextStyle(color: QuantColors.textPrimary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }

  void _launchCall(QuantCallType callType) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          conversation: widget.conversation,
          callType: callType,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QuantColors.voidObsidian,
      appBar: _buildAppBar(),
      body: SafeArea(
        child: Column(
          children: [
            // E2EE Sovereign Encryption Security Banner
            _buildEncryptionBadge(),

            // Disappearing Messages Status Bar (if active)
            if (_isDisappearingMode) _buildDisappearingModeNotice(),

            // Message Stream
            Expanded(
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                itemCount: _messages.length,
                itemBuilder: (context, idx) {
                  final msg = _messages[idx];
                  return _buildMessageItem(msg);
                },
              ),
            ),

            // Message Composer Bar
            _buildComposerBar(),
          ],
        ),
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    final conv = widget.conversation;
    return AppBar(
      backgroundColor: QuantColors.voidObsidian,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      leadingWidth: 74,
      leading: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          Stack(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: conv.avatarColor.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: conv.avatarColor.withOpacity(0.6), width: 1),
                ),
                child: Center(
                  child: Text(
                    conv.avatarInitials,
                    style: TextStyle(
                      color: conv.avatarColor,
                      fontSize: 13,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ),
              if (conv.isOnline)
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: Container(
                    width: 9,
                    height: 9,
                    decoration: BoxDecoration(
                      color: QuantColors.statusSuccess,
                      shape: BoxShape.circle,
                      border: Border.all(color: QuantColors.voidObsidian, width: 1.5),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      titleSpacing: 8,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            conv.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 2),
          Row(
            children: [
              Container(
                width: 6,
                height: 6,
                decoration: BoxDecoration(
                  color: conv.isOnline ? QuantColors.statusSuccess : QuantColors.textMuted,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 5),
              Text(
                conv.isOnline ? 'Online | E2EE Active' : conv.lastSeenText,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                  color: conv.isOnline ? QuantColors.statusSuccess : QuantColors.textMuted,
                ),
              ),
            ],
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: Icon(
            _isDisappearingMode ? Icons.auto_delete_rounded : Icons.timer_outlined,
            color: _isDisappearingMode ? QuantColors.moltenOrange : QuantColors.textSecondary,
            size: 22,
          ),
          tooltip: 'Toggle Disappearing Messages (HTTP 410)',
          onPressed: _toggleDisappearingMode,
        ),
        IconButton(
          icon: const Icon(Icons.call_outlined, color: Colors.white, size: 22),
          tooltip: 'E2EE Audio Call',
          onPressed: () => _launchCall(QuantCallType.audio),
        ),
        IconButton(
          icon: const Icon(Icons.videocam_outlined, color: Colors.white, size: 24),
          tooltip: 'E2EE Video Call',
          onPressed: () => _launchCall(QuantCallType.video),
        ),
        IconButton(
          icon: const Icon(Icons.more_vert_rounded, color: QuantColors.textSecondary, size: 22),
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                backgroundColor: QuantColors.darkSlateCard,
                content: Text(
                  'Sovereign Signal Double Ratchet Key: Active & Verified',
                  style: TextStyle(color: QuantColors.textPrimary),
                ),
              ),
            );
          },
        ),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1),
        child: Container(
          color: QuantColors.hairlineBorder,
          height: 1,
        ),
      ),
    );
  }

  Widget _buildEncryptionBadge() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
      color: QuantColors.darkSlateCard.withOpacity(0.5),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.lock_rounded, size: 12, color: QuantColors.sovereignCyan),
          SizedBox(width: 6),
          Text(
            'Hardware Keystore E2EE | Zero-Cloud Plaintext Storage',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
              color: QuantColors.sovereignCyan,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDisappearingModeNotice() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
      decoration: BoxDecoration(
        color: QuantColors.moltenOrange.withOpacity(0.12),
        border: const Border(
          bottom: BorderSide(color: QuantColors.moltenOrange, width: 1),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.auto_delete_rounded, size: 14, color: QuantColors.moltenOrange),
          const SizedBox(width: 6),
          Text(
            'Disappearing Messages Active (${_disappearingTtlSeconds}s) · 410 Server Destruction',
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
              color: QuantColors.moltenOrange,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMessageItem(ChatMessage msg) {
    if (msg.isOutgoing) {
      return _buildOutgoingBubble(msg);
    } else {
      return _buildIncomingBubble(msg);
    }
  }

  Widget _buildIncomingBubble(ChatMessage msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF12151E), // Incoming bubble: #12151E
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomRight: Radius.circular(16),
                bottomLeft: Radius.circular(4),
              ),
              border: Border.all(
                color: msg.isServerDestroyed
                    ? QuantColors.statusError.withOpacity(0.5)
                    : (msg.isDisappearing
                        ? QuantColors.moltenOrange.withOpacity(0.4)
                        : QuantColors.hairlineBorder),
                width: 1,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Disappearing message timer header (if applicable)
                if (msg.isDisappearing) _buildDisappearingHeader(msg),

                if (msg.isServerDestroyed)
                  _buildServerDestroyedTombstone(msg)
                else if (msg.type == MessageType.audio)
                  _buildAudioPlayer(msg, isOutgoing: false)
                else
                  Text(
                    msg.text,
                    style: const TextStyle(
                      color: QuantColors.textPrimary,
                      fontSize: 14,
                      height: 1.45,
                    ),
                  ),
                const SizedBox(height: 4),
                Text(
                  msg.timestamp,
                  style: const TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildOutgoingBubble(ChatMessage msg) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: msg.isServerDestroyed
                  ? const Color(0xFF1F1418)
                  : const Color(0xFFFF8C42), // Outgoing bubble: #FF8C42
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(16),
                topRight: Radius.circular(16),
                bottomLeft: Radius.circular(16),
                bottomRight: Radius.circular(4),
              ),
              border: msg.isServerDestroyed
                  ? Border.all(color: QuantColors.statusError.withOpacity(0.5))
                  : null,
              boxShadow: [
                BoxShadow(
                  color: (msg.isServerDestroyed ? QuantColors.statusError : const Color(0xFFFF8C42))
                      .withOpacity(0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                // Disappearing message timer header (if applicable)
                if (msg.isDisappearing) _buildDisappearingHeader(msg),

                if (msg.isServerDestroyed)
                  _buildServerDestroyedTombstone(msg)
                else if (msg.type == MessageType.audio)
                  _buildAudioPlayer(msg, isOutgoing: true)
                else
                  Text(
                    msg.text,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 14,
                      fontWeight: FontWeight.w500,
                      height: 1.45,
                    ),
                  ),
                const SizedBox(height: 4),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      msg.timestamp,
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.85),
                        fontSize: 10,
                      ),
                    ),
                    const SizedBox(width: 4),
                    _buildDeliveryTick(msg.deliveryStatus, isOutgoing: true),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// 4-stage tick progression:
  /// - pending (clock icon)
  /// - sent (single check)
  /// - delivered (double check grey)
  /// - read (double check molten amber #FF8C42)
  Widget _buildDeliveryTick(MessageDeliveryStatus status, {bool isOutgoing = false}) {
    switch (status) {
      case MessageDeliveryStatus.pending:
        return const Icon(
          Icons.access_time_rounded,
          size: 13,
          color: Color(0xFFE2E8F0),
        );
      case MessageDeliveryStatus.sent:
        return const Icon(
          Icons.check_rounded,
          size: 14,
          color: Colors.white,
        );
      case MessageDeliveryStatus.delivered:
        return const Icon(
          Icons.done_all_rounded,
          size: 14,
          color: Color(0xFF94A3B8), // Double check grey
        );
      case MessageDeliveryStatus.read:
        return const Icon(
          Icons.done_all_rounded,
          size: 14,
          color: Color(0xFFFF8C42), // Double check molten amber #FF8C42
        );
    }
  }

  Widget _buildDisappearingHeader(ChatMessage msg) {
    if (msg.isServerDestroyed) {
      return Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        decoration: BoxDecoration(
          color: QuantColors.statusError.withOpacity(0.18),
          borderRadius: BorderRadius.circular(6),
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.delete_forever_rounded, size: 11, color: QuantColors.statusError),
            SizedBox(width: 4),
            Text(
              'HTTP 410 GONE · DESTROYED',
              style: TextStyle(
                color: QuantColors.statusError,
                fontSize: 9,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.3,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.25),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: QuantColors.moltenOrange.withOpacity(0.5),
          width: 0.8,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timer_outlined, size: 11, color: QuantColors.moltenOrange),
          const SizedBox(width: 4),
          Text(
            '410 Server Destruction: ${msg.secondsRemaining}s',
            style: const TextStyle(
              color: QuantColors.moltenOrange,
              fontSize: 9,
              fontWeight: FontWeight.w700,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildServerDestroyedTombstone(ChatMessage msg) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.delete_forever_rounded, size: 16, color: QuantColors.statusError),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              msg.text,
              style: const TextStyle(
                color: QuantColors.textMuted,
                fontSize: 12,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Waveform audio message player with scrubber and 1.0x/1.5x/2.0x speed toggle.
  Widget _buildAudioPlayer(ChatMessage msg, {required bool isOutgoing}) {
    final isPlaying = _playingAudioMsgIds.contains(msg.id);
    final progress = _audioProgress[msg.id] ?? 0.0;
    final speed = _audioPlaybackSpeeds[msg.id] ?? 1.0;
    final waveform = msg.audioWaveform.isNotEmpty
        ? msg.audioWaveform
        : [0.3, 0.6, 0.9, 0.4, 0.7, 0.8, 0.5, 0.9, 0.6, 0.3, 0.7, 0.5];

    final currentSeconds = (msg.audioDurationSeconds * progress).toInt();
    final remainingSeconds = msg.audioDurationSeconds - currentSeconds;

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              // Play / Pause Circle Button
              InkWell(
                borderRadius: BorderRadius.circular(20),
                onTap: () => _toggleAudioPlayback(msg),
                child: Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    color: isOutgoing
                        ? Colors.white.withOpacity(0.25)
                        : QuantColors.moltenOrange.withOpacity(0.2),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    isPlaying ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    size: 22,
                    color: Colors.white,
                  ),
                ),
              ),
              const SizedBox(width: 8),

              // Interactive Waveform Scrubber
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    return GestureDetector(
                      behavior: HitTestBehavior.opaque,
                      onHorizontalDragUpdate: (details) {
                        final width = constraints.maxWidth;
                        if (width > 0) {
                          final scrubProgress = (details.localPosition.dx / width).clamp(0.0, 1.0);
                          _scrubAudioProgress(msg.id, scrubProgress);
                        }
                      },
                      onTapDown: (details) {
                        final width = constraints.maxWidth;
                        if (width > 0) {
                          final scrubProgress = (details.localPosition.dx / width).clamp(0.0, 1.0);
                          _scrubAudioProgress(msg.id, scrubProgress);
                        }
                      },
                      child: SizedBox(
                        height: 28,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.center,
                          children: List.generate(waveform.length, (idx) {
                            final barHeight = 8.0 + (waveform[idx] * 18.0);
                            final barProgress = idx / waveform.length;
                            final isPast = barProgress <= progress;

                            return Expanded(
                              child: Container(
                                margin: const EdgeInsets.symmetric(horizontal: 1),
                                height: barHeight,
                                decoration: BoxDecoration(
                                  color: isOutgoing
                                      ? (isPast ? Colors.white : Colors.white.withOpacity(0.35))
                                      : (isPast
                                          ? QuantColors.moltenOrange
                                          : QuantColors.hairlineBorder),
                                  borderRadius: BorderRadius.circular(2),
                                ),
                              ),
                            );
                          }),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(width: 8),

              // 1.0x / 1.5x / 2.0x Speed Toggle Button
              InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => _cycleAudioPlaybackSpeed(msg.id),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(
                    color: isOutgoing
                        ? Colors.white.withOpacity(0.25)
                        : QuantColors.darkSlateSurface,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: isOutgoing
                          ? Colors.white.withOpacity(0.4)
                          : QuantColors.hairlineBorder,
                    ),
                  ),
                  child: Text(
                    '${speed.toStringAsFixed(1)}x',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w800,
                      color: isOutgoing ? Colors.white : QuantColors.moltenOrange,
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 3),
          Padding(
            padding: const EdgeInsets.only(left: 46, right: 4),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '0:${currentSeconds.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isOutgoing ? Colors.white.withOpacity(0.9) : QuantColors.textMuted,
                  ),
                ),
                Text(
                  '-0:${remainingSeconds.toString().padLeft(2, '0')}',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: isOutgoing ? Colors.white.withOpacity(0.9) : QuantColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildComposerBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Attachment Button
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded, color: QuantColors.textSecondary, size: 24),
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  backgroundColor: QuantColors.darkSlateCard,
                  content: Text(
                    'E2EE Media Bridge: File / Photo encrypted locally.',
                    style: TextStyle(color: QuantColors.textPrimary),
                  ),
                ),
              );
            },
          ),

          // Message Input Field
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: _isDisappearingMode
                      ? QuantColors.moltenOrange.withOpacity(0.6)
                      : QuantColors.hairlineBorder,
                ),
              ),
              child: TextField(
                controller: _composerController,
                style: const TextStyle(color: Colors.white, fontSize: 14),
                minLines: 1,
                maxLines: 4,
                onSubmitted: (_) => _sendMessage(),
                decoration: InputDecoration(
                  hintText: _isDisappearingMode
                      ? 'Type disappearing message (${_disappearingTtlSeconds}s)...'
                      : 'Type an encrypted message...',
                  hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),

          // Voice Note Record Button
          IconButton(
            icon: const Icon(Icons.mic_rounded, color: QuantColors.moltenOrange, size: 24),
            tooltip: 'Record Voice Memo',
            onPressed: _sendVoiceNote,
          ),

          // Send Button
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _sendMessage,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFFF8C42),
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}
