// ============================================================================
// quant_app - send confirmation + undo host (M7: compose UI, W1 - UI layer)
//
// [SendUndoHost] is the visible half of the send-confirmation contract:
// it listens to W2's `sentMessagesProvider` (app-lifetime record of
// SERVER-confirmed sends, fed by the outbox drainer's `sentOps` stream)
// and shows "Message sent" on the root ScaffoldMessenger.
//
// Copy honesty: the Undo action appears ONLY when the confirmation
// carries a server message id (`info.messageId != null`) — the undo path
// hits `POST /emails/{id}/undo-send`, which needs that id. A queued send
// with no id yet gets a plain "Message sent" (no false promise).
//
// Pattern-matched on [FailedOpsBannerHost]: ConsumerStatefulWidget with no
// visual footprint. Undo failures surface via the existing failed-ops
// banner (the drainer's `failedOps` stream) — no extra handling here.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_core/quant_core.dart';

/// Host: listens for server-confirmed sends and surfaces the snackbar UX.
///
/// Tracks already-shown idempotency keys in State so a rebuild never
/// double-shows a confirmation.
class SendUndoHost extends ConsumerStatefulWidget {
  const SendUndoHost({super.key});

  @override
  ConsumerState<SendUndoHost> createState() => _SendUndoHostState();
}

class _SendUndoHostState extends ConsumerState<SendUndoHost> {
  /// Idempotency keys already surfaced, with the time they were shown.
  ///
  /// The provider is append-only, so anything not in here is new since the
  /// last notification. Entries are pruned on every notification to the
  /// provider's own [sentMessageRetention] window — without pruning this
  /// map would grow one entry per send for the app's whole lifetime
  /// (zero-defect-qa P2, 2026-10-03).
  final Map<String, DateTime> _shownKeys = <String, DateTime>{};

  @override
  Widget build(BuildContext context) {
    ref.listen<List<SentMessageInfo>>(
      sentMessagesProvider,
      (List<SentMessageInfo>? previous, List<SentMessageInfo> next) {
        final DateTime now = DateTime.now();
        _shownKeys.removeWhere(
          (_, shownAt) => now.difference(shownAt) >= sentMessageRetention,
        );
        for (final SentMessageInfo info in next) {
          // containsKey check: exactly-once surfacing per idempotency key.
          if (!_shownKeys.containsKey(info.idempotencyKey)) {
            _shownKeys[info.idempotencyKey] = now;
            _showSent(info);
          }
        }
      },
    );
    return const SizedBox.shrink();
  }

  void _showSent(SentMessageInfo info) {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(
      SnackBar(
        content: const Text('Message sent'),
        action: info.messageId != null
            ? SnackBarAction(
                label: 'Undo',
                onPressed: () => _undo(info.messageId!),
              )
            : null,
      ),
    );
  }

  /// Queues the undo-send through the modifier queue. On success the user
  /// gets "Message unsent".
  ///
  /// Enqueue failures are LOCAL (e.g. the outbox store itself threw) — the
  /// op never exists, so nothing ever reaches the drainer's `failedOps`
  /// stream. The old comment claiming otherwise was wrong
  /// (zero-defect-qa P2, 2026-10-03): the user gets an explicit error
  /// snackbar instead of silence. Dispatch-time failures (server 400/500)
  /// still ride `failedOps` into [FailedOpsBannerHost].
  Future<void> _undo(String messageId) async {
    HapticFeedback.lightImpact();
    try {
      await ref.read(composeServiceProvider).undoSend(messageId);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not queue undo — try again'),
        ),
      );
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Message unsent')),
    );
  }
}
