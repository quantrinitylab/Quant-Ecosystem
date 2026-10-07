import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../models/composer_models.dart';

/// Undo Send State Machine Status
enum UndoSendState {
  idle,
  queued,
  sending,
  sent,
  recalled,
}

/// 10-Second Recall Queue State Machine Manager
///
/// Sovereign client-side undo-send engine for QuantMail.
/// When send is triggered, the draft enters a 10,000ms countdown queue.
/// During this window, pressing 'Z' or tapping [Undo] immediately aborts delivery,
/// restores draft state, and alerts the user. Tapping [Send Now] flushes
/// the queue immediately without awaiting the countdown.
class UndoSendManager extends ChangeNotifier {
  static final UndoSendManager instance = UndoSendManager._internal();

  UndoSendManager._internal();

  static const int totalDurationMs = 10000; // 10-second recall window
  static const int tickIntervalMs = 50;     // 20fps smooth Impeller progress

  UndoSendState _state = UndoSendState.idle;
  EmailDraft? _activeDraft;
  int _remainingSeconds = 10;
  double _progress = 1.0;
  int _elapsedMs = 0;
  Timer? _ticker;

  Future<void> Function(EmailDraft draft)? _onFinalSend;
  void Function(EmailDraft draft)? _onRecall;
  void Function(String message)? _onStatusToast;

  UndoSendState get state => _state;
  EmailDraft? get activeDraft => _activeDraft;
  int get remainingSeconds => _remainingSeconds;
  double get progress => _progress;
  bool get isQueued => _state == UndoSendState.queued;
  bool get isSending => _state == UndoSendState.sending;
  bool get isVisible => _state == UndoSendState.queued || _state == UndoSendState.sending;

  /// Enqueue an email draft into the 10-second recall countdown queue
  void enqueueDraft({
    required EmailDraft draft,
    required Future<void> Function(EmailDraft draft) onFinalSend,
    required void Function(EmailDraft draft) onRecall,
    void Function(String message)? onStatusToast,
  }) {
    _ticker?.cancel();

    _activeDraft = draft;
    _onFinalSend = onFinalSend;
    _onRecall = onRecall;
    _onStatusToast = onStatusToast;

    _state = UndoSendState.queued;
    _remainingSeconds = 10;
    _progress = 1.0;
    _elapsedMs = 0;
    notifyListeners();

    _ticker = Timer.periodic(const Duration(milliseconds: tickIntervalMs), (timer) {
      _elapsedMs += tickIntervalMs;
      _progress = ((totalDurationMs - _elapsedMs) / totalDurationMs).clamp(0.0, 1.0);
      _remainingSeconds = ((totalDurationMs - _elapsedMs) / 1000).ceil().clamp(0, 10);

      notifyListeners();

      if (_elapsedMs >= totalDurationMs) {
        timer.cancel();
        _flushSend();
      }
    });
  }

  /// Immediately recalls the email delivery and reopens composer with draft state intact
  void undo() {
    if (_state != UndoSendState.queued) return;

    _ticker?.cancel();
    final draftToRestore = _activeDraft;
    _state = UndoSendState.recalled;
    notifyListeners();

    if (draftToRestore != null && _onRecall != null) {
      _onRecall!(draftToRestore);
    }

    _onStatusToast?.call('Email recalled successfully! Draft restored. (Hotkey: Z)');

    // Reset back to idle
    dismiss();
  }

  /// Immediately flushes the email to the backend without waiting for the 10s countdown
  void sendNow() {
    if (_state != UndoSendState.queued) return;
    _ticker?.cancel();
    _flushSend();
  }

  /// Internal final flush handler that hits backend API
  Future<void> _flushSend() async {
    final draft = _activeDraft;
    if (draft == null) {
      dismiss();
      return;
    }

    _state = UndoSendState.sending;
    _progress = 0.0;
    _remainingSeconds = 0;
    notifyListeners();

    try {
      if (_onFinalSend != null) {
        await _onFinalSend!(draft);
      }
      _state = UndoSendState.sent;
      notifyListeners();
      _onStatusToast?.call('Email sent successfully to Fastify sovereign cluster.');
    } catch (e) {
      debugPrint('[UndoSendManager] Error delivering email: $e');
      _onStatusToast?.call('Delivery error: Failed to reach sovereign mail gateway.');
    } finally {
      // Clear draft from autosave local storage after successful transmission
      DraftLocalStorage.instance.clearDraft();

      Timer(const Duration(milliseconds: 1500), () {
        dismiss();
      });
    }
  }

  /// Dismiss the undo send bar and reset state to idle
  void dismiss() {
    _ticker?.cancel();
    _state = UndoSendState.idle;
    _activeDraft = null;
    _progress = 1.0;
    _remainingSeconds = 10;
    _elapsedMs = 0;
    notifyListeners();
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }
}
