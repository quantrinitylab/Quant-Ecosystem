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
  // 2. QUANTMAIL SUPER-APP BAR (v2 SLIM HEADER) WIDGET TESTS
  // ===========================================================================
  group('QuantMailSuperAppBar v2 Slim Header Widget Tests', () {
    testWidgets('Renders brand, workspace selector and honest search — single nav lives outside the bar', (tester) async {
      bool workspaceTapped = false;
      bool voiceTapped = false;
      bool qrTapped = false;
      bool profileTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            appBar: QuantMailSuperAppBar(
              activePillar: QuantPillar.mail,
              activeWorkspace: 'Quant Trinity Lab',
              onWorkspaceTap: () => workspaceTapped = true,
              onVoiceSearchTap: () => voiceTapped = true,
              onQrScanTap: () => qrTapped = true,
              onProfileTap: () => profileTapped = true,
            ),
          ),
        ),
      );

      // 1. Brand identity — no invented pills
      expect(find.byType(QuantMonogramLogo), findsOneWidget);
      expect(find.text('SOVEREIGN'), findsNothing);

      // 2. Workspace selector pill
      expect(find.text('Quant Trinity Lab'), findsOneWidget);
      await tester.tap(find.text('Quant Trinity Lab'));
      await tester.pumpAndSettle();
      expect(workspaceTapped, isTrue);

      // 3. Search bar with honest placeholder (no perf claims)
      expect(find.byType(TextField), findsOneWidget);
      final searchField = tester.widget<TextField>(find.byType(TextField));
      final hint = searchField.decoration?.hintText ?? '';
      expect(hint, isNot(contains('<5ms')));
      expect(hint, isNot(contains('FastCDC')));

      // 4. Voice, QR and profile actions
      expect(find.byIcon(Icons.mic_rounded), findsOneWidget);
      expect(find.byIcon(Icons.qr_code_scanner_rounded), findsOneWidget);
      expect(find.text('AM'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.mic_rounded));
      await tester.pumpAndSettle();
      expect(voiceTapped, isTrue);

      await tester.tap(find.byIcon(Icons.qr_code_scanner_rounded));
      await tester.pumpAndSettle();
      expect(qrTapped, isTrue);

      await tester.tap(find.text('AM'));
      await tester.pumpAndSettle();
      expect(profileTapped, isTrue);

      // 5. No Tier-2 pillar rail inside the bar (nav lives in bottom dock)
      expect(find.text('Calendar'), findsNothing);
      expect(find.text('QuantGit'), findsNothing);
    });
  });

  // ===========================================================================
  // 3. SUPER-APP HOME SCREEN (v2) INTEGRATION TESTS
  // ===========================================================================
  group('SuperAppHomeScreen v2 Tests', () {
    testWidgets('Renders single bottom 5-pillar nav, lenses, honest empty state', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Top bar presence
      expect(find.byType(QuantMailSuperAppBar), findsOneWidget);

      // ONE nav system: 5-pillar bottom dock
      expect(find.text('Mail'), findsOneWidget);
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Drive'), findsOneWidget);
      expect(find.text('Contacts'), findsOneWidget);
      expect(find.text('QuantGit'), findsOneWidget);

      // No Tier-3 executive clutter / fake claims
      expect(find.text('EXECUTIVE SUITE AT A GLANCE'), findsNothing);
      expect(find.text('PRIORITY MAIL'), findsNothing);
      expect(find.text('FASTCDC STORAGE'), findsNothing);
      expect(find.text('18.4 GB used'), findsNothing);
      expect(find.text('Sub-5ms FTS5 Index'), findsNothing);

      // Mail category lenses present
      expect(find.text('Primary'), findsOneWidget);
      expect(find.text('Updates'), findsOneWidget);
      expect(find.text('Promotions'), findsOneWidget);
      expect(find.text('Forums'), findsOneWidget);
      expect(find.text('VIPs'), findsOneWidget);

      // Honest empty state — no fabricated threads
      expect(find.text('No mail in Primary yet'), findsOneWidget);
      expect(find.text('Alex Mercer'), findsNothing);
      expect(find.text('Sundar Pichai'), findsNothing);

      // Primary compose action
      expect(find.byType(FloatingActionButton), findsOneWidget);
    });

    testWidgets('Switches pillars; calendar and drive show honest empty states', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // 1. Switch to Calendar pillar
      await tester.tap(find.text('Calendar'));
      await tester.pumpAndSettle();

      expect(find.text('No meetings today'), findsOneWidget);
      expect(find.text('Sovereign Core Architecture Sync'), findsNothing);

      // 2. Switch to Drive pillar
      await tester.tap(find.text('Drive'));
      await tester.pumpAndSettle();

      expect(find.text('No files yet'), findsOneWidget);
      expect(find.text('18.4 GB used'), findsNothing);

      // 3. Back to Mail pillar
      await tester.tap(find.text('Mail'));
      await tester.pumpAndSettle();

      expect(find.text('No mail in Primary yet'), findsOneWidget);
    });

    testWidgets('Retapping the active tab resets filters (refresh)', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const SuperAppHomeScreen(),
        ),
      );
      await tester.pumpAndSettle();

      // Switch lens to Updates
      await tester.tap(find.text('Updates'));
      await tester.pumpAndSettle();
      expect(find.text('No mail in Updates yet'), findsOneWidget);

      // Retap the active Mail tab -> refresh resets the lens
      await tester.tap(find.text('Mail'));
      await tester.pumpAndSettle();
      expect(find.text('No mail in Primary yet'), findsOneWidget);
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
      expect(find.text('Unread mail'), findsOneWidget);

      // Tap query chip
      await tester.tap(find.text('Unread mail'));
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
