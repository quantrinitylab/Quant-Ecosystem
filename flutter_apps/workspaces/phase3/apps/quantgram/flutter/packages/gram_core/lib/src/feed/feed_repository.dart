// ============================================================================
// gram_core - feed data layer: repository contract + in-memory placeholder
// ============================================================================
//
// **spec landing par real API implementation se replace hoga —
// TODO(UNVERIFIED).** [InMemoryFeedRepository] exists only so feed UI can
// be built against a stable contract before the
// `app-foundations/quantgram` spec lands. It must never ship to production.
//
// Cursor contract (intentionally loose until the spec lands):
// - [FeedRepository.fetchFeed]'s `cursor` is an OPAQUE string defined by
//   the backend. Do not parse it, do not construct it from post ids in
//   production code.
// - TODO(UNVERIFIED): the placeholder convention used by
//   [InMemoryFeedRepository] (cursor == index token) is NOT the real
//   contract. The real spec will define the envelope (cursor + hasMore);
//   until then, treat every pagination detail here as provisional.

import 'gram_feed_models.dart';

/// Contract for loading the QuantGram feed surface.
///
/// Implementations return UI entities ([GramPost], [GramStory]) — never raw
/// JSON. The real HTTP implementation arrives with the API spec and will
/// live behind the same contract.
abstract class FeedRepository {
  /// Loads one page of the home feed.
  ///
  /// [cursor] is opaque and backend-defined; pass `null` for the first
  /// page. [limit] is the requested page size (a hint, not a guarantee).
  Future<List<GramPost>> fetchFeed({String? cursor, int limit = 20});

  /// Loads the story tray (all unexpired stories for followed accounts).
  Future<List<GramStory>> fetchStories();
}

/// In-memory placeholder feed data for UI development.
///
/// **spec landing par real API implementation se replace hoga —
///
/// TODO(UNVERIFIED).** Holds a fixed fixture of posts and stories so the
/// feed screens can be built, laid out, and performance-tuned (image
/// caching, scroll smoothness) before the API exists. Paged reads slice the
/// fixture using an index-token cursor; an empty list signals end-of-feed.
///
/// Production guard: [feedRepositoryProvider] defaults to this class, so
/// any screen showing real data before the spec lands is visibly fake by
/// construction (fixture authors are `@quantgram.*`).
class InMemoryFeedRepository implements FeedRepository {
  /// Creates the repository with the built-in fixture data.
  InMemoryFeedRepository();

  static final DateTime _now = DateTime.now().toUtc();

  static final List<GramUser> _users = <GramUser>[
    const GramUser(
      id: 'user-1',
      username: 'quantgram',
      displayName: 'QuantGram',
      avatarUrl: '',
      isVerified: true,
    ),
    const GramUser(
      id: 'user-2',
      username: 'aisha.shoots',
      displayName: 'Aisha Kapoor',
      avatarUrl: '',
      isVerified: false,
    ),
    const GramUser(
      id: 'user-3',
      username: 'streetsofdelhi',
      displayName: 'Streets of Delhi',
      avatarUrl: '',
      isVerified: true,
    ),
    const GramUser(
      id: 'user-4',
      username: 'minimal.maker',
      displayName: 'Arjun Mehta',
      avatarUrl: '',
      isVerified: false,
    ),
  ];

  // Placeholder media: picsum fixtures so layout/media perf can be tuned
  // without inventing backend image URLs.
  static String _img(int seed, int w, int h) =>
      'https://picsum.photos/seed/gram-$seed/$w/$h';

