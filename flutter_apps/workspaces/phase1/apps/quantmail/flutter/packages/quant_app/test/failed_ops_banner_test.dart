// ============================================================================
// quant_app - FailedOpsBanner widget tests (Phase 1, M6)
//
// Pins the presentational contract: count copy, empty → shrink, Review →
// bottom sheet with per-op rows, and retry/discard callbacks firing with
// the right op ids. The banner itself is provider-free; the sheet reads
// the clock via the ambient ProviderScope, so tests pin it with a
// [FakeQuantClock] for deterministic relative times.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/widgets/failed_ops_banner.dart';
import 'package:quant_core/quant_core.dart';

/// Fixed "now" for relative-time determinism.
final DateTime _now = DateTime.utc(2026, 10, 3, 12, 0);

OutboxOp _op(
  String opId,
  OutboxAction action, {
  int minutesAgo = 5,
  int messageCount = 2,
}) {
  return OutboxOp(
    opId: opId,
    idempotencyKey: 't-1:${action.name}',
    action: action,
    emailIds: List<String>.generate(messageCount, (i) => 'm-$i'),
    createdAt: _now.subtract(Duration(minutes: minutesAgo)),
  );
}

Future<void> _pumpBanner(
  WidgetTester tester, {
  required List<OutboxOp> ops,
  void Function(String opId)? onRetry,
  void Function(String opId)? onDiscard,
}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        clockProvider.overrideWithValue(FakeQuantClock(_now)),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: FailedOpsBanner(
            ops: ops,
            onRetry: onRetry ?? (_) {},
            onDiscard: onDiscard ?? (_) {},
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// Opens the Review bottom sheet for a single-op banner.
Future<void> _openSheet(WidgetTester tester) async {
  await tester.tap(find.text('Details'));
  await tester.pumpAndSettle();
}

void main() {
  group('FailedOpsBanner', () {
    testWidgets('renders the singular count for one failed op',
        (tester) async {
      await _pumpBanner(tester, ops: <OutboxOp>[_op('op-1', OutboxAction.archive)]);

      expect(find.text("1 change couldn't sync"), findsOneWidget);
      expect(find.text('Details'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_off_outlined), findsOneWidget);
    });

    testWidgets('renders the plural count for several failed ops',
        (tester) async {
      await _pumpBanner(
        tester,
        ops: <OutboxOp>[
          _op('op-1', OutboxAction.archive),
          _op('op-2', OutboxAction.markUnread),
        ],
      );

      expect(find.text("2 changes couldn't sync"), findsOneWidget);
    });

    testWidgets('renders nothing when there are no failed ops',
        (tester) async {
      await _pumpBanner(tester, ops: const <OutboxOp>[]);

      expect(find.text('Details'), findsNothing);
      expect(find.byIcon(Icons.cloud_off_outlined), findsNothing);
      // The banner collapses to a zero-size box.
      expect(
        find.byWidgetPredicate(
          (Widget w) => w is SizedBox && w.width == 0 && w.height == 0,
        ),
        findsOneWidget,
      );
    });

    testWidgets('Review opens a sheet with per-op rows', (tester) async {
      await _pumpBanner(
        tester,
        ops: <OutboxOp>[_op('op-1', OutboxAction.markRead)],
      );
      await _openSheet(tester);

      expect(find.text("Changes that couldn't sync"), findsOneWidget);
      expect(find.text('Mark as read'), findsOneWidget);
      expect(find.text('2 messages · 5m'), findsOneWidget);
      expect(find.byTooltip('Retry syncing change'), findsOneWidget);
      expect(find.byTooltip('Discard change'), findsOneWidget);
    });

    testWidgets('retry and discard fire with the op id', (tester) async {
      final List<String> retried = <String>[];
      final List<String> discarded = <String>[];
      await _pumpBanner(
        tester,
        ops: <OutboxOp>[_op('op-1', OutboxAction.delete)],
        onRetry: retried.add,
        onDiscard: discarded.add,
      );
      await _openSheet(tester);

      await tester.tap(find.byTooltip('Retry syncing change'));
      await tester.pump();
      expect(retried, <String>['op-1']);
      expect(discarded, isEmpty);

      await tester.tap(find.byTooltip('Discard change'));
      await tester.pump();
      expect(discarded, <String>['op-1']);
    });

    testWidgets('humanizes every action label', (tester) async {
      await _pumpBanner(
        tester,
        ops: <OutboxOp>[
          _op('op-1', OutboxAction.markRead),
          _op('op-2', OutboxAction.markUnread),
          _op('op-3', OutboxAction.archive),
          _op('op-4', OutboxAction.delete),
          _op('op-5', OutboxAction.unarchive),
        ],
      );
      await _openSheet(tester);

      expect(find.text('Mark as read'), findsOneWidget);
      expect(find.text('Mark as unread'), findsOneWidget);
      expect(find.text('Archive'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);
      // Five rows can exceed the sheet's height budget — the list scrolls,
      // so bring the last row into the built viewport like a user would.
      await tester.scrollUntilVisible(find.text('Unarchive'), 200);
      expect(find.text('Unarchive'), findsOneWidget);
    });

    testWidgets('uses the singular message label for one message',
        (tester) async {
      await _pumpBanner(
        tester,
        ops: <OutboxOp>[
          _op('op-1', OutboxAction.archive, messageCount: 1),
        ],
      );
      await _openSheet(tester);

      expect(find.text('1 message · 5m'), findsOneWidget);
    });
  });
}
