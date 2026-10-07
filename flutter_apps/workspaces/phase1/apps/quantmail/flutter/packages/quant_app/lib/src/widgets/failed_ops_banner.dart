// ============================================================================
// quant_app - failed outbox-ops banner (M6: modifier queue, W1 UI)
//
// Surfaces [ThreadMutationService]'s permanently-failed ops so the user can
// retry or discard them — the visible half of the modifier-queue contract
// (W2 owns the queue; this file only renders it). Superhuman-subtle,
// Gmail-honest: a slim `errorContainer` strip, never a blocking dialog.
//
// - [FailedOpsBannerHost]: wires the service in. First paint seeds from the
//   on-demand [ThreadMutationService.failedOpsSnapshot] (a fast local store
//   read); afterwards a [StreamBuilder] on
//   [ThreadMutationService.failedOps] (the drainer's broadcast stream, full
//   failed list after every drain) owns live updates.
// - [FailedOpsBanner]: pure presentational widget — an ops list plus
//   retry/discard callbacks. Zero ops renders [SizedBox.shrink].
//
// Verified contracts (do NOT guess):
// - `threadMutationServiceProvider`: `Provider<ThreadMutationService>`
//   (quant_core `src/mail/outbox/outbox_providers.dart`).
// - `OutboxOp`: `opId`, `action` ([OutboxAction]), `emailIds`,
//   `createdAt` (quant_core `src/mail/outbox/outbox_op.dart`).
// - `formatRelativeDate(DateTime?, QuantClock)` + `clockProvider`
//   (quant_core `src/time/quant_clock.dart`).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:quant_core/quant_core.dart';

/// Host: seeds the banner from the on-demand failed-ops snapshot, then
/// keeps it live from the drainer's broadcast stream.
///
/// The outbox stack is app-lifetime wiring — screens always override
/// [threadMutationServiceProvider] in tests; a missing/unwired provider
/// surfaces loudly here (no silent catch), because a broken modifier queue
/// must never hide behind an invisible banner.
class FailedOpsBannerHost extends ConsumerStatefulWidget {
  const FailedOpsBannerHost({super.key});

  @override
  ConsumerState<FailedOpsBannerHost> createState() =>
      _FailedOpsBannerHostState();
}

class _FailedOpsBannerHostState extends ConsumerState<FailedOpsBannerHost> {
  late final ThreadMutationService _service;

  /// The on-demand snapshot; null until it resolves (first paint).
  List<OutboxOp>? _seeded;

  @override
  void initState() {
    super.initState();
    _service = ref.read(threadMutationServiceProvider);
    unawaited(
      _service.failedOpsSnapshot().then(
        (List<OutboxOp> ops) {
          if (mounted) setState(() => _seeded = ops);
        },
        // A store read failure must not take the screen down: the banner
        // is auxiliary, and the drainer keeps retrying underneath. The
        // empty seed still lets the live stream surface failures later.
        onError: (Object _) {
          if (mounted) setState(() => _seeded = const <OutboxOp>[]);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final List<OutboxOp>? seeded = _seeded;
    // First paint waits for the snapshot (a fast local store read); the
    // StreamBuilder below is constructed exactly once the seed is known,
    // so `initialData` is never stale.
    if (seeded == null) return const SizedBox.shrink();
    return StreamBuilder<List<OutboxOp>>(
      stream: _service.failedOps(),
      initialData: seeded,
      builder: (
        BuildContext context,
        AsyncSnapshot<List<OutboxOp>> snapshot,
      ) {
        final List<OutboxOp> ops = snapshot.data ?? seeded;
        return FailedOpsBanner(
          ops: ops,
          onRetry: (String opId) {
            HapticFeedback.lightImpact();
            unawaited(_service.retryOp(opId));
          },
          onDiscard: (String opId) {
            HapticFeedback.lightImpact();
            unawaited(_service.discardOp(opId));
          },
        );
      },
    );
  }
}

/// Presentational failed-ops banner: slim strip with the failed-change
/// count and a "Details" button opening the per-op bottom sheet. Renders
/// nothing when [ops] is empty.
class FailedOpsBanner extends StatelessWidget {
  const FailedOpsBanner({
    super.key,
    required this.ops,
    required this.onRetry,
    required this.onDiscard,
  });

  /// The currently-failed ops, in drain order.
  final List<OutboxOp> ops;

  /// Called with the op's [OutboxOp.opId] when the user retries it.
  final void Function(String opId) onRetry;

  /// Called with the op's [OutboxOp.opId] when the user discards it.
  final void Function(String opId) onDiscard;

  @override
  Widget build(BuildContext context) {
    if (ops.isEmpty) return const SizedBox.shrink();
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final int count = ops.length;
    return Material(
      color: scheme.errorContainer,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Row(
          children: <Widget>[
            Icon(
              Icons.cloud_off_outlined,
              size: 20,
              color: scheme.onErrorContainer,
              semanticLabel: 'Sync failed',
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                count == 1
                    ? "1 change couldn't sync"
                    : "$count changes couldn't sync",
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: scheme.onErrorContainer,
                    ),
              ),
            ),
            TextButton(
              onPressed: () => _showReviewSheet(context),
              style: TextButton.styleFrom(
                foregroundColor: scheme.onErrorContainer,
                // VQA-P2-06: touch target >= 48dp (program standard).
                minimumSize: const Size(64, 48),
              ),
              child: const Text('Details'),
            ),
          ],
        ),
      ),
    );
  }

