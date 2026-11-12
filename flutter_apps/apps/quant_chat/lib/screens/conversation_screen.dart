// Sovereign Quant Ecosystem - QuantChat High-Performance Conversation Screen
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/chat_models.dart';
import '../widgets/call_sheet.dart';
import '../widgets/chat_media_sheet.dart';
import 'call_screen.dart';
import 'group/group_detail_screen.dart';
import 'security/safety_number_screen.dart';

/// Phase 1B — screenshot detection stub.
///
/// HONEST SCOPE: detection + in-thread notice ONLY. Screenshots can never
/// be prevented (least of all on web) — this class must never claim
/// prevention, and no UI copy may imply it.
///
/// The detection source is platform-native: Android FileObserver on the
/// screenshots directory, iOS UIApplicationUserDidTakeScreenshotNotification,
/// both delivered over a MethodChannel ('quantchat/screenshot'). No plugin
/// is wired in this build (no new dependencies per project rules); until
/// the native side lands, this class is inert and _reportScreenshot is
/// never called. debugSimulateScreenshot exists for manual testing only.
class _ScreenshotWatch {
  void Function()? _onScreenshot;

  void start(void Function() onScreenshot) {
    _onScreenshot = onScreenshot;
  }

  void dispose() {
    _onScreenshot = null;
  }

  /// Manual-test hook only: pretend a screenshot fired right now.
  void debugSimulateScreenshot() {
    _onScreenshot?.call();
  }
}

/// One row of the long-press message menu (Phase 1B).
class _MessageMenuAction {
  final IconData icon;
  final String label;
  final void Function() onTap;

