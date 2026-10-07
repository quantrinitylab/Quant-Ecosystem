// ============================================================================
// quant_core - sent-message tracker (M7: compose core, W2)
//
// App-lifetime record of send ops the server CONFIRMED. [OutboxDrainer]
// emits a [SendResult] on its `sentOps` stream per [OutboxAction.send]
// dispatch that returns success; [SentMessagesNotifier] listens and keeps
// the recent confirmations (10-minute rolling window) for the UI's
// undo-send snackbar UX (the backend holds the message in a 30s undo
// window — the UI needs the confirmation + server message id to offer it).
//
// Import-cycle note: this file imports `../outbox/outbox_providers.dart`,
// which imports `../compose/compose_api.dart` directly — NOT
// `compose_providers.dart` (whose [ComposeService] watches the drainer
// provider the other way). Verified cycle-free with `flutter analyze`.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../outbox/outbox_drainer.dart';
import '../outbox/outbox_providers.dart';

/// One server-confirmed send, kept for the undo-send window UX.
class SentMessageInfo {
  /// Creates a send confirmation record.
  const SentMessageInfo({
    required this.idempotencyKey,
    this.messageId,
    required this.sentAt,
  });

  /// The outbox op's idempotency key (`send:<idempotencyKey>`), matching the
  /// key the UI holds for its queued draft.
  final String idempotencyKey;

  /// Best-effort server message id (see [extractServerMessageId]); null
  /// when the response carried no recognizable id.
  final String? messageId;

  /// When the confirmation arrived (local clock).
  final DateTime sentAt;
}

/// Rolling retention for send confirmations: well beyond the 30s
/// server-held undo window, short enough to forget stale state.
const Duration sentMessageRetention = Duration(minutes: 10);

String? _stringId(Object? value) =>
    value is String && value.isNotEmpty ? value : null;

String? _nestedId(Object? value) =>
    value is Map ? _stringId(value['id']) : null;

/// Best-effort extraction of the server message id from a composeRaw
/// response payload.
///
/// The wire id shape is UNVERIFIED (the repaired spec's `composeSchema`
/// is a repair artifact, not a verified send-response contract), so this
/// tries the plausible shapes in order — `id`, `messageId`,
/// `message.id`, `data.id`, `emailId` — and returns null for anything
/// else (non-string, empty, wrong nesting). Never throws.
String? extractServerMessageId(Map<String, dynamic> data) =>
    _stringId(data['id']) ??
    _stringId(data['messageId']) ??
    _nestedId(data['message']) ??
    _nestedId(data['data']) ??
    _stringId(data['emailId']);

/// App-lifetime notifier of server-confirmed sends.
///
/// Subscribes to the drainer's `sentOps` stream on [build] (cancelled on
/// dispose) and appends a [SentMessageInfo] per event, pruning entries
/// older than [sentMessageRetention]. Plain [Notifier] (not autoDispose):
/// send confirmations must survive UI navigation while the 30s undo
/// window is actionable.
class SentMessagesNotifier extends Notifier<List<SentMessageInfo>> {
  @override
  List<SentMessageInfo> build() {
    final subscription =
        ref.watch(outboxDrainerProvider).sentOps.listen(_onSent);
    ref.onDispose(subscription.cancel);
    return const <SentMessageInfo>[];
  }

  void _onSent(SendResult event) {
    final now = DateTime.now();
    state = <SentMessageInfo>[
      ...state.where(
          (info) => now.difference(info.sentAt) < sentMessageRetention),
      SentMessageInfo(
        idempotencyKey: event.idempotencyKey,
        messageId: extractServerMessageId(event.data),
        sentAt: now,
      ),
    ];
  }
}

/// App-lifetime send confirmations; the UI listens for the undo-snackbar.
final sentMessagesProvider =
    NotifierProvider<SentMessagesNotifier, List<SentMessageInfo>>(
  () => SentMessagesNotifier(),
  name: 'sentMessagesProvider',
);