  void _showReviewSheet(BuildContext context) {
    final QuantClock clock =
        ProviderScope.containerOf(context).read(clockProvider);
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        showDragHandle: true,
        builder: (BuildContext sheetContext) => _FailedOpsSheet(
          ops: ops,
          clock: clock,
          onRetry: onRetry,
          onDiscard: onDiscard,
        ),
      ),
    );
  }
}

/// Bottom sheet listing every failed op with per-op retry/discard.
///
/// The rows are a static snapshot of the ops passed in: both actions are
/// idempotent at the store level (`requeue` is a no-op for non-failed ops,
/// `remove` for missing rows), so acting on several ops from one sheet
/// opening is safe — the banner underneath updates live from the stream.
class _FailedOpsSheet extends StatelessWidget {
  const _FailedOpsSheet({
    required this.ops,
    required this.clock,
    required this.onRetry,
    required this.onDiscard,
  });

  final List<OutboxOp> ops;
  final QuantClock clock;
  final void Function(String opId) onRetry;
  final void Function(String opId) onDiscard;

  @override
  Widget build(BuildContext context) {
    final TextTheme textTheme = Theme.of(context).textTheme;
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
            child: Text(
              "Changes that couldn't sync",
              style: textTheme.titleMedium,
            ),
          ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: ops.length,
              itemBuilder: (BuildContext context, int index) {
                final OutboxOp op = ops[index];
                return _FailedOpRow(
                  op: op,
                  clock: clock,
                  onRetry: onRetry,
                  onDiscard: onDiscard,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// One failed op: humanized action, message count, relative enqueue time,
/// retry + discard affordances.
class _FailedOpRow extends StatelessWidget {
  const _FailedOpRow({
    required this.op,
    required this.clock,
    required this.onRetry,
    required this.onDiscard,
  });

  final OutboxOp op;
  final QuantClock clock;
  final void Function(String opId) onRetry;
  final void Function(String opId) onDiscard;

  @override
  Widget build(BuildContext context) {
    final int count = op.emailIds.length;
    final String countLabel = count == 1 ? '1 message' : '$count messages';
    return ListTile(
      title: Text(_actionLabel(op.action)),
      subtitle: Text(
        '$countLabel · ${formatRelativeDate(op.createdAt, clock)}',
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          IconButton(
            icon: const Icon(Icons.refresh),
            // The tooltip doubles as the semantics label.
            tooltip: 'Retry syncing change',
            onPressed: () {
              HapticFeedback.lightImpact();
              onRetry(op.opId);
            },
          ),
          IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Discard change',
            onPressed: () {
              HapticFeedback.lightImpact();
              onDiscard(op.opId);
            },
          ),
        ],
      ),
    );
  }
}

/// Humanized labels for the wire-exact [OutboxAction] values.
String _actionLabel(OutboxAction action) {
  switch (action) {
    case OutboxAction.markRead:
      return 'Mark as read';
    case OutboxAction.markUnread:
      return 'Mark as unread';
    case OutboxAction.archive:
      return 'Archive';
    case OutboxAction.delete:
      return 'Delete';
    case OutboxAction.unarchive:
      return 'Unarchive';
    case OutboxAction.send:
      return 'Send';
    case OutboxAction.undoSend:
      return 'Undo send';
  }
}
