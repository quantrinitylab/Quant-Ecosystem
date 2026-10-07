import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  group('Quant UI Design System Tests', () {
    test('Theme provides dark Obsidian baseline', () {
      final theme = QuantTheme.obsidianDarkTheme;
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, QuantColors.voidObsidian);
    });

    test('Pillars resolve correct signature accents', () {
      expect(QuantPillar.mail.accentColor, QuantColors.moltenAmber);
      expect(QuantPillar.calendar.accentColor, QuantColors.sunsetGold);
      expect(QuantPillar.drive.accentColor, QuantColors.sovereignCyan);
      expect(QuantPillar.contacts.accentColor, QuantColors.emeraldMatrix);
      expect(QuantPillar.quantGit.accentColor, QuantColors.obsidianPurple);
    });

    testWidgets('SquircleSwitcher renders all 5 sovereign pillars', (tester) async {
      QuantPillar selected = QuantPillar.mail;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: SquircleSwitcher(
              activePillar: selected,
              onPillarChanged: (p) => selected = p,
            ),
          ),
        ),
      );

      expect(find.text('Mail'), findsOneWidget);
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Drive'), findsOneWidget);
      expect(find.text('Contacts'), findsOneWidget);
      expect(find.text('QuantGit'), findsOneWidget);
    });

    testWidgets('DynamicIslandCapsule renders with status text', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(
            body: DynamicIslandCapsule(
              title: 'Quant AI',
              statusText: '<5ms E2EE',
            ),
          ),
        ),
      );

      expect(find.text('Quant AI'), findsOneWidget);
      expect(find.text('<5ms E2EE'), findsOneWidget);
    });

    testWidgets('ContextBottomNav renders subviews for active pillar', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            bottomNavigationBar: ContextBottomNav(
              activePillar: QuantPillar.mail,
              selectedIndex: 0,
              onTabSelected: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('Inbox'), findsOneWidget);
      expect(find.text('Priority'), findsOneWidget);
      expect(find.text('Teams'), findsOneWidget);
    });
  });
}