  List<GramPost> get _posts => <GramPost>[
        GramPost(
          id: 'post-1',
          author: _users[1],
          imageUrl: _img(11, 1080, 1350),
          imageWidth: 1080,
          imageHeight: 1350,
          caption: 'Golden hour over the old city. No filter needed.',
          likeCount: 1284,
          commentCount: 96,
          likedByMe: false,
          createdAt: _now.subtract(const Duration(hours: 2)),
          isSponsored: false,
        ),
        GramPost(
          id: 'post-2',
          author: _users[0],
          imageUrl: _img(12, 1080, 1080),
          imageWidth: 1080,
          imageHeight: 1080,
          caption: 'QuantGram is coming. Media-first, India-first.',
          likeCount: 8921,
          commentCount: 412,
          likedByMe: true,
          createdAt: _now.subtract(const Duration(hours: 5)),
          isSponsored: false,
        ),
        GramPost(
          id: 'post-3',
          author: _users[2],
          imageUrl: _img(13, 1080, 810),
          imageWidth: 1080,
          imageHeight: 810,
          caption: 'Chandni Chowk at 6am, before the city wakes up.',
          likeCount: 3420,
          commentCount: 188,
          likedByMe: false,
          createdAt: _now.subtract(const Duration(hours: 9)),
          isSponsored: false,
        ),
        GramPost(
          id: 'post-4',
          author: _users[3],
          imageUrl: _img(14, 1080, 1350),
          imageWidth: 1080,
          imageHeight: 1350,
          caption: 'Sponsored: the desk setup that finally feels calm.',
          likeCount: 510,
          commentCount: 23,
          likedByMe: false,
          createdAt: _now.subtract(const Duration(hours: 14)),
          isSponsored: true,
        ),
        GramPost(
          id: 'post-5',
          author: _users[1],
          imageUrl: _img(15, 1080, 1080),
          imageWidth: 1080,
          imageHeight: 1080,
          caption: 'Monsoon portraits, part 3.',
          likeCount: 2210,
          commentCount: 141,
          likedByMe: false,
          createdAt: _now.subtract(const Duration(days: 1, hours: 3)),
          isSponsored: false,
        ),
        GramPost(
          id: 'post-6',
          author: _users[2],
          imageUrl: _img(16, 1080, 1350),
          imageWidth: 1080,
          imageHeight: 1350,
          caption: 'Nizamuddin, after the rain.',
          likeCount: 4102,
          commentCount: 230,
          likedByMe: false,
          createdAt: _now.subtract(const Duration(days: 1, hours: 8)),
          isSponsored: false,
        ),
      ];

  List<GramStory> get _stories => <GramStory>[
        GramStory(
          id: 'story-1',
          author: _users[1],
          thumbnailUrl: _img(21, 300, 300),
          viewed: false,
          createdAt: _now.subtract(const Duration(hours: 1)),
        ),
        GramStory(
          id: 'story-2',
          author: _users[2],
          thumbnailUrl: _img(22, 300, 300),
          viewed: false,
          createdAt: _now.subtract(const Duration(hours: 3)),
        ),
        GramStory(
          id: 'story-3',
          author: _users[3],
          thumbnailUrl: _img(23, 300, 300),
          viewed: true,
          createdAt: _now.subtract(const Duration(hours: 10)),
        ),
        GramStory(
          id: 'story-4',
          author: _users[0],
          thumbnailUrl: _img(24, 300, 300),
          viewed: true,
          createdAt: _now.subtract(const Duration(hours: 20)),
        ),
      ];

  /// Decodes the placeholder index-token cursor (`null` == first page).
  ///
  /// TODO(UNVERIFIED): placeholder convention only. The real API defines
  /// the cursor format; production code must treat it as opaque.
  int _cursorToIndex(String? cursor) {
    if (cursor == null || cursor.isEmpty) return 0;
    return int.tryParse(cursor) ?? 0;
  }

  @override
  Future<List<GramPost>> fetchFeed({String? cursor, int limit = 20}) async {
    final posts = _posts;
    final start = _cursorToIndex(cursor).clamp(0, posts.length);
    final end = (start + limit).clamp(0, posts.length);
    return posts.sublist(start, end);
  }

  @override
  Future<List<GramStory>> fetchStories() async {
    return List<GramStory>.unmodifiable(_stories);
  }
}
