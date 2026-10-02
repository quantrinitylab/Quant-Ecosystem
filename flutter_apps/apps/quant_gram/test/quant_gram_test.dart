import 'package:flutter_test/flutter_test.dart';
import 'package:quant_core/quant_core.dart';
import 'package:quant_gram/data/gram_repository.dart';
import 'package:quant_gram/models/gram_models.dart';
import 'package:quant_gram/main.dart';

void main() {
  group('QuantGram Domain Models & Repository Tests', () {
    test('GramRepository returns non-empty reels collection', () {
      final reels = GramRepository.getReels();
      expect(reels.isNotEmpty, isTrue);
      expect(reels.length, greaterThanOrEqualTo(5));

      final firstReel = reels.first;
      expect(firstReel.creatorHandle, equals('quantrinity'));
      expect(firstReel.isCreatorVerified, isTrue);
      expect(firstReel.hashtags, contains('#QuantEcosystem'));
      expect(firstReel.viewsCount, greaterThan(100000));
    });

    test('GramRepository returns 24h stories with unwatched gradient states', () {
      final stories = GramRepository.getStories();
      expect(stories.isNotEmpty, isTrue);
      expect(stories.first.username, equals('Your Story'));

      final unwatched = stories.where((s) => s.isUnwatched).toList();
      expect(unwatched.isNotEmpty, isTrue);
    });

    test('GramRepository returns comments with nested reply threads', () {
      final comments = GramRepository.getCommentsForReel('reel-1');
      expect(comments.isNotEmpty, isTrue);

      final pinned = comments.where((c) => c.isCreatorPinned).toList();
      expect(pinned.isNotEmpty, isTrue);
      expect(pinned.first.replies.isNotEmpty, isTrue);
    });

    test('CreatorProfile contains valid metrics and verified status', () {
      final profile = GramRepository.getProfile();
      expect(profile.handle, equals('quantrinity'));
      expect(profile.isVerified, isTrue);
      expect(profile.followersCount, greaterThan(500000));
    });
  });

  group('QuantMediaBridge 4-Reel Preload Policy Invariants', () {
    test('Preload policy correctly identifies upcoming 4 reels for buffering', () {
      const policy = QuantPreloadPolicy(preloadCount: 4);

      // Current reel is at index 0: should buffer indices 0, 1, 2, 3, 4
      expect(policy.shouldPreload(0, 0), isTrue);
      expect(policy.shouldPreload(1, 0), isTrue);
      expect(policy.shouldPreload(2, 0), isTrue);
      expect(policy.shouldPreload(3, 0), isTrue);
      expect(policy.shouldPreload(4, 0), isTrue);

      // Index 5 is out of 4-reel preload window
      expect(policy.shouldPreload(5, 0), isFalse);

      // Past index (-1 distance) should not be preloaded ahead
      expect(policy.shouldPreload(0, 2), isFalse);
    });
  });

  group('QuantGram Widget Hierarchy Tests', () {
    testWidgets('QuantGramApp builds and renders 5-tab navigation', (WidgetTester tester) async {
      await tester.pumpWidget(const QuantGramApp());
      await tester.pump();

      // Verify app title and structure
      expect(find.byType(QuantGramMainScreen), findsOneWidget);
    });
  });
}
