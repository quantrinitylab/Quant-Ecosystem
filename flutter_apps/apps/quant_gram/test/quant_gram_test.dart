import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_gram/data/gram_repository.dart';
import 'package:quant_gram/models/gram_models.dart';
import 'package:quant_gram/screens/reels_player_screen.dart';
import 'package:quant_gram/screens/stories_tray.dart';
import 'package:quant_gram/screens/comments_sheet.dart';
import 'package:quant_gram/screens/dms/dms_inbox_screen.dart';
import 'package:quant_gram/screens/remix/sovereign_remix_studio.dart';
import 'package:quant_gram/screens/gifts/virtual_gifts_sheet.dart';
import 'package:quant_gram/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODELS & REPOSITORY TESTS
  // ===========================================================================
  group('QuantGram Domain Models & Repository Tests', () {
    test('GramRepository returns non-empty reels collection with remix & audio metadata', () {
      final reels = GramRepository.getReels();
      expect(reels.isNotEmpty, isTrue);
      expect(reels.length, greaterThanOrEqualTo(5));

      final firstReel = reels.first;
      expect(firstReel.creatorHandle, equals('quantrinity'));
      expect(firstReel.isCreatorVerified, isTrue);
      expect(firstReel.hashtags, contains('#QuantEcosystem'));
      expect(firstReel.viewsCount, greaterThan(100000));
      expect(firstReel.isRemixable, isTrue);
      expect(firstReel.remixCount, greaterThan(0));
      expect(firstReel.audioTrack.isNotEmpty, isTrue);
      expect(firstReel.audioArtist.isNotEmpty, isTrue);
    });

    test('ReelItem copyWith updates mutable state correctly', () {
      final reels = GramRepository.getReels();
      final reel = reels.first;

      final updated = reel.copyWith(
        isLiked: true,
        likesCount: reel.likesCount + 1,
        isBookmarked: true,
        bookmarksCount: reel.bookmarksCount + 1,
        remixCount: reel.remixCount + 1,
      );

      expect(updated.isLiked, isTrue);
      expect(updated.likesCount, equals(reel.likesCount + 1));
      expect(updated.isBookmarked, isTrue);
      expect(updated.bookmarksCount, equals(reel.bookmarksCount + 1));
      expect(updated.remixCount, equals(reel.remixCount + 1));
      expect(updated.creatorHandle, equals(reel.creatorHandle));
    });

    test('GramRepository returns 24h stories with slices, gradient and unwatched states', () {
      final stories = GramRepository.getStories();
      expect(stories.isNotEmpty, isTrue);
      expect(stories.first.username, equals('Your Story'));

      final unwatched = stories.where((s) => s.isUnwatched).toList();
      expect(unwatched.isNotEmpty, isTrue);

      final secondStory = stories[1];
      expect(secondStory.slicesCount, greaterThanOrEqualTo(1));
      expect(secondStory.expiresInHours, equals(24));
      expect(secondStory.backgroundGradient.length, greaterThanOrEqualTo(2));
    });

    test('StoryItem copyWith updates active slice and watched state', () {
      final stories = GramRepository.getStories();
      final story = stories[1];

      final updated = story.copyWith(
        isUnwatched: false,
        activeSliceIndex: 1,
      );

      expect(updated.isUnwatched, isFalse);
      expect(updated.activeSliceIndex, equals(1));
      expect(updated.username, equals(story.username));
    });

    test('GramRepository returns comments with nested reply threads, pinned & verified badges', () {
      final comments = GramRepository.getCommentsForReel('reel-1');
      expect(comments.isNotEmpty, isTrue);

      final pinned = comments.where((c) => c.isCreatorPinned).toList();
      expect(pinned.isNotEmpty, isTrue);
      expect(pinned.first.replies.isNotEmpty, isTrue);

      // Verify verified creator badge and creator heart on replies
      final verifiedReplies = pinned.first.replies.where((r) => r.isVerifiedCreator).toList();
      expect(verifiedReplies.isNotEmpty, isTrue);
      expect(verifiedReplies.first.username, equals('quantrinity'));
      expect(verifiedReplies.first.creatorHearted, isTrue);
    });

    test('CommentItem copyWith updates likes, pin and creatorHearted properties', () {
      final comments = GramRepository.getCommentsForReel('reel-1');
      final cmt = comments.first;

      final updated = cmt.copyWith(
        isLiked: true,
        likesCount: cmt.likesCount + 1,
        creatorHearted: true,
      );

      expect(updated.isLiked, isTrue);
      expect(updated.likesCount, equals(cmt.likesCount + 1));
      expect(updated.creatorHearted, isTrue);
      expect(updated.text, equals(cmt.text));
    });

    test('CreatorProfile contains valid metrics and verified status', () {
      final profile = GramRepository.getProfile();
      expect(profile.handle, equals('quantrinity'));
      expect(profile.isVerified, isTrue);
      expect(profile.followersCount, greaterThan(500000));
    });
  });

  // ===========================================================================
  // 2. QUANT MEDIA BRIDGE 4-REEL PRELOAD POLICY INVARIANTS
  // ===========================================================================
  group('QuantMediaBridge 4-Reel Preload Policy Invariants', () {
    test('Preload policy correctly identifies upcoming 4 reels for buffering at index 0', () {
      const policy = QuantPreloadPolicy(preloadCount: 4);

      // Current reel is at index 0: should buffer indices 0, 1, 2, 3, 4
      expect(policy.shouldPreload(0, 0), isTrue);
      expect(policy.shouldPreload(1, 0), isTrue);
      expect(policy.shouldPreload(2, 0), isTrue);
      expect(policy.shouldPreload(3, 0), isTrue);
      expect(policy.shouldPreload(4, 0), isTrue);

      // Index 5 is outside the 4-reel preload window
      expect(policy.shouldPreload(5, 0), isFalse);
    });

    test('Preload policy slides window when advancing to index 3', () {
      const policy = QuantPreloadPolicy(preloadCount: 4);

      // At index 3: should buffer 3, 4, 5, 6, 7
      expect(policy.shouldPreload(3, 3), isTrue);
      expect(policy.shouldPreload(4, 3), isTrue);
      expect(policy.shouldPreload(5, 3), isTrue);
      expect(policy.shouldPreload(6, 3), isTrue);
      expect(policy.shouldPreload(7, 3), isTrue);

      // Index 8 is outside window
      expect(policy.shouldPreload(8, 3), isFalse);

      // Past indices (0, 1, 2) are offscreen
      expect(policy.shouldPreload(0, 3), isFalse);
      expect(policy.shouldPreload(1, 3), isFalse);
      expect(policy.shouldPreload(2, 3), isFalse);
    });
  });

  // ===========================================================================
  // 3. HEART PARTICLE BURST CUSTOM PAINTER TESTS
  // ===========================================================================
  group('HeartParticleBurstPainter Tests', () {
    test('HeartParticleBurstPainter instantiates and calculates correctly', () {
      final painter = HeartParticleBurstPainter(
        progress: 0.5,
        focalPoint: const Offset(150, 300),
      );

      expect(painter.progress, equals(0.5));
      expect(painter.focalPoint, equals(const Offset(150, 300)));

      // Repaint check
      final samePainter = HeartParticleBurstPainter(
        progress: 0.5,
        focalPoint: const Offset(150, 300),
      );
      expect(painter.shouldRepaint(samePainter), isFalse);

      final diffPainter = HeartParticleBurstPainter(
        progress: 0.8,
        focalPoint: const Offset(150, 300),
      );
      expect(painter.shouldRepaint(diffPainter), isTrue);
    });
  });

  // ===========================================================================
  // 4. WIDGET HIERARCHY TESTS
  // ===========================================================================
  group('QuantGram Widget Hierarchy Tests', () {
    testWidgets('QuantGramApp builds and renders 5-tab navigation', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantGramApp());
      await tester.pump();

      expect(find.byType(QuantGramMainScreen), findsOneWidget);
      expect(find.byType(ReelsPlayerScreen), findsOneWidget);
    });

    testWidgets('StoriesTray renders horizontal story list with squircle items', (WidgetTester tester) async {
      final stories = GramRepository.getStories();

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: StoriesTray(stories: stories),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(StoriesTray), findsOneWidget);
      expect(find.text('Your Story'), findsOneWidget);
      expect(find.text('quantrinity'), findsOneWidget);
    });

    testWidgets('DmsInboxScreen renders search bar, notes strip, and filter tabs', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const DmsInboxScreen(),
        ),
      );
      await tester.pump();

      expect(find.byType(DmsInboxScreen), findsOneWidget);
      expect(find.text('quantrinity'), findsWidgets);
      expect(find.text('Search sovereign chats...'), findsOneWidget);
      expect(find.text('Primary'), findsOneWidget);
      expect(find.text('General'), findsOneWidget);
      expect(find.text('Requests'), findsOneWidget);
      expect(find.text('Unread'), findsOneWidget);

      // Verify online beacons and DM threads
      expect(find.text('Astra Executive AI'), findsOneWidget);
      expect(find.text('Nikhil Engineering'), findsOneWidget);
    });

    testWidgets('DmsInboxScreen filters threads when entering query in search bar', (WidgetTester tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const DmsInboxScreen(),
        ),
      );
      await tester.pump();

      // Enter search query
      await tester.enterText(find.byType(TextField).first, 'Astra');
      await tester.pump();

      expect(find.text('Astra Executive AI'), findsOneWidget);
      expect(find.text('Nikhil Engineering'), findsNothing);
    });

    testWidgets('SovereignRemixStudio renders 3 remix modes and controls', (WidgetTester tester) async {
      final reels = GramRepository.getReels();
      final reel = reels.first;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: SovereignRemixStudio(reel: reel),
        ),
      );
      await tester.pump();

      expect(find.byType(SovereignRemixStudio), findsOneWidget);
      expect(find.text('Duet'), findsOneWidget);
      expect(find.text('Green Screen'), findsOneWidget);
      expect(find.text('Reaction PiP'), findsOneWidget);

      // Default is Duet mode
      expect(find.text('Duet Mode'), findsOneWidget);
      expect(find.text('Your Duet Cam (120Hz)'), findsOneWidget);

      // Switch to Green Screen Mode
      await tester.tap(find.text('Green Screen'));
      await tester.pump();

      expect(find.text('Green Screen'), findsWidgets);
      expect(find.text('AI Chroma Cutout Active'), findsOneWidget);

      // Switch to Reaction PiP Mode
      await tester.tap(find.text('Reaction PiP'));
      await tester.pump();

      expect(find.text('Reaction PiP'), findsWidgets);
      expect(find.text('Tap to move'), findsOneWidget);
    });

    test('VirtualGiftsSheet giftsCatalog contains 8 distinct gifts with correct diamond payouts', () {
      expect(VirtualGiftsSheet.giftsCatalog.length, equals(8));

      final names = VirtualGiftsSheet.giftsCatalog.map((g) => g.name).toList();
      expect(names, containsAll([
        'Rose',
        'Neon Star',
        'Quantum Ring',
        'Crown',
        'Supercar',
        'Galaxy',
        'Falcon',
        'Sovereign Throne',
      ]));

      // Verify diamond payouts
      final rose = VirtualGiftsSheet.giftsCatalog.firstWhere((g) => g.name == 'Rose');
      expect(rose.coinCost, equals(1));
      expect(rose.diamondPayout, equals(1));

      final throne = VirtualGiftsSheet.giftsCatalog.firstWhere((g) => g.name == 'Sovereign Throne');
      expect(throne.coinCost, equals(9999));
      expect(throne.diamondPayout, equals(5000));
    });

    testWidgets('VirtualGiftsSheet renders gifts grid, coin balance, and multiplier selector', (WidgetTester tester) async {
      VirtualGiftItem? sentGift;
      int sentMultiplier = 0;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: VirtualGiftsSheet(
              creatorHandle: 'quantrinity',
              creatorAvatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
              onGiftSent: (gift, mult) {
                sentGift = gift;
                sentMultiplier = mult;
              },
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.byType(VirtualGiftsSheet), findsOneWidget);
      expect(find.text('Send to @quantrinity'), findsOneWidget);
      expect(find.text('2450'), findsOneWidget); // User coin balance

      // Verify all 8 gifts rendered
      expect(find.text('Rose'), findsOneWidget);
      expect(find.text('Neon Star'), findsOneWidget);
      expect(find.text('Quantum Ring'), findsOneWidget);
      expect(find.text('Crown'), findsOneWidget);
      expect(find.text('Supercar'), findsOneWidget);
      expect(find.text('Galaxy'), findsOneWidget);
      expect(find.text('Falcon'), findsOneWidget);
      expect(find.text('Sovereign Throne'), findsOneWidget);

      // Verify multiplier buttons
      expect(find.text('1x'), findsOneWidget);
      expect(find.text('5x'), findsOneWidget);
      expect(find.text('10x'), findsOneWidget);
      expect(find.text('99x'), findsOneWidget);

      // Tap Crown to select it
      await tester.tap(find.text('Crown'));
      await tester.pump();

      // Tap 5x multiplier
      await tester.tap(find.text('5x'));
      await tester.pump();

      expect(find.text('Creator receives: 500 Diamonds'), findsOneWidget);
      expect(find.text('Send Crown (995 Coins)'), findsOneWidget);

      // Tap Send Gift
      await tester.tap(find.text('Send Crown (995 Coins)'));
      await tester.pump();

      expect(sentGift?.name, equals('Crown'));
      expect(sentMultiplier, equals(5));
    });
  });

  // ===========================================================================
  // 5. SOVEREIGN ARCHITECTURE INVARIANT ASSERTION TESTS
  // ===========================================================================
  group('QuantGram Sovereign Architecture Invariant Assertion Tests', () {
    test('Invariant: ZERO raw Unicode emojis across all .dart source files in quant_gram/lib', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_gram/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_gram/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_gram/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_gram lib directory must exist');

      final emojiRegex = RegExp(
        r'[\u{1F000}-\u{1FAFF}]|[\u{2300}-\u{23FF}]|[\u{2600}-\u{27BF}]|[\u{2B50}-\u{2B55}]',
        unicode: true,
      );

      final dartFiles = libDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue, reason: 'Must scan at least 1 Dart file');

      final violations = <String>[];

      for (final file in dartFiles) {
        final lines = file.readAsLinesSync();
        for (int i = 0; i < lines.length; i++) {
          final line = lines[i];
          final matches = emojiRegex.allMatches(line);
          for (final match in matches) {
            final char = match.group(0)!;
            // Exclude legitimate Apple Command key symbol ⌘ (U+2318)
            if (char.runes.first == 0x2318) continue;

            violations.add(
              '${file.path}:${i + 1} -> Found raw Unicode emoji "$char" (0x${char.runes.first.toRadixString(16).toUpperCase()}) in: ${line.trim()}',
            );
          }
        }
      }

      expect(
        violations,
        isEmpty,
        reason: 'Violation of Sovereign Rule: Zero raw Unicode emojis allowed in code or comments.',
      );
    });

    test('Invariant: ZERO Skia clipPath method invocations across all .dart source files in quant_gram/lib', () {
      final libDir = Directory('lib').existsSync()
          ? Directory('lib')
          : (Directory('flutter_apps/apps/quant_gram/lib').existsSync()
              ? Directory('flutter_apps/apps/quant_gram/lib')
              : Directory('c:/Users/Pc/Quant-Ecosystem/flutter_apps/apps/quant_gram/lib'));

      expect(libDir.existsSync(), isTrue, reason: 'quant_gram lib directory must exist');

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
        reason: 'Violation of Sovereign Impeller Rule: Zero Skia clipPath calls allowed. Use BorderRadius/BoxDecoration.',
      );
    });
  });
}
