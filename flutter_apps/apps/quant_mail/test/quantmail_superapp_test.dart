import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

import 'package:quant_mail/main.dart';
import 'package:quant_mail/screens/superapp/quantmail_superapp_bar.dart';
import 'package:quant_mail/screens/superapp/superapp_home_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. QUANT MONOGRAM PAINTER & LOGO UNIT TESTS
  // ===========================================================================
  group('QuantMonogram Logo & Painter Tests', () {
    test('QuantMonogramPainter: Instantiation, default properties and shouldRepaint', () {
      const painter1 = QuantMonogramPainter();
      expect(painter1.primaryColor, QuantColors.moltenAmber);
      expect(painter1.secondaryColor, QuantColors.sovereignCyan);
      expect(painter1.strokeWidth, 3.0);

      const painter2 = QuantMonogramPainter(
        primaryColor: QuantColors.sunsetGold,
        secondaryColor: QuantColors.emeraldMatrix,
        strokeWidth: 4.0,
      );
      expect(painter2.primaryColor, QuantColors.sunsetGold);
      expect(painter2.secondaryColor, QuantColors.emeraldMatrix);
      expect(painter2.strokeWidth, 4.0);

      // shouldRepaint logic
      expect(painter1.shouldRepaint(painter2), isTrue);
      expect(painter1.shouldRepaint(const QuantMonogramPainter()), isFalse);
    });

    testWidgets('QuantMonogramLogo: Renders CustomPaint with exact dimensions', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: QuantMonogramLogo(
              size: 36.0,
              primaryColor: QuantColors.moltenAmber,
              secondaryColor: QuantColors.sovereignCyan,
            ),
          ),
        ),
      );

      final customPaintFinder = find.byType(CustomPaint);
      expect(customPaintFinder, findsWidgets);

      final logoFinder = find.byType(QuantMonogramLogo);
      expect(logoFinder, findsOneWidget);

      final renderBox = tester.renderObject<RenderBox>(logoFinder);
      expect(renderBox.size.width, 36.0);
      expect(renderBox.size.height, 36.0);
    });
  });

  // ===========================================================================
  // 2. QUANTMAIL SUPER-APP BAR WIDGET TESTS
  // ===========================================================================
  group('QuantMailSuperAppBar Multi-Tier Header Widget Tests', () {
    testWidgets('Validates Brand Identity, Tier 1 Workspace Selector & Global Search Bar', (tester) async {
      QuantPillar selectedPillar = QuantPillar.mail;
      bool workspaceTapped = false;
      bool voiceTapped = false;
      bool qrTapped = false;
      bool profileTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            appBar: QuantMailSuperAppBar(
              activePillar: selectedPillar,
              onPillarSelected: (p) => selectedPillar = p,
              activeWorkspace: 'Quant Trinity Lab',
              onWorkspaceTap: () => workspaceTapped = true,
              onVoiceSearchTap: () => voiceTapped = true,
              onQrScanTap: () => qrTapped = true,
              onProfileTap: () => profileTapped = true,
              pillarBadges: const {
                QuantPillar.mail: 4,
                QuantPillar.calendar: 2,
                QuantPillar.drive: 0,
                QuantPillar.contacts: 12,
                QuantPillar.quantGit: 3,
              },
            ),
          ),
        ),
      );

      // 1. Brand Identity
      expect(find.byType(QuantMonogramLogo), findsOneWidget);
      expect(find.text('SOVEREIGN'), findsOneWidget);

      // 2. Tier 1: Workspace selector pill
      expect(find.text('Quant Trinity Lab'), findsOneWidget);
      expect(find.byIcon(Icons.business_rounded), findsOneWidget);
      expect(find.byIcon(Icons.keyboard_arrow_down_rounded), findsOneWidget);

      await tester.tap(find.text('Quant Trinity Lab'));
      await tester.pumpAndSettle();
      expect(workspaceTapped, isTrue);

      // 3. Profile Avatar with verified beacon dot
      expect(find.text('AM'), findsOneWidget);
      await tester.tap(find.text('AM'));
      await tester.pumpAndSettle();
      expect(profileTapped, isTrue);

      // 4. Global Search Bar with Voice and QR
      expect(find.byIcon(Icons.search_rounded), findsOneWidget);
      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.qr_code_scanner_rounded), findsOneWidget);

      await tester.tap(find.byIcon(Icons.mic_rounded));
      await tester.pumpAndSettle();
      expect(voiceTapped, isTrue);

      await tester.tap(find.byIcon(Icons.qr_code_scanner_rounded));
      await tester.pumpAndSettle();
      expect(qrTapped, isTrue);

      // 5. Tier 2: 5-Pillar Rail
      expect(find.text('Mail'), findsOneWidget);
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Drive'), findsOneWidget);
      expect(find.text('Contacts'), findsOneWidget);
      expect(find.text('QuantGit'), findsOneWidget);

      // Badge verification
      expect(find.text('4'), findsOneWidget);
      expect(find.text('2'), findsOneWidget);
      expect(find.text('12'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);

      // Switch pillar to Calendar
      await tester.tap(find.text('Calendar'));
      await tester.pumpAndSettle();
      expect(selectedPillar, QuantPillar.calendar);
    });
  });

  // ===========================================================================
  // 3. SUPER-APP HOME SCREEN FULL SUITE INTEGRATION TESTS
  // ===========================================================================
  group('SuperAppHomeScreen Sovereign Suite Tests', () {
    testWidgets('Renders complete Executive Suite: Quick-Glance Tiles, Category Lenses, 56dp Dock', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Top Bar presence
      expect(find.byType(QuantMailSuperAppBar), findsOneWidget);

      // Tier 3: Executive Quick-Glance Tiles
      expect(find.text('EXECUTIVE SUITE AT A GLANCE'), findsOneWidget);
      expect(find.text('PRIORITY MAIL'), findsOneWidget);
      expect(find.text('3 Urgent'), findsOneWidget);
      expect(find.text('NEXT MEETING'), findsOneWidget);
      expect(find.text('FASTCDC STORAGE'), findsOneWidget);
      expect(find.text('3.4x Dedup'), findsOneWidget);
      expect(find.text('18.4 GB used'), findsOneWidget);

      // Quick Actions Rail
      expect(find.text('Compose'), findsOneWidget);
      expect(find.text('New Event'), findsOneWidget);
      expect(find.text('Upload File'), findsOneWidget);
      expect(find.text('Add Contact'), findsOneWidget);
      expect(find.text('New Repo'), findsOneWidget);

      // Mail Category Lenses
      expect(find.text('Primary'), findsWidgets);
      expect(find.text('Updates'), findsOneWidget);
      expect(find.text('Promotions'), findsOneWidget);
      expect(find.text('Forums'), findsOneWidget);
      expect(find.text('VIPs'), findsOneWidget);

      // Tier 4: Contextual 56dp Bottom Navigation Dock
      expect(find.text('Inbox'), findsOneWidget);
      expect(find.text('Priority'), findsWidgets);
      expect(find.text('Teams'), findsOneWidget);
      expect(find.text('Sent'), findsOneWidget);
      expect(find.text('Archive'), findsWidgets);

      // Primary Floating Action Button (Compose)
      expect(find.byType(FloatingActionButton), findsOneWidget);
      expect(find.byIcon(Icons.edit_note_rounded), findsWidgets);
    });

    testWidgets('Switches between 5 Pillars and verifies contextual dock subviews', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // 1. Switch to Calendar Pillar
      await tester.tap(find.text('Calendar'));
      await tester.pumpAndSettle();

      expect(find.text('TODAY · RFC 5545 AGENDA'), findsOneWidget);
      expect(find.text('Asia/Kolkata (IST)'), findsOneWidget);
      expect(find.text('Agenda'), findsOneWidget);
      expect(find.text('Month'), findsOneWidget);
      expect(find.text('Booking'), findsOneWidget);
      expect(find.text('QuantMeet'), findsOneWidget);
      expect(find.text('Reminders'), findsOneWidget);

      // 2. Switch to Drive Pillar
      await tester.tap(find.text('Drive'));
      await tester.pumpAndSettle();

      expect(find.text('RECENT ENCRYPTED OBJECTS'), findsOneWidget);
      expect(find.text('FastCDC Active'), findsOneWidget);
      expect(find.text('My Files'), findsOneWidget);
      expect(find.text('Shared'), findsOneWidget);
      expect(find.text('Vault (E2EE)'), findsOneWidget);

      // 3. Switch to Contacts Pillar
      await tester.tap(find.text('Contacts'));
      await tester.pumpAndSettle();

      expect(find.text('Contacts'), findsWidgets);
      expect(find.text('Companies'), findsOneWidget);
      expect(find.text('AI Dedup'), findsOneWidget);
      expect(find.text('Circles'), findsOneWidget);

      // 4. Switch to QuantGit Pillar
      await tester.tap(find.text('QuantGit'));
      await tester.pumpAndSettle();

      expect(find.text('Repos'), findsOneWidget);
      expect(find.text('PRs'), findsOneWidget);
      expect(find.text('Issues'), findsOneWidget);
      expect(find.text('Actions'), findsOneWidget);
      expect(find.text('Copilot'), findsOneWidget);
    });

    testWidgets('Opens Workspace Selector Modal and switches workspace', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap workspace selector pill
      await tester.tap(find.text('Quant Trinity Lab'));
      await tester.pumpAndSettle();

      expect(find.text('Switch Workspace'), findsOneWidget);
      expect(find.text('Sovereign Foundation'), findsOneWidget);
      expect(find.text('Personal Workspace'), findsOneWidget);

      // Select Sovereign Foundation
      await tester.tap(find.text('Sovereign Foundation'));
      await tester.pumpAndSettle();

      // Workspace name updated in top bar
      expect(find.text('Sovereign Foundation'), findsOneWidget);
    });

    testWidgets('Opens Voice Search VAD Modal and triggers query chip', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap Voice Mic Icon
      await tester.tap(find.byIcon(Icons.mic_rounded).first);
      await tester.pumpAndSettle();

      expect(find.text('Listening for Voice Query...'), findsOneWidget);
      expect(find.text('Priority emails from Alex Mercer'), findsOneWidget);

      // Tap query chip
      await tester.tap(find.text('Priority emails from Alex Mercer'));
      await tester.pumpAndSettle();

      // Voice modal dismissed and query inserted
      expect(find.text('Listening for Voice Query...'), findsNothing);
    });

    testWidgets('Opens QR Scanner Modal with viewfinder frame', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Tap QR Scanner Icon
      await tester.tap(find.byIcon(Icons.qr_code_scanner_rounded).first);
      await tester.pumpAndSettle();

      expect(find.text('Sovereign QR Authenticator'), findsOneWidget);
      expect(find.text('Align QR Code in frame'), findsOneWidget);

      // Dismiss modal
      await tester.tap(find.text('Close Scanner'));
      await tester.pumpAndSettle();

      expect(find.text('Sovereign QR Authenticator'), findsNothing);
    });
  });

  // ===========================================================================
  // 4. SOVEREIGN ARCHITECTURAL INVARIANT AUDIT TESTS
  // ===========================================================================
  group('QuantMail Sovereign Architectural Invariants Audit', () {
    test('Invariant: ZERO raw Unicode emojis across all .dart files in quant_mail', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_mail/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_mail/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_mail/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_mail lib directory must exist');

      final emojiPattern = RegExp(
        r'[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]',
        unicode: true,
      );

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final content = file.readAsStringSync();
        final matches = emojiPattern.allMatches(content);
        for (final m in matches) {
          violations.add(
            '${file.path} -> Found raw emoji "${m.group(0)}" at offset ${m.start}',
          );
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Rule: Zero raw Unicode emojis allowed in code or comments.',
      );
    });

    test('Invariant: ZERO Skia clipPath method invocations across all .dart files in quant_mail/lib', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_mail/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_mail/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_mail/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_mail lib directory must exist');

      final clipPathCallRegex = RegExp(r'(\.clipPath\s*\(|canvas\.clipPath\s*\()');

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          if (clipPathCallRegex.hasMatch(line)) {
            violations.add(
              '${file.path}:${i + 1} -> Found Skia clipPath invocation: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Impeller Rule: Zero Skia clipPath calls allowed.',
      );
    });
  });
}
