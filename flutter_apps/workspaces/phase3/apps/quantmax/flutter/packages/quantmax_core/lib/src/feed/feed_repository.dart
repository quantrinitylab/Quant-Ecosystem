// ============================================================================
// quantmax_core - feed repository contract + sample implementation (W2)
// ============================================================================
//
// Koi real API client nahi hai yahan. `app-foundations/quantmax/` ki spec abhi
// bani hi nahi, isliye is file me koi HTTP call, koi endpoint path, koi
// invent kiya hua contract nahi hai. UI development ke liye sirf
// [LocalSampleFeedRepository] — jo explicitly "Sample" hai.

import 'feed_models.dart';

/// Feed data ka contract. Spec land hone par real implementation
/// (TODO(UNVERIFIED)) isi interface ko implement karegi — UI code unchanged
/// rahega.
abstract class MaxFeedRepository {
  /// TODO(UNVERIFIED): endpoint, pagination model (cursor vs page), sort order
  /// sab spec se aayega. [cursor] opaque hai; [limit] server ko hint hai.
  Future<List<MaxVideo>> fetchFeed({String? cursor, int limit = 20});
}

/// **SAMPLE DATA — UI development only.** Ye class kabhi production feed
/// source nahi banegi.
///
/// - 6 hard-coded [MaxVideo] items, sirf layout/player plumbing test karne
///   ke liye.
/// - `videoUrl` ke liye **jaali, unresolvable** `https://example.invalid/*`
///   URLs hain — taaki koi ise real samajh kar network hit na kare. Ye
///   player ko load karne par fail honge (expected); real URLs spec ke baad.
/// - [fetchFeed] me [cursor] ignore hota hai (pagination spec ke baad) aur
///   [limit] sirf local list ko truncate karta hai.
/// - Koi HTTP call nahi, koi caching nahi — spec ke baad real repo aayega.
class LocalSampleFeedRepository implements MaxFeedRepository {
  /// Creates the sample repository. Const — koi state nahi.
  const LocalSampleFeedRepository();

  static final List<MaxVideo> _samples = <MaxVideo>[
    MaxVideo(
      id: 'sample-1',
      authorHandle: '@sample.creator1',
      authorAvatarUrl: '',
      caption: 'Sample feed item 1 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample1.mp4'),
      isLiked: false,
      likeCount: 1204,
      commentCount: 88,
      shareCount: 12,
    ),
    MaxVideo(
      id: 'sample-2',
      authorHandle: '@sample.creator2',
      authorAvatarUrl: '',
      caption: 'Sample feed item 2 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample2.mp4'),
      isLiked: true,
      likeCount: 89311,
      commentCount: 1203,
      shareCount: 540,
    ),
    MaxVideo(
      id: 'sample-3',
      authorHandle: '@sample.creator3',
      authorAvatarUrl: '',
      caption: 'Sample feed item 3 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample3.mp4'),
      isLiked: false,
      likeCount: 342,
      commentCount: 15,
      shareCount: 3,
    ),
    MaxVideo(
      id: 'sample-4',
      authorHandle: '@sample.creator4',
      authorAvatarUrl: '',
      caption: 'Sample feed item 4 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample4.mp4'),
      isLiked: false,
      likeCount: 9876,
      commentCount: 210,
      shareCount: 98,
    ),
    MaxVideo(
      id: 'sample-5',
      authorHandle: '@sample.creator5',
      authorAvatarUrl: '',
      caption: 'Sample feed item 5 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample5.mp4'),
      isLiked: true,
      likeCount: 1502300,
      commentCount: 9841,
      shareCount: 12500,
    ),
    MaxVideo(
      id: 'sample-6',
      authorHandle: '@sample.creator6',
      authorAvatarUrl: '',
      caption: 'Sample feed item 6 — layout placeholder',
      videoUrl: Uri.parse('https://example.invalid/sample6.mp4'),
      isLiked: false,
      likeCount: 57,
      commentCount: 2,
      shareCount: 0,
    ),
  ];

  @override
  Future<List<MaxVideo>> fetchFeed({String? cursor, int limit = 20}) async {
    // TODO(UNVERIFIED): cursor-based pagination spec ke baad — abhi cursor
    // ignore, sirf limit apply hota hai.
    final int safeLimit = limit < 0 ? 0 : limit;
    return List<MaxVideo>.unmodifiable(_samples.take(safeLimit));
  }
}
