// ============================================================================
// quant_app - InboxScreen widget tests (Phase 1, M1)
// ============================================================================
//
// The inbox is an honest static placeholder (no interactions yet): these
// tests pin its rendered contract — title and placeholder copy — so later
// milestones can't silently drift the M1 scope.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_app/src/screens/inbox_screen.dart';

Future<void> _pumpInbox(WidgetTester tester) async {
  await tester.pumpWidget(const MaterialApp(home: InboxScreen()));
  await tester.pump();
}

void main() {
  group('InboxScreen', () {
    testWidgets('shows the Inbox title in the app bar', (tester) async {
      await _pumpInbox(tester);

      expect(find.widgetWithText(AppBar, 'Inbox'), findsOneWidget);
    });

    testWidgets('renders the M1 placeholder copy, centered',
        (tester) async {
      await _pumpInbox(tester);

      const String copy = 'Inbox \u2014 mail list lands here (M3)';
      expect(find.text(copy), findsOneWidget);
      expect(
        tester.widget<Text>(find.text(copy)).textAlign,
        TextAlign.center,
      );
      // Guards against copy drift into another screen's placeholder.
      expect(
        find.text('Thread view \u2014 lands here (M3)'),
        findsNothing,
      );
    });
  });
}
