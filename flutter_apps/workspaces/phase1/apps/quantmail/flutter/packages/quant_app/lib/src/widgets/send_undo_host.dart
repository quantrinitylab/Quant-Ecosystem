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
  /// Idempotency keys already surfaced — the provider is append-only, so
  /// anything not in here is new since the last notification.
  final Set<String> _shownKeys = <String>{};

  @override
  Widget build(BuildContext context) {
    ref.listen<List<SentMessageInfo>>(
      sentMessagesProvider,
      (List<SentMessageInfo>? previous, List<SentMessageInfo> next) {
        for (final SentMessageInfo info in next) {
          // Set.add returns false for duplicates: exactly-once surfacing.
          if (_shownKeys.add(info.idempotencyKey)) {
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
  /// gets "Send cancelled"; failures ride the drainer's `failedOps`
  /// stream into the existing [FailedOpsBannerHost] — nothing extra here.
  Future<void> _undo(String messageId) async {
    HapticFeedback.lightImpact();
    try {
      await ref.read(composeServiceProvider).undoSend(messageId);
    } catch (_) {
      // An enqueue failure still lands in the drainer's failedOps; the
      // banner owns the retry/discard UX. Never leave the user hanging
      // silently — the banner speaks.
      return;
    }
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Send cancelled')),
    );
  }
}
