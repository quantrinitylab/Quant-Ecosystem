import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  group('QuantColors & Token Architecture', () {
    test('Verifies strict hex values for Obsidian Luxury Tokens', () {
      expect(QuantColors.voidObsidian, const Color(0xFF090A0E));
      expect(QuantColors.darkSlateCard, const Color(0xFF12151E));
      expect(QuantColors.hairlineBorder, const Color(0xFF232938));
      expect(QuantColors.moltenAmber, const Color(0xFFFF8C42));
      expect(QuantColors.sunsetGold, const Color(0xFFF59E0B));
      expect(QuantColors.sovereignCyan, const Color(0xFF38BDF8));
      expect(QuantColors.emeraldMatrix, const Color(0xFF10B981));
      expect(QuantColors.obsidianPurple, const Color(0xFFA78BFA));
    });

    test('Resolves colors for pillars accurately', () {
      expect(QuantColors.forPillar('mail'), QuantColors.moltenAmber);
      expect(QuantColors.forPillar('calendar'), QuantColors.sunsetGold);
      expect(QuantColors.forPillar('drive'), QuantColors.sovereignCyan);
      expect(QuantColors.forPillar('contacts'), QuantColors.emeraldMatrix);
      expect(QuantColors.forPillar('git'), QuantColors.obsidianPurple);
    });
  });

  group('QuantPillar Enum & Context SubViews', () {
    test('All 5 pillars have exactly 5 subviews defined', () {
      expect(QuantPillar.values.length, 5);
      for (final pillar in QuantPillar.values) {
        expect(pillar.subViews.length, 5,
            reason: '${pillar.label} must have 5 contextual subviews');
      }
    });

    test('Mail pillar has Inbox, Priority, Teams, Sent, Archive', () {
      final mailViews = QuantPillar.mail.subViews.map((e) => e.label).toList();
      expect(mailViews, ['Inbox', 'Priority', 'Teams', 'Sent', 'Archive']);
    });

    test('Calendar pillar has Agenda, Month, Booking, QuantMeet, Reminders', () {
      final calViews = QuantPillar.calendar.subViews.map((e) => e.label).toList();
      expect(calViews, ['Agenda', 'Month', 'Booking', 'QuantMeet', 'Reminders']);
    });

    test('Drive pillar has My Files, Shared, Vault (E2EE), Starred, Cleaner', () {
      final driveViews = QuantPillar.drive.subViews.map((e) => e.label).toList();
      expect(driveViews, ['My Files', 'Shared', 'Vault (E2EE)', 'Starred', 'Cleaner']);
    });

    test('Contacts pillar has Contacts, VIPs, Companies, AI Dedup, Circles', () {
      final contactViews = QuantPillar.contacts.subViews.map((e) => e.label).toList();
      expect(contactViews, ['Contacts', 'VIPs', 'Companies', 'AI Dedup', 'Circles']);
    });

    test('QuantGit pillar has Repos, PRs, Issues, Actions, Copilot', () {
      final gitViews = QuantPillar.quantGit.subViews.map((e) => e.label).toList();
      expect(gitViews, ['Repos', 'PRs', 'Issues', 'Actions', 'Copilot']);
    });
  });

  group('QuantTheme Configuration', () {
    test('Theme provides dark brightness and void obsidian scaffold background', () {
      final theme = QuantTheme.obsidianDarkTheme;
      expect(theme.brightness, Brightness.dark);
      expect(theme.scaffoldBackgroundColor, QuantColors.voidObsidian);
      expect(theme.primaryColor, QuantColors.moltenAmber);
    });
  });

  group('Widget Tests', () {
    testWidgets('QuantPillarTopBar renders all 5 mode tiles and triggers callback',
        (tester) async {
      QuantPillar selected = QuantPillar.mail;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: QuantPillarTopBar(
              activePillar: selected,
              onPillarSelected: (p) => selected = p,
            ),
          ),
        ),
      );

      expect(find.text('Mail'), findsOneWidget);
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Drive'), findsOneWidget);
      expect(find.text('Contacts'), findsOneWidget);
      expect(find.text('QuantGit'), findsOneWidget);

      await tester.tap(find.text('Calendar'));
      await tester.pumpAndSettle();

      expect(selected, QuantPillar.calendar);
    });

    testWidgets('QuantAiCapsule renders title and status badge', (tester) async {
      bool tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: QuantAiCapsule(
                title: 'Quant AI Copilot',
                statusText: '<5ms E2EE',
                onTap: () => tapped = true,
                isPulsing: false,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Quant AI Copilot'), findsOneWidget);
      expect(find.text('<5ms E2EE'), findsOneWidget);

      await tester.tap(find.text('Quant AI Copilot'));
      await tester.pump();

      expect(tapped, isTrue);
    });

    testWidgets('QuantVoiceSearchBar renders with placeholder and mic button',
        (tester) async {
      bool micTapped = false;
      String submittedQuery = '';

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: Center(
              child: QuantVoiceSearchBar(
                activePillar: QuantPillar.mail,
                onMicTap: () => micTapped = true,
                onSubmitted: (q) => submittedQuery = q,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Search emails, threads, drafts... <5ms index'), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);

      await tester.tap(find.byIcon(Icons.mic_rounded));
      await tester.pump();

      expect(micTapped, isTrue);
    });

    testWidgets('ContextBottomNavBar renders subviews for active pillar',
        (tester) async {
      int activeIndex = 0;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            bottomNavigationBar: ContextBottomNavBar(
              activePillar: QuantPillar.drive,
              selectedIndex: activeIndex,
              onTabSelected: (idx) => activeIndex = idx,
              badges: const {'vault': 1},
            ),
          ),
        ),
      );

      expect(find.text('My Files'), findsOneWidget);
      expect(find.text('Shared'), findsOneWidget);
      expect(find.text('Vault (E2EE)'), findsOneWidget);
      expect(find.text('Starred'), findsOneWidget);
      expect(find.text('Cleaner'), findsOneWidget);
      expect(find.text('1'), findsOneWidget); // badge count

      await tester.tap(find.text('Vault (E2EE)'));
      await tester.pump();

      expect(activeIndex, 2);
    });

    testWidgets('SquircleButton renders label and triggers callback', (tester) async {
      bool pressed = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: SquircleButton(
                label: 'Compose',
                icon: Icons.edit_rounded,
                onPressed: () => pressed = true,
              ),
            ),
          ),
        ),
      );

      expect(find.text('Compose'), findsOneWidget);
      expect(find.byIcon(Icons.edit_rounded), findsOneWidget);

      await tester.tap(find.text('Compose'));
      await tester.pump();

      expect(pressed, isTrue);
    });
  });

  group('Quant Sovereign Invariant Gates', () {
    test('Invariant: ZERO raw Unicode emojis across quant_ui codebase', () {
      final emojiRegex = RegExp(
        r'[\u{1F000}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]',
        unicode: true,
      );

      final dir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/packages/quant_ui/lib').existsSync()
              ? Directory('flutter_apps/packages/quant_ui/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/packages/quant_ui/lib'));

      if (!dir.existsSync()) return;

      final dartFiles = dir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          final matches = emojiRegex.allMatches(line);
          for (final match in matches) {
            final char = match.group(0)!;
            if (char.runes.first == 0x2318) continue; // Allow Mac ⌘
            violations.add('${file.path}:${i + 1} -> "$char" in $line');
          }
        }
      }

      expect(violations, isEmpty, reason: 'Zero raw Unicode emojis allowed');
    });

    test('Invariant: ZERO Skia clipPath method invocations across quant_ui codebase', () {
      final clipPathCallRegex = RegExp(r'(\.clipPath\s*\(|canvas\.clipPath\s*\()');

      final dir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/packages/quant_ui/lib').existsSync()
              ? Directory('flutter_apps/packages/quant_ui/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/packages/quant_ui/lib'));

      if (!dir.existsSync()) return;

      final dartFiles = dir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
          if (clipPathCallRegex.hasMatch(line)) {
            violations.add('${file.path}:${i + 1} -> ${line.trim()}');
          }
        }
      }

      expect(violations, isEmpty, reason: 'Zero Skia clipPath calls allowed. Pure Impeller.');
    });
  });
}