  const _MessageMenuAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });
}

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
  int _disappearingTtlSeconds = 30;

  // Phase 1B — view-once snap viewing session. Only one snap is open at a
  // time; the countdown is driven by _snapViewTimer.
  String? _viewingSnapId;
  int _snapViewRemainingSeconds = 0;
  int _snapViewTotalSeconds = 1;
  Timer? _snapViewTimer;

  // Phase 1B — composer snap mode: 'off' | 'disappearing' | 'view-once'.
  String _composerSnapMode = 'off';
  // View-once view window (seconds) once a snap is opened.
  static const int _viewOnceViewSeconds = 10;

  // Phase 1B — screenshot notice wiring (detection + notice only).
  final _ScreenshotWatch _screenshotWatch = _ScreenshotWatch();

  // Mobbin Flow-4: screenshot/record system notices render as stacked
  // DISMISSIBLE pills above the date divider, never as chat bubbles.
  // The ids here are permanently dismissed for this thread view.
  final Set<String> _dismissedNoticeIds = <String>{};

  // Voice memo recording state
  bool _isRecordingVoiceMemo = false;
  int _recordingDurationSeconds = 0;
  List<double> _liveRecordingWaveform = [];
  Timer? _recordingTimer;
  Timer? _liveWaveformTimer;

  @override
  void initState() {
    super.initState();
    // No mock data: messages load from the real backend for this conversation.
    _messages = <ChatMessage>[];
    _isDisappearingMode = widget.conversation.isDisappearingModeEnabled;
    _startDisappearingCountdown();
    // Phase 1B: attribute any screenshot to the snap on screen right now.
    _screenshotWatch.start(() {
      final viewingId = _viewingSnapId;
      if (viewingId != null) {
        _reportScreenshot(viewingId);
      }
    });
  }

  @override
  void dispose() {
    _composerController.dispose();
    _scrollController.dispose();
    _audioPlaybackTimer?.cancel();
    _disappearingCountdownTimer?.cancel();
    _snapViewTimer?.cancel();
    _recordingTimer?.cancel();
    _liveWaveformTimer?.cancel();
    _screenshotWatch.dispose();
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
        // Phase 1B: an unopened view-once snap has no ticking countdown —
        // its view timer starts when it is opened (_openSnap). A snap that
        // is open right now is driven by _snapViewTimer instead.
        final isUnopenedSnap = m.isViewOnce && !m.hasBeenViewed;
        final isBeingViewed = _viewingSnapId != null && m.id == _viewingSnapId;
        if (m.isDisappearing &&
            !m.isServerDestroyed &&
            m.secondsRemaining > 0 &&
            !isUnopenedSnap &&
            !isBeingViewed) {
          final nextRemaining = m.secondsRemaining - 1;
          if (nextRemaining <= 0) {
            _messages[i] = m.copyWith(
              secondsRemaining: 0,
              isServerDestroyed: true,
              text: 'This message expired and was removed from this device.',
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

  /// Send entry point. A view-once snap always passes through the
  /// confirmation dialog first (Phase 1B).
  void _onSendPressed() {
    if (_composerSnapMode == 'view-once') {
      _confirmViewOnceSend();
      return;
    }
    _sendMessage();
  }

  /// Confirmation step before sending a view-once snap (Phase 1B): the
  /// recipient opens it once, it is removed after viewing, and a
  /// screenshot notifies the sender.
  void _confirmViewOnceSend() {
    final text = _composerController.text.trim();
    if (text.isEmpty) return;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QuantColors.darkSlateCard,
        title: const Text(
          'Send as view-once snap?',
          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700),
        ),
        content: const Text(
          'The recipient can open it once. It is removed after viewing, and a screenshot notifies you.',
          style: TextStyle(color: QuantColors.textSecondary, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel', style: TextStyle(color: QuantColors.textMuted)),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              _sendMessage();
            },
            child: const Text(
              'Send snap',
              style: TextStyle(color: QuantColors.moltenOrange, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  void _sendMessage() {
    final text = _composerController.text.trim();
    if (text.isEmpty) return;

    final newId = 'msg-${DateTime.now().millisecondsSinceEpoch}';
    final now = TimeOfDay.now();
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    // Phase 1B: the outgoing snap kind comes from the composer selector.
    // A view-once snap carries its view window in
    // disappearingDurationSeconds; the window only starts on open.
    final isViewOnce = _composerSnapMode == 'view-once';
    final isDisappearing = _isDisappearingMode || _composerSnapMode != 'off';
    final ttl = isViewOnce ? _viewOnceViewSeconds : _disappearingTtlSeconds;

    // HONEST SEND: this build has no messaging transport wired up — there is
    // no API client, socket, or auth session in this tree, so a composed
    // message goes nowhere. It is therefore recorded immediately in the
    // terminal `notSent` state with a visible "Not sent" caption. Delivery
    // states (sent/delivered/read) may only ever be set from real server or
    // socket acknowledgements once a transport exists — never from timers.
    final outgoingMessage = ChatMessage(
      id: newId,
      conversationId: widget.conversation.id,
      senderId: 'usr-me',
      senderName: 'You',
      text: text,
      timestamp: timeStr,
      isOutgoing: true,
      deliveryStatus: MessageDeliveryStatus.notSent,
      type: MessageType.text,
      isDisappearing: isDisappearing,
      disappearingDurationSeconds: isDisappearing ? ttl : 0,
      secondsRemaining: isDisappearing && !isViewOnce ? ttl : 0,
      isServerDestroyed: false,
      serverDestructionCode: 410,
      isViewOnce: isViewOnce,
    );

    setState(() {
      _messages.add(outgoingMessage);
      _composerController.clear();
    });
    _scrollToBottom();
  }

  void _startVoiceMemoRecording() {
    setState(() {
      _isRecordingVoiceMemo = true;
      _recordingDurationSeconds = 0;
      _liveRecordingWaveform = [0.3, 0.5, 0.4, 0.7, 0.9, 0.6, 0.4];
    });

    _recordingTimer?.cancel();
    _recordingTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _recordingDurationSeconds++;
      });
    });

    _liveWaveformTimer?.cancel();
    _liveWaveformTimer = Timer.periodic(const Duration(milliseconds: 140), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        final nextAmp = 0.2 + ((DateTime.now().millisecond % 80) / 100.0);
        if (_liveRecordingWaveform.length >= 28) {
          _liveRecordingWaveform.removeAt(0);
        }
        _liveRecordingWaveform.add(nextAmp.clamp(0.15, 1.0));
      });
    });
  }

  void _cancelVoiceMemoRecording() {
    _recordingTimer?.cancel();
    _liveWaveformTimer?.cancel();
    setState(() {
      _isRecordingVoiceMemo = false;
      _recordingDurationSeconds = 0;
      _liveRecordingWaveform.clear();
    });
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: Duration(seconds: 1),
        content: Text(
          'Voice memo discarded.',
          style: TextStyle(color: QuantColors.textPrimary),
        ),
      ),
    );
  }

  void _sendRecordedVoiceMemo() {
    _recordingTimer?.cancel();
    _liveWaveformTimer?.cancel();

    final duration = _recordingDurationSeconds > 0 ? _recordingDurationSeconds : 3;
    final waveform = _liveRecordingWaveform.isNotEmpty
        ? List<double>.from(_liveRecordingWaveform)
        : const [0.3, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.8, 0.6, 0.3];

    final newId = 'msg-vn-${DateTime.now().millisecondsSinceEpoch}';
    final now = TimeOfDay.now();
    final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';

    // HONEST SEND: same rule as text messages — no transport exists in this
    // build, so the voice memo is recorded locally as `notSent`. No timer
    // may promote it to sent/delivered/read.
    final outgoingAudio = ChatMessage(
      id: newId,
      conversationId: widget.conversation.id,
      senderId: 'usr-me',
      senderName: 'You',
      text: 'Voice memo (${duration}s)',
      timestamp: timeStr,
      isOutgoing: true,
      deliveryStatus: MessageDeliveryStatus.notSent,
      type: MessageType.audio,
      audioDurationSeconds: duration,
      audioWaveform: waveform,
      isDisappearing: _isDisappearingMode,
      disappearingDurationSeconds: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      secondsRemaining: _isDisappearingMode ? _disappearingTtlSeconds : 0,
      isServerDestroyed: false,
      serverDestructionCode: 410,
    );

    setState(() {
      _isRecordingVoiceMemo = false;
      _recordingDurationSeconds = 0;
      _liveRecordingWaveform.clear();
      _messages.add(outgoingAudio);
    });
    _scrollToBottom();
  }

  /// Single entry point for delivery-status changes. A future messaging
  /// transport must call this ONLY in response to real server/socket
  /// acknowledgements (message accepted, delivered, read). Nothing in this
  /// build calls it today, because no transport is connected — outgoing
  /// messages stay in their honest `notSent` state.
  void _updateMessageStatus(String msgId, MessageDeliveryStatus status) {
    setState(() {
      final idx = _messages.indexWhere((m) => m.id == msgId);
      if (idx != -1) {
        _messages[idx] = _messages[idx].copyWith(deliveryStatus: status);
      }
    });
  }

  /// Phase 1B — honest no-transport notice. This build has no messaging API
  /// client (see the HONEST SEND notes): server-backed actions (revoke,
  /// keep, screenshot notice, per-contact default sync) cannot run here.
  /// Nothing in this file may fake a server acknowledgement.
  void _transportNotWiredNotice(String action) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Text(
          '$action is not available — no connection in this build.',
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12),
        ),
      ),
    );
  }

  /// Reports a screenshot of the currently-viewed snap. The backend posts
  /// the in-thread system notice ("<name> took a screenshot", Task 14.10),
  /// which this client renders as a dismissible pill in _buildNoticeBanner.
  /// Detection + notice ONLY — never prevention.
  void _reportScreenshot(String messageId) {
    // TODO(transport): POST /conversations/messages/:messageId/screenshot
    // once the API client exists in this tree.
    _transportNotWiredNotice('Screenshot notice');
  }

  /// System notices currently visible as banner pills (Mobbin Flow-4):
  /// screenshot/record notices posted by the backend (Task 14.10), minus
  /// any the user dismissed.
  List<ChatMessage> _visibleNotices() {
    return _messages
        .where((m) => m.type == MessageType.system && !_dismissedNoticeIds.contains(m.id))
        .toList();
  }

  void _dismissNotice(String messageId) {
    setState(() {
      _dismissedNoticeIds.add(messageId);
    });
  }

  /// Stacked dismissible notice pills + the TODAY divider (Mobbin Flow-4).
  /// Renders above the message stream: screenshot/record notices are
  /// detection + notice only — never prevention.
  Widget _buildNoticeBanner() {
    final notices = _visibleNotices();
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final n in notices)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                children: [
                  const Icon(Icons.visibility_rounded, size: 14, color: QuantColors.moltenOrange),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      n.text,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: () => _dismissNotice(n.id),
                    child: const Padding(
                      padding: EdgeInsets.all(4),
                      child: Icon(Icons.close_rounded, size: 14, color: QuantColors.textMuted),
                    ),
                  ),
                ],
              ),
            ),
          ),
        // Date divider (Mobbin Flow-4): notice pills sit above it.
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(
            children: [
              const Expanded(child: Divider(color: QuantColors.hairlineBorder, thickness: 1)),
              Container(
                margin: const EdgeInsets.symmetric(horizontal: 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: QuantColors.darkSlateCard,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: QuantColors.hairlineBorder),
                ),
                child: const Text(
                  'TODAY',
                  style: TextStyle(
                    color: QuantColors.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                  ),
                ),
              ),
              const Expanded(child: Divider(color: QuantColors.hairlineBorder, thickness: 1)),
            ],
          ),
        ),
      ],
    );
  }

  /// TODAY divider without any notice pills (keeps thread chrome
  /// consistent when there is nothing to announce).
  Widget _buildDateDividerOnly() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(
        children: [
          const Expanded(child: Divider(color: QuantColors.hairlineBorder, thickness: 1)),
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 10),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              color: QuantColors.darkSlateCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.hairlineBorder),
            ),
            child: const Text(
              'TODAY',
              style: TextStyle(
                color: QuantColors.textMuted,
                fontSize: 10,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.6,
              ),
            ),
          ),
          const Expanded(child: Divider(color: QuantColors.hairlineBorder, thickness: 1)),
        ],
      ),
    );
  }

  /// True for a view-once snap the recipient has not opened yet.
  bool _isUnopenedSnap(ChatMessage msg) {
    return msg.isViewOnce && !msg.hasBeenViewed && !msg.isRevoked && !msg.isServerDestroyed;
  }

  /// Opens a view-once snap: marks it viewed locally and starts the
  /// view-timer countdown. The backend's view timer is the authority; the
  /// local countdown is display-only.
  void _openSnap(ChatMessage msg) {
    if (!_isUnopenedSnap(msg)) return;
    final total = msg.disappearingDurationSeconds > 0
        ? msg.disappearingDurationSeconds
        : _viewOnceViewSeconds;
    setState(() {
      _viewingSnapId = msg.id;
      _snapViewTotalSeconds = total;
      _snapViewRemainingSeconds = total;
      final idx = _messages.indexWhere((m) => m.id == msg.id);
      if (idx != -1) {
        _messages[idx] = msg.copyWith(hasBeenViewed: true);
      }
    });
    _snapViewTimer?.cancel();
    _snapViewTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) {
        timer.cancel();
        return;
      }
      setState(() {
        _snapViewRemainingSeconds--;
        if (_snapViewRemainingSeconds <= 0) {
          timer.cancel();
          _closeSnapView(msg.id);
        }
      });
    });
    // TODO(transport): POST /conversations/messages/:id/view with
    // { timerSeconds: total } — the backend starts the authoritative
    // destruction timer on first view (Task 14.9).
  }

  void _closeSnapView(String messageId) {
    _snapViewTimer?.cancel();
    setState(() {
      if (_viewingSnapId == messageId) {
        _viewingSnapId = null;
        final idx = _messages.indexWhere((m) => m.id == messageId);
        if (idx != -1) {
          final m = _messages[idx];
          // After a view-once viewing ends the content is gone locally;
          // the server destroys it on its own timer (HTTP 410 semantics).
          _messages[idx] = m.copyWith(
            isServerDestroyed: true,
            text: 'Snap viewed — removed from this device.',
          );
        }
      }
    });
  }

  /// Sender revokes an UNVIEWED disappearing message (Phase 1B).
  void _revokeMessage(ChatMessage msg) {
    // TODO(transport): POST /conversations/messages/:id/revoke. The server
    // is the authority (409 MESSAGE_ALREADY_VIEWED when already viewed);
    // the client only marks revoked on a 2xx response.
    _transportNotWiredNotice('Revoke');
  }

  /// Recipient asks the sender to keep a disappearing message (Phase 1B).
  /// The request alone keeps nothing — the sender must consent.
  void _requestKeep(ChatMessage msg) {
    // TODO(transport): POST /conversations/messages/:id/keep-request.
    _transportNotWiredNotice('Ask to keep');
  }

  /// Sender allows or declines a recipient's keep request (Phase 1B).
  void _resolveKeep(ChatMessage msg, bool allow) {
    // TODO(transport): POST /conversations/messages/:id/keep-consent with
    // { decision: 'granted' | 'denied' }.
    _transportNotWiredNotice(allow ? 'Allow keep' : 'Decline keep');
  }

  /// Long-press message menu (Phase 1B).
  void _showMessageMenu(ChatMessage msg) {
    final actions = <_MessageMenuAction>[];
    // Sender can revoke an UNVIEWED disappearing message.
    if (msg.isOutgoing &&
        msg.isDisappearing &&
        !msg.hasBeenViewed &&
        !msg.isServerDestroyed &&
        !msg.isRevoked) {
      actions.add(_MessageMenuAction(
        icon: Icons.undo_rounded,
        label: 'Revoke',
        onTap: () => _revokeMessage(msg),
      ));
    }
    // Recipient may ask the sender to keep a disappearing message.
    if (!msg.isOutgoing &&
        msg.isDisappearing &&
        !msg.isServerDestroyed &&
        !msg.isKeptByRecipient) {
      actions.add(_MessageMenuAction(
        icon: Icons.bookmark_add_outlined,
        label: 'Ask sender to keep',
        onTap: () => _requestKeep(msg),
      ));
    }
    // Sender resolves a pending keep request.
    if (msg.isOutgoing && msg.keepRequestPending && !msg.isServerDestroyed) {
      actions.add(_MessageMenuAction(
        icon: Icons.bookmark_added_rounded,
        label: 'Allow keep',
        onTap: () => _resolveKeep(msg, true),
      ));
      actions.add(_MessageMenuAction(
        icon: Icons.bookmark_remove_outlined,
        label: 'Decline keep',
        onTap: () => _resolveKeep(msg, false),
      ));
    }
    if (actions.isEmpty) return;
    showModalBottomSheet(
      context: context,
      backgroundColor: QuantColors.darkSlateCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (final a in actions)
              ListTile(
                leading: Icon(a.icon, color: QuantColors.textPrimary, size: 20),
                title: Text(
                  a.label,
                  style: const TextStyle(color: QuantColors.textPrimary, fontSize: 14),
                ),
                onTap: () {
                  Navigator.of(ctx).pop();
                  a.onTap();
                },
              ),
          ],
        ),
      ),
    );
  }

  /// Per-contact disappearing default (Phase 1B): '24h' arms the 24-hour
  /// default, 'off' clears it.
  void _setDisappearingDefault(String value) {
    setState(() {
      if (value == '24h') {
        _isDisappearingMode = true;
        _disappearingTtlSeconds = 24 * 60 * 60;
      } else {
        _isDisappearingMode = false;
      }
    });
    // TODO(transport): POST /conversations/:id/disappearing-default with
    // { mode: value } — the server persists the per-contact default
    // (Phase 1B backend). Until then the default applies on this device
    // only.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QuantColors.darkSlateCard,
        duration: const Duration(seconds: 2),
        content: Text(
          value == '24h'
              ? 'Disappearing default: 24h (this device only — server sync pending)'
              : 'Disappearing default: Off',
          style: const TextStyle(color: QuantColors.textPrimary, fontSize: 12),
        ),
      ),
    );
  }

  /// Compact duration label: 10s / 5m / 24h / 7d.
  String _formatDuration(int seconds) {
    if (seconds <= 0) return 'expired';
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) return '${seconds ~/ 60}m';
    if (seconds < 86400) return '${seconds ~/ 3600}h';
    return '${seconds ~/ 86400}d';
  }

  /// Expiry label for a disappearing message: the view window for view-once
  /// snaps, the remaining countdown otherwise.
  String _formatExpiryLabel(ChatMessage msg) {
    if (msg.isViewOnce && !msg.hasBeenViewed) {
      return _formatDuration(msg.disappearingDurationSeconds);
    }
    return _formatDuration(msg.secondsRemaining);
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

  void _launchCallSheet(QuantCallType callType) {
    WebRTCCallSheet.show(
      context,
      conversation: widget.conversation,
      callType: callType,
    );
  }

  void _launchCall(QuantCallType callType) {
    _launchCallSheet(callType);
  }

  void _launchFullscreenCall(QuantCallType callType) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => CallScreen(
          conversation: widget.conversation,
          callType: callType,
        ),
      ),
    );
  }

  void _navigateToDetails() {
    if (widget.conversation.isGroup) {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => GroupDetailScreen(conversation: widget.conversation),
        ),
      );
    } else {
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => SafetyNumberScreen(
            contactName: widget.conversation.name,
            contactInitials: widget.conversation.avatarInitials,
            contactAvatarColor: widget.conversation.avatarColor,
          ),
        ),
      );
    }
  }

  void _openMediaSheet() {
    ChatMediaSheet.show(
      context,
      onActionSelected: (type, data) {
        final now = TimeOfDay.now();
        final timeStr = '${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}';
        final newId = 'msg-${DateTime.now().millisecondsSinceEpoch}';

        // HONEST SEND: media shares go through the same rule as text — no
        // transport exists in this build, nothing is uploaded or delivered,
        // and no fabricated file metadata, codec claims, or GPS coordinates
        // are attached. The item is recorded locally as `notSent` with a
        // plain label.
        String textMsg = '';
        MessageType msgType = MessageType.text;

        switch (type) {
          case ChatMediaType.document:
            textMsg = 'Document';
            msgType = MessageType.document;
            break;
          case ChatMediaType.camera:
            textMsg = 'Photo';
            msgType = MessageType.image;
            break;
          case ChatMediaType.gallery:
            textMsg = 'Media';
            msgType = MessageType.image;
            break;
          case ChatMediaType.audio:
            textMsg = 'Voice note';
            msgType = MessageType.audio;
            break;
          case ChatMediaType.location:
            textMsg = 'Location';
            msgType = MessageType.text;
            break;
          case ChatMediaType.contact:
            textMsg = 'Contact card';
            msgType = MessageType.text;
            break;
        }

        final outgoing = ChatMessage(
          id: newId,
          conversationId: widget.conversation.id,
          senderId: 'usr-me',
          senderName: 'You',
          text: textMsg,
          timestamp: timeStr,
          isOutgoing: true,
          deliveryStatus: MessageDeliveryStatus.notSent,
          type: msgType,
          isDisappearing: _isDisappearingMode,
          disappearingDurationSeconds: _isDisappearingMode ? _disappearingTtlSeconds : 0,
          secondsRemaining: _isDisappearingMode ? _disappearingTtlSeconds : 0,
        );

        setState(() {
          _messages.add(outgoing);
        });
        _scrollToBottom();
      },
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

            // Mobbin Flow-4: stacked dismissible notice pills above the
            // TODAY divider, ahead of the message stream.
            if (_visibleNotices().isNotEmpty) _buildNoticeBanner() else _buildDateDividerOnly(),

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
      leadingWidth: 92,
      leading: Row(
        children: [
          const SizedBox(width: 4),
          IconButton(
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20, color: Colors.white),
            onPressed: () => Navigator.of(context).pop(),
          ),
          GestureDetector(
            onTap: _navigateToDetails,
            child: Stack(
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
          ),
        ],
      ),
      titleSpacing: 8,
      title: GestureDetector(
        onTap: _navigateToDetails,
        child: Column(
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
                  conv.isGroup
                      ? '${conv.memberCount} members'
                      : (conv.isOnline ? 'Online' : conv.lastSeenText),
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
      ),
      actions: [
        // Phase 1B — per-contact disappearing default:
        // Off / 24h (server persistence via POST
        // /conversations/:id/disappearing-default is a TODO until the
        // transport exists; the default applies on this device meanwhile).
        PopupMenuButton<String>(
          icon: Icon(
            _isDisappearingMode ? Icons.auto_delete_rounded : Icons.timer_outlined,
            color: _isDisappearingMode ? QuantColors.moltenOrange : QuantColors.textSecondary,
            size: 22,
          ),
          tooltip: 'Disappearing messages',
          color: QuantColors.darkSlateCard,
          onSelected: _setDisappearingDefault,
          itemBuilder: (context) => const [
            PopupMenuItem(
              value: 'off',
              child: Text('Off', style: TextStyle(color: QuantColors.textPrimary, fontSize: 14)),
            ),
            PopupMenuItem(
              value: '24h',
              child: Text('24 hours', style: TextStyle(color: QuantColors.textPrimary, fontSize: 14)),
            ),
          ],
        ),
        IconButton(
          icon: const Icon(Icons.call_outlined, color: Colors.white, size: 22),
          tooltip: 'Audio Call',
          onPressed: () => _launchCall(QuantCallType.audio),
        ),
        IconButton(
          icon: const Icon(Icons.videocam_outlined, color: Colors.white, size: 24),
          tooltip: 'Video Call',
          onPressed: () => _launchCall(QuantCallType.video),
        ),
        IconButton(
          icon: const Icon(Icons.more_vert_rounded, color: QuantColors.textSecondary, size: 22),
          onPressed: _navigateToDetails,
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

  /// Connection-state banner. This build has no messaging transport or
  /// encryption layer wired up, so the banner says exactly that instead of
  /// claiming end-to-end encryption that does not exist here.
  Widget _buildEncryptionBadge() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
      color: QuantColors.darkSlateCard.withOpacity(0.5),
      child: const Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.cloud_off_rounded, size: 12, color: QuantColors.statusWarning),
          SizedBox(width: 6),
          Text(
            'Not connected — messages cannot be sent from this build yet',
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.2,
              color: QuantColors.statusWarning,
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
            'Disappearing Messages Active (${_formatDuration(_disappearingTtlSeconds)}) · Removed from this device only',
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
    // Mobbin Flow-4: screenshot/record system notices live in the
    // dismissible banner stack above the date divider (see
    // _buildNoticeBanner), never as inline bubbles.
    if (msg.type == MessageType.system) {
      return const SizedBox.shrink();
    }
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
          GestureDetector(
            onLongPress: () => _showMessageMenu(msg),
            child: Container(
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
                else if (_viewingSnapId == msg.id && msg.isViewOnce)
                  _buildSnapViewer(msg)
                else if (_isUnopenedSnap(msg))
                  // View-once snap, not yet opened: placeholder bubble with
                  // the expiry badge VISIBLE — never the content.
                  _buildUnopenedSnapPlaceholder(msg)
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
          GestureDetector(
            onLongPress: () => _showMessageMenu(msg),
            child: Container(
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
                // Mobbin Flow-4: outgoing view-once snaps lead with the
                // glyph + label status row (Delivered / Opened).
                if (msg.isViewOnce && !msg.isServerDestroyed && !msg.isRevoked)
                  _buildSentSnapStatusRow(msg),

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
                // Honest failure caption: a notSent message was never handed
                // to any transport, and the bubble must say so in words.
                if (msg.deliveryStatus == MessageDeliveryStatus.notSent) ...[
                  const SizedBox(height: 4),
                  const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline_rounded, size: 11, color: QuantColors.statusError),
                      SizedBox(width: 4),
                      Text(
                        'Not sent — no connection',
                        style: TextStyle(
                          color: QuantColors.statusError,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
            ),
          ),
        ],
      ),
    );
  }

  /// Delivery tick rendering:
  /// - Clock: Sending (Icons.access_time_rounded, grey)
  /// - SingleGrey: Sent to server (Icons.check_rounded, grey)
  /// - DoubleGrey: Delivered to recipient device (Icons.done_all_rounded, grey)
  /// - DoubleCyan: Read by recipient (Icons.done_all_rounded, cyan #00E5FF)
  /// - NotSent: Never handed to a transport (Icons.error_outline_rounded, red)
  /// Sent/delivered/read may only be produced by real transport
  /// acknowledgements; nothing advances them locally.
  Widget _buildDeliveryTick(MessageDeliveryStatus status, {bool isOutgoing = false}) {
    return DeliveryTickWidget(
      status: status,
      size: 14,
      overrideColor: status == MessageDeliveryStatus.notSent
          ? QuantColors.statusError
          : (status == MessageDeliveryStatus.read
              ? QuantColors.sovereignCyan
              : (isOutgoing ? const Color(0xFFCBD5E1) : const Color(0xFF94A3B8))),
    );
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
              'EXPIRED · REMOVED FROM THIS DEVICE',
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

    // Phase 1B — viewed vs saved-by-recipient states render differently.
    if (msg.isKeptByRecipient) {
      return _buildSnapStateChip(
        icon: Icons.bookmark_rounded,
        label: 'Saved by ${msg.keptByName ?? 'recipient'}',
        color: QuantColors.sovereignCyan,
      );
    }
    if (msg.keepRequestPending && msg.isOutgoing) {
      return _buildSnapStateChip(
        icon: Icons.bookmark_add_outlined,
        label: 'Keep requested — long-press to allow or decline',
        color: QuantColors.statusWarning,
      );
    }
    if (msg.isRevoked) {
      return _buildSnapStateChip(
        icon: Icons.undo_rounded,
        label: 'Revoked',
        color: QuantColors.statusError,
      );
    }
    // View-once messages say "Opened" via the status row above — the
    // generic "Viewed" chip is for timer-based disappearing messages.
    if (msg.hasBeenViewed && !msg.isViewOnce) {
      return _buildSnapStateChip(
        icon: Icons.visibility_rounded,
        label: 'Viewed',
        color: QuantColors.textMuted,
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
            // Phase 1B: view-once snaps show their view window until opened;
            // other disappearing messages show the live countdown.
            'Expires in ${_formatExpiryLabel(msg)}',
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

  /// Small state chip for viewed / saved / revoked / keep-requested states.
  Widget _buildSnapStateChip({
    required IconData icon,
    required String label,
    required Color color,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.14),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.5), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: 9,
              fontWeight: FontWeight.w700,
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

  /// Expiry badge shown BEFORE a view-once snap is opened (and on other
  /// disappearing messages). Icon + text only — never the content.
  Widget _buildExpiryBadge(ChatMessage msg) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: QuantColors.moltenOrange.withOpacity(0.14),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: QuantColors.moltenOrange.withOpacity(0.5), width: 0.8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.timer_outlined, size: 11, color: QuantColors.moltenOrange),
          const SizedBox(width: 4),
          Text(
            msg.isViewOnce
                ? 'View-once · ${_formatExpiryLabel(msg)}'
                : 'Disappears in ${_formatExpiryLabel(msg)}',
            style: const TextStyle(
              color: QuantColors.moltenOrange,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  /// Unopened view-once snap as a full-width media status row (Mobbin
  /// Flow-4): leading square glyph + "Tap to view" label. The expiry badge
  /// stays VISIBLE (Phase 1B differentiator — our spec wins here); the
  /// content is NEVER shown. Tapping the row opens the snap full-screen
  /// and starts the view timer.
  Widget _buildUnopenedSnapPlaceholder(ChatMessage msg) {
    return GestureDetector(
      onTap: () => _openSnap(msg),
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
        child: Row(
          children: [
            const Icon(
              Icons.crop_square_rounded,
              color: QuantColors.moltenOrange,
              size: 20,
            ),
            const SizedBox(width: 10),
            const Text(
              'Tap to view',
              style: TextStyle(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w700,
              ),
            ),
            const Spacer(),
            _buildExpiryBadge(msg),
          ],
        ),
      ),
    );
  }

  /// Outgoing view-once snap status row (Mobbin Flow-4): leading arrow
  /// glyph + "Delivered" (sent, unopened) or "Opened" (viewed). The expiry
  /// badge stays visible until the snap is gone (Phase 1B spec wins).
  Widget _buildSentSnapStatusRow(ChatMessage msg) {
    final viewed = msg.hasBeenViewed;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.arrow_upward_rounded,
            size: 13,
            color: viewed ? QuantColors.sovereignCyan : QuantColors.textMuted,
          ),
          const SizedBox(width: 5),
          Text(
            viewed ? 'Opened' : 'Delivered',
            style: TextStyle(
              color: viewed ? QuantColors.sovereignCyan : QuantColors.textMuted,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(width: 8),
          _buildExpiryBadge(msg),
        ],
      ),
    );
  }

  /// Opened view-once snap with a live countdown ring. While this is on
  /// screen, the screenshot watcher attributes any screenshot to this
  /// message. The real bytes arrive over the short-lived signed view URL
  /// (Phase 1B backend); the countdown here is display-only.
  Widget _buildSnapViewer(ChatMessage msg) {
    final progress = _snapViewTotalSeconds > 0
        ? (_snapViewRemainingSeconds / _snapViewTotalSeconds).clamp(0.0, 1.0)
        : 0.0;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Stack(
            alignment: Alignment.center,
            children: [
              Container(
                height: 180,
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.45),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: QuantColors.moltenOrange.withOpacity(0.4),
                  ),
                ),
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      msg.text,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: QuantColors.textPrimary,
                        fontSize: 14,
                        height: 1.45,
                      ),
                    ),
                  ),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    color: Colors.black.withOpacity(0.65),
                    shape: BoxShape.circle,
                  ),
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      SizedBox(
                        width: 36,
                        height: 36,
                        child: CircularProgressIndicator(
                          value: progress,
                          strokeWidth: 3,
                          backgroundColor: Colors.white24,
                          valueColor: const AlwaysStoppedAnimation<Color>(
                            QuantColors.moltenOrange,
                          ),
                        ),
                      ),
                      Text(
                        '$_snapViewRemainingSeconds',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w800,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'View-once — a screenshot notifies the sender',
            style: TextStyle(
              color: QuantColors.textMuted,
              fontSize: 10,
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
    if (_isRecordingVoiceMemo) {
      return _buildVoiceRecordingDock();
    }

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
          // Mobbin Flow-4: the camera action is FIRST in the composer.
          // This build has no dedicated capture surface yet (camera tab is
          // Phase 1A); it opens the media sheet's camera path meanwhile.
          IconButton(
            icon: const Icon(Icons.photo_camera_rounded, color: QuantColors.textSecondary, size: 24),
            tooltip: 'Capture',
            onPressed: _openMediaSheet,
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
                onSubmitted: (_) => _onSendPressed(),
                decoration: InputDecoration(
                  hintText: _composerSnapMode == 'view-once'
                      ? 'Type a view-once snap...'
                      : (_isDisappearingMode
                          ? 'Type disappearing message (${_formatDuration(_disappearingTtlSeconds)})...'
                          : 'Type a message...'),
                  hintStyle: const TextStyle(color: QuantColors.textMuted, fontSize: 13),
                  border: InputBorder.none,
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                ),
              ),
            ),
          ),
          const SizedBox(width: 6),

          // Phase 1B — snap mode selector: keep-in-chat vs view-once.
          // The composer border and hint already reflect disappearing mode;
          // this selector chooses the outgoing snap kind.
          PopupMenuButton<String>(
            icon: Icon(
              _composerSnapMode == 'view-once'
                  ? Icons.visibility_rounded
                  : Icons.timer_outlined,
              color: _composerSnapMode == 'off'
                  ? QuantColors.textSecondary
                  : QuantColors.moltenOrange,
              size: 24,
            ),
            tooltip: 'Snap mode',
            color: QuantColors.darkSlateCard,
            onSelected: (mode) => setState(() => _composerSnapMode = mode),
            itemBuilder: (context) => const [
              PopupMenuItem(
                value: 'off',
                child: Text('Keep in chat', style: TextStyle(color: QuantColors.textPrimary, fontSize: 14)),
              ),
              PopupMenuItem(
                value: 'disappearing',
                child: Text('Disappearing (timer)', style: TextStyle(color: QuantColors.textPrimary, fontSize: 14)),
              ),
              PopupMenuItem(
                value: 'view-once',
                child: Text('View-once snap', style: TextStyle(color: QuantColors.textPrimary, fontSize: 14)),
              ),
            ],
          ),

          // Voice Note Record Button (triggers voice memo recording state)
          IconButton(
            icon: const Icon(Icons.mic_rounded, color: QuantColors.moltenOrange, size: 24),
            tooltip: 'Record Voice Memo',
            onPressed: _startVoiceMemoRecording,
          ),

          // Mobbin Flow-4: the attachment (+) action sits after mic,
          // before send.
          IconButton(
            icon: const Icon(Icons.add_circle_outline_rounded, color: QuantColors.textSecondary, size: 24),
            tooltip: 'Share Media & Data',
            onPressed: _openMediaSheet,
          ),

          // Send Button
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _onSendPressed,
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

  /// Live Voice Memo Recording Dock with REC indicator, timer, waveform, and discard/send
  Widget _buildVoiceRecordingDock() {
    final mins = (_recordingDurationSeconds ~/ 60).toString().padLeft(2, '0');
    final secs = (_recordingDurationSeconds % 60).toString().padLeft(2, '0');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: QuantColors.voidObsidian,
        border: Border(
          top: BorderSide(color: QuantColors.hairlineBorder, width: 1),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          // Discard / Trash Button
          IconButton(
            icon: const Icon(Icons.delete_outline_rounded, color: QuantColors.statusError, size: 24),
            tooltip: 'Discard Voice Memo',
            onPressed: _cancelVoiceMemoRecording,
          ),
          const SizedBox(width: 4),

          // Pulsing REC Badge & Live Duration
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: QuantColors.statusError.withOpacity(0.15),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: QuantColors.statusError.withOpacity(0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                    color: QuantColors.statusError,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                Text(
                  '$mins:$secs',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    fontFamily: 'monospace',
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),

          // Live Recording Waveform Scrubber / Visualizer
          Expanded(
            child: Container(
              height: 36,
              padding: const EdgeInsets.symmetric(horizontal: 8),
              decoration: BoxDecoration(
                color: QuantColors.darkSlateCard,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: QuantColors.hairlineBorder),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: List.generate(_liveRecordingWaveform.length, (idx) {
                  final barHeight = (6.0 + (_liveRecordingWaveform[idx] * 20.0)).clamp(4.0, 26.0);
                  return Expanded(
                    child: Container(
                      margin: const EdgeInsets.symmetric(horizontal: 1),
                      height: barHeight,
                      decoration: BoxDecoration(
                        color: QuantColors.moltenOrange,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Send Recorded Voice Memo
          InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: _sendRecordedVoiceMemo,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFFF8C42),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF8C42).withOpacity(0.4),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ],
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 18),
            ),
          ),
        ],
      ),
    );
  }
}

