// ============================================================================
// quant_app - ThreadScreen widget tests (Phase 1, M1)
// ============================================================================
//
// Verifies the thread screen renders the thread id it receives from the
// `/thread/:threadId` route, including the empty-id fallback branch.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/thread_screen.dart';

Future<void> _pumpThread(WidgetTester tester, String threadId) async {
  await tester.pumpWidget(
    MaterialApp(home: ThreadScreen(threadId: threadId)),
  );
  await tester.pump();
}

void main() {
  group('ThreadScreen', () {
    testWidgets('shows the Thread title in the app bar', (tester) async {
      await _pumpThread(tester, 'thread-42');

      expect(find.widgetWithText(AppBar, 'Thread'), findsOneWidget);
    });

    testWidgets('displays the thread id passed from the route',
        (tester) async {
      await _pumpThread(tester, 'thread-42');

      expect(find.text('Thread view \u2014 lands here (M3)'), findsOneWidget);
      expect(find.text('threadId: thread-42'), findsOneWidget);
    });

    testWidgets('shows a missing marker when the thread id is empty',
        (tester) async {
      await _pumpThread(tester, '');

      expect(find.text('threadId: (missing)'), findsOneWidget);
    });
  });
}
