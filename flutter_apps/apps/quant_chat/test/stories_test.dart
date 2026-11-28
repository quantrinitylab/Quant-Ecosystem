// QuantChat Stories unit & widget tests (Phase 2C).
//
// Models parse the real /stories contract; the widget smoke test pumps the
// Stories tab against a fake service (no network) and asserts the three
// sections render with honest data.
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_chat/models/story_models.dart';
import 'package:quant_chat/screens/stories/stories_tab_screen.dart';
import 'package:quant_chat/services/story_service.dart';

Map<String, dynamic> _segmentJson({String id = 'seg1'}) => {
      'id': id,
      'authorId': 'u1',
      'authorName': 'Asha',
      'authorAvatar': '',
      'type': 'photo',
      'mediaUrl': 'https://example.invalid/u1/media_x/a.jpg',
      'duration': 10,
      'viewCount': 3,
      'audience': 'public',
      'createdAt': '2026-10-29T10:00:00.000Z',
      'expiresAt': '2026-10-30T10:00:00.000Z',
      'isViewed': false,
      'likeCount': 5,
      'commentCount': 2,
      'isLiked': true,
      'placeName': 'Goa',
      'name': 'Trip',
    };

class _FakeStoryService extends StoryService {
  _FakeStoryService() : super(baseUrl: 'https://example.invalid');

  @override
  Future<List<StoryGroup>> getFeed() async {
    return [
      StoryGroup.fromJson({
        'userId': 'u1',
        'userName': 'Asha',
        'userAvatar': '',
        'stories': [_segmentJson(id: 'seg1')],
        'hasUnviewed': true,
        'isOwn': false,
        'isFriend': true,
        'isFollowing': false,
      }),
      StoryGroup.fromJson({
        'userId': 'u2',
        'userName': 'Ravi',
        'userAvatar': '',
        'stories': [_segmentJson(id: 'seg2')],
        'hasUnviewed': false,
        'isOwn': false,
        'isFriend': false,
        'isFollowing': true,
      }),
    ];
  }

  @override
  Future<List<StorySegment>> getDiscover() async {
    return [StorySegment.fromJson(_segmentJson(id: 'seg3'))];
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('StorySegment model', () {
    test('parses the backend contract incl. engagement + place + name', () {
      final seg = StorySegment.fromJson(_segmentJson());
      expect(seg.id, 'seg1');
      expect(seg.authorName, 'Asha');
      expect(seg.type, StoryMediaType.photo);
      expect(seg.likeCount, 5);
      expect(seg.commentCount, 2);
      expect(seg.isLiked, isTrue);
      expect(seg.isViewed, isFalse);
      expect(seg.placeName, 'Goa');
      expect(seg.name, 'Trip');
    });

    test('text segments parse body text', () {
      final seg = StorySegment.fromJson({
        ..._segmentJson(),
        'type': 'text',
        'text': 'hello world',
        'mediaUrl': null,
      });
      expect(seg.type, StoryMediaType.text);
      expect(seg.text, 'hello world');
    });

    test('copyWith flips view/like state', () {
      final seg = StorySegment.fromJson(_segmentJson());
      final updated = seg.copyWith(isViewed: true, isLiked: false, likeCount: 4);
      expect(updated.isViewed, isTrue);
      expect(updated.isLiked, isFalse);
      expect(updated.likeCount, 4);
      expect(seg.isViewed, isFalse); // original untouched
    });
  });

  group('StoryGroup model', () {
    test('startIndex points at the first unviewed segment', () {
      final group = StoryGroup.fromJson({
        'userId': 'u1',
        'userName': 'Asha',
        'userAvatar': '',
        'stories': [
          {..._segmentJson(id: 'a'), 'isViewed': true},
          {..._segmentJson(id: 'b'), 'isViewed': false},
        ],
        'hasUnviewed': true,
        'isOwn': false,
        'isFriend': true,
        'isFollowing': false,
      });
      expect(group.startIndex, 1);
    });

    test('startIndex is 0 when everything is viewed', () {
      final group = StoryGroup.fromJson({
        'userId': 'u1',
        'userName': 'Asha',
        'userAvatar': '',
        'stories': [{..._segmentJson(id: 'a'), 'isViewed': true}],
        'hasUnviewed': false,
        'isOwn': false,
        'isFriend': true,
        'isFollowing': false,
      });
      expect(group.startIndex, 0);
    });
  });

  group('StoryAudience', () {
    test('wire values match the backend contract', () {
      expect(StoryAudience.friendsOnly.wireValue, 'friendsOnly');
      expect(StoryAudience.public.wireValue, 'public');
      expect(StoryAudience.closeFriends.wireValue, 'closeFriends');
    });

    test('fromWire defaults unknown values to public (never crashes)', () {
      expect(StoryAudience.fromWire('friendsOnly'), StoryAudience.friendsOnly);
      expect(StoryAudience.fromWire('bogus'), StoryAudience.public);
      expect(StoryAudience.fromWire(null), StoryAudience.public);
    });

    test('every audience has a human label + subtitle (no icon-only tools)', () {
      for (final a in StoryAudience.values) {
        expect(a.label.isNotEmpty, isTrue);
        expect(a.subtitle.isNotEmpty, isTrue);
      }
    });
  });

  group('storyTimeAgo', () {
    test('formats relative times honestly', () {
      final now = DateTime.utc(2026, 10, 29, 12, 0, 0);
      expect(storyTimeAgo(now.subtract(const Duration(seconds: 30)), now: now),
          'just now');
      expect(storyTimeAgo(now.subtract(const Duration(minutes: 5)), now: now),
          '5m');
      expect(storyTimeAgo(now.subtract(const Duration(hours: 3)), now: now),
          '3h');
      expect(storyTimeAgo(now.subtract(const Duration(days: 2)), now: now),
          '2d');
    });
  });

  group('contentTypeForPath', () {
    test('maps extensions to story-safe content types', () {
      expect(contentTypeForPath('a.JPG'), 'image/jpeg');
      expect(contentTypeForPath('a.png'), 'image/png');
      expect(contentTypeForPath('a.mp4'), 'video/mp4');
      expect(contentTypeForPath('a.MOV'), 'video/mp4');
      expect(contentTypeForPath('a.unknown'), 'image/jpeg');
    });
  });

  group('StoriesTabScreen widget', () {
    testWidgets('renders header and all three sections from the fake feed',
        (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: StoriesTabScreen(service: _FakeStoryService()),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Stories'), findsOneWidget);
      expect(find.text('Friends'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
      expect(find.text('Discover'), findsOneWidget);
      // Friend ring + name, following card, discover card.
      expect(find.text('Asha'), findsWidgets);
      expect(find.text('Ravi'), findsOneWidget);
      expect(find.text('Create story'), findsOneWidget);
    });

    testWidgets('shows an honest error with retry when the feed fails',
        (tester) async {
      final failing = _FailingStoryService();
      await tester.pumpWidget(
        MaterialApp(
          home: StoriesTabScreen(service: failing),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Could not load stories'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });
  });
}

class _FailingStoryService extends StoryService {
  _FailingStoryService() : super(baseUrl: 'https://example.invalid');

  @override
  Future<List<StoryGroup>> getFeed() async {
    throw const StoryApiException('boom', statusCode: 500);
  }

  @override
  Future<List<StorySegment>> getDiscover() async => const [];
}
