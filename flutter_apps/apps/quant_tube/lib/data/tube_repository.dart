import '../models/tube_models.dart';

/// Result of evaluating segment skipping at current position.
class SegmentSkipResult {
  final bool shouldSkip;
  final VideoSegment? segment;
  final double targetSeconds;
  final double timeSavedSeconds;

  const SegmentSkipResult({
    required this.shouldSkip,
    this.segment,
    this.targetSeconds = 0.0,
    this.timeSavedSeconds = 0.0,
  });

  static const none = SegmentSkipResult(shouldSkip: false);
}

/// Sovereign Segment-Skipping Engine (SponsorBlock parity)
class SegmentSkipper {
  final Set<String> _skippedSegmentIds = {};
  bool autoSkipEnabled;

  SegmentSkipper({this.autoSkipEnabled = true});

  void reset() {
    _skippedSegmentIds.clear();
  }

  void markSkipped(String segmentId) {
    _skippedSegmentIds.add(segmentId);
  }

  bool isSkipped(String segmentId) {
    return _skippedSegmentIds.contains(segmentId);
  }

  /// Evaluates whether current playback position hits a skippable segment.
  SegmentSkipResult evaluatePosition(
    double currentSeconds,
    List<VideoSegment> segments,
  ) {
    if (!autoSkipEnabled) return SegmentSkipResult.none;

    for (final seg in segments) {
      if (!seg.autoSkip) continue;
      if (_skippedSegmentIds.contains(seg.id)) continue;

      if (seg.containsTime(currentSeconds)) {
        return SegmentSkipResult(
          shouldSkip: true,
          segment: seg,
          targetSeconds: seg.endSeconds,
          timeSavedSeconds: seg.durationSeconds,
        );
      }
    }

    return SegmentSkipResult.none;
  }
}

/// Sovereign Repository for QuanTube
class TubeRepository {
  static const List<String> categories = [
    'All',
    'Gaming',
    'Coding',
    'AI',
    'Music',
    'Tech',
  ];

  static List<VideoItem> getVideos({String category = 'All'}) {
    final all = _allVideos;
    if (category == 'All') return all;
    return all.where((v) => v.category.toLowerCase() == category.toLowerCase()).toList();
  }

  /// Public Unauthenticated Feed Fallback:
  /// Guarantees guest visitors without auth tokens never encounter 401 errors.
  static List<VideoItem> getPublicUnauthenticatedFeed({String category = 'All'}) {
    final publicItems = _allVideos.where((v) => v.isPublicFeed).toList();
    if (category == 'All') return publicItems;
    return publicItems.where((v) => v.category.toLowerCase() == category.toLowerCase()).toList();
  }

  static VideoItem? getVideoById(String id) {
    try {
      return _allVideos.firstWhere((v) => v.id == id);
    } catch (_) {
      return _allVideos.first;
    }
  }

  static List<VideoItem> getRecommendedVideos(String currentVideoId) {
    return _allVideos.where((v) => v.id != currentVideoId).toList();
  }

  static ChannelProfile getChannelProfile(String handle) {
    return ChannelProfile(
      id: 'ch-quantrinity',
      name: 'Quantrinity Sovereign Tech',
      handle: handle.isEmpty ? '@quantrinity' : handle,
      avatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200',
      bannerUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200',
      subscribersCount: 2450000,
      isVerified: true,
      description: 'Sovereign decentralization, 120Hz Impeller streaming, AI Swarms, and peer-to-peer protocols.',
      publicVideos: _allVideos,
      allowUnauthenticatedAccess: true,
    );
  }

  static List<VideoComment> getCommentsForVideo(String videoId) {
    return [
      const VideoComment(
        id: 'c1',
        authorName: 'Alex Thorne',
        authorHandle: '@alexthorne',
        authorAvatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
        isChannelOwner: false,
        timeAgo: '2 hours ago',
        content: 'The SponsorBlock segment skipping is seamless! Auto-skipped the 45s brand integration without dropping a frame.',
        likesCount: 1420,
        repliesCount: 38,
      ),
      const VideoComment(
        id: 'c2',
        authorName: 'Quantrinity Sovereign',
        authorHandle: '@quantrinity',
        authorAvatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100',
        isChannelOwner: true,
        timeAgo: '4 hours ago',
        content: 'Pinned: All source code, benchmarks, and ONNX models are linked in the description. Pure Impeller 120Hz!',
        likesCount: 3890,
        repliesCount: 112,
        isLiked: true,
      ),
      const VideoComment(
        id: 'c3',
        authorName: 'Elena Rostova',
        authorHandle: '@elena_dev',
        authorAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
        isChannelOwner: false,
        timeAgo: '1 day ago',
        content: 'Finally an ad-free client that respects creator revenue through Quant Credits micro-settlement. Incredible architecture.',
        likesCount: 840,
        repliesCount: 19,
      ),
    ];
  }

  static List<MusicTrack> getMusicTracks() {
    return [
      const MusicTrack(
        id: 'm1',
        title: 'Obsidian Horizon',
        artist: 'Sovereign Synth',
        album: 'Tripartite Odyssey',
        albumArtUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500',
        durationSeconds: 214,
        audioUrl: 'https://stream.quantrinity.in/music/obsidian_horizon.mp3',
        isLiked: true,
        lyrics: [
          LyricLine(timeSeconds: 0.0, text: 'Instrumental opening pulse...'),
          LyricLine(timeSeconds: 12.0, text: 'Echoes in the dark slate void'),
          LyricLine(timeSeconds: 25.0, text: 'Streaming light through the silicon core'),
          LyricLine(timeSeconds: 38.0, text: 'No latency holding back our flight'),
          LyricLine(timeSeconds: 52.0, text: 'Obsidian horizon, rise above the noise'),
          LyricLine(timeSeconds: 68.0, text: 'Zero trackers, sovereign frequency'),
          LyricLine(timeSeconds: 84.0, text: 'Synthesizing truth in real-time waves'),
          LyricLine(timeSeconds: 102.0, text: 'Impeller engine accelerating the beat'),
          LyricLine(timeSeconds: 120.0, text: 'Through the fiber lines we conquer all'),
          LyricLine(timeSeconds: 145.0, text: 'Obsidian horizon, shining pure and free'),
          LyricLine(timeSeconds: 172.0, text: 'Harmonic resonance in tripartite tone'),
          LyricLine(timeSeconds: 195.0, text: 'Fading softly into the infinite starlight...'),
        ],
      ),
      const MusicTrack(
        id: 'm2',
        title: 'Neural Drift',
        artist: 'Cybernetic Echo',
        album: 'Latency Zero',
        albumArtUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=500',
        durationSeconds: 188,
        audioUrl: 'https://stream.quantrinity.in/music/neural_drift.mp3',
        lyrics: [
          LyricLine(timeSeconds: 0.0, text: 'Analog synthesizer warm up...'),
          LyricLine(timeSeconds: 15.0, text: 'Synapses firing along the golden bus'),
          LyricLine(timeSeconds: 32.0, text: 'Floating weightless in the neural drift'),
          LyricLine(timeSeconds: 48.0, text: 'Every packet verified, every hash complete'),
          LyricLine(timeSeconds: 65.0, text: 'Sub-5 millisecond heartbeat'),
          LyricLine(timeSeconds: 82.0, text: 'We drift beyond the sovereign wall'),
          LyricLine(timeSeconds: 110.0, text: 'Coded dreams in crystalline arrays'),
          LyricLine(timeSeconds: 135.0, text: 'Echoes linger in the quantum cache'),
        ],
      ),
      const MusicTrack(
        id: 'm3',
        title: 'Amber Sunrise',
        artist: 'Aura Vector',
        album: 'Dawn of Sovereign AI',
        albumArtUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500',
        durationSeconds: 242,
        audioUrl: 'https://stream.quantrinity.in/music/amber_sunrise.mp3',
        lyrics: [
          LyricLine(timeSeconds: 0.0, text: 'Ambient morning chords...'),
          LyricLine(timeSeconds: 20.0, text: 'Amber sunrise breaking through the clouds'),
          LyricLine(timeSeconds: 42.0, text: 'Waking up the planetary nodes'),
          LyricLine(timeSeconds: 64.0, text: 'Freedom in every decentralized song'),
          LyricLine(timeSeconds: 90.0, text: 'Breathe in the dawn of sovereign light'),
        ],
      ),
    ];
  }

  static CreatorStudioMetrics getCreatorStudioMetrics() {
    return CreatorStudioMetrics(
      channelName: 'Quantrinity Sovereign Tech',
      handle: '@quantrinity',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200',
      isVerified: true,
      subscribersCount: 2450000,
      totalViews: 48200000,
      quantCreditsEarned: 18450.0,
      monthlyRevenueUsd: 18450.0,
      copyrightScanStatus: 'Clean • 0 Strikes • Sovereign CID Certified',
      recentUploads: _allVideos.take(3).toList(),
    );
  }

  static final List<VideoItem> _allVideos = [
    const VideoItem(
      id: 'v1',
      title: 'Building a Sovereign YouTube & Spotify Killer in Flutter with Impeller 120Hz',
      channelTitle: 'Quantrinity Sovereign',
      channelHandle: '@quantrinity',
      channelAvatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
      isChannelVerified: true,
      viewsCount: 1420000,
      uploadTimeAgo: '1 day ago',
      durationSeconds: 742,
      thumbnailUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
      streamUrl: 'https://stream.quantrinity.in/videos/flutter_sovereign_player.m3u8',
      category: 'Coding',
      likesCount: 124000,
      dislikesCount: 420,
      description: 'Complete breakdown of QuanTube architecture: Segment-Skipping (SponsorBlock parity), hardware decoders, PiP support, zero clipPath 120Hz Impeller rendering, and peer-to-peer streaming distribution.',
      commentsCount: 2840,
      isPublicFeed: true,
      segments: [
        VideoSegment(
          id: 'seg-1-intro',
          title: 'Intro & Architecture Overview',
          startSeconds: 0,
          endSeconds: 18,
          type: SegmentType.intro,
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-1-sponsor',
          title: 'Sponsor: NordVPN / Cloud Hosting',
          startSeconds: 85,
          endSeconds: 125,
          type: SegmentType.sponsor, // #F59E0B
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-1-selfpromo',
          title: 'Self-Promo: Join Sovereign Swarm Devs',
          startSeconds: 190,
          endSeconds: 215,
          type: SegmentType.selfPromo, // #3B82F6
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-1-highlight',
          title: 'Hardware Impeller Scrubber Engine',
          startSeconds: 240,
          endSeconds: 310,
          type: SegmentType.highlight,
          autoSkip: false,
        ),
        VideoSegment(
          id: 'seg-1-intermission',
          title: 'Intermission: Code Compilation Break',
          startSeconds: 420,
          endSeconds: 445,
          type: SegmentType.intermission, // #10B981
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-1-outro',
          title: 'Outro & Community GitHub Repo',
          startSeconds: 710,
          endSeconds: 742,
          type: SegmentType.outro,
          autoSkip: true,
        ),
      ],
    ),
    const VideoItem(
      id: 'v2',
      title: 'GPT-6 Astra & Opus 5 Swarm Architecture: 15-Subagent Concurrent Orchestration',
      channelTitle: 'Quant AI Labs',
      channelHandle: '@quantailabs',
      channelAvatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      isChannelVerified: true,
      viewsCount: 890000,
      uploadTimeAgo: '3 days ago',
      durationSeconds: 980,
      thumbnailUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800',
      streamUrl: 'https://stream.quantrinity.in/videos/swarm_orchestration.m3u8',
      category: 'AI',
      likesCount: 88000,
      dislikesCount: 190,
      description: 'Deep dive into Tripartite Swarm orchestration across Node A, Node B, Node C, and Notion AI Swarm. Zero-hallucination protocols, self-critique loops, and live dispatch ledgers.',
      commentsCount: 1540,
      isPublicFeed: true,
      segments: [
        VideoSegment(
          id: 'seg-2-sponsor',
          title: 'Sponsor: Cloud GPU Clusters',
          startSeconds: 120,
          endSeconds: 165,
          type: SegmentType.sponsor,
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-2-selfpromo',
          title: 'Self-Promo: Astra Model Hub',
          startSeconds: 320,
          endSeconds: 345,
          type: SegmentType.selfPromo,
          autoSkip: true,
        ),
      ],
    ),
    const VideoItem(
      id: 'v3',
      title: 'Unreal Engine 5.5 Next-Gen Graphics: Cyberpunk Megacity Benchmark at 4K 120FPS',
      channelTitle: 'GameTech Sovereign',
      channelHandle: '@gametech',
      channelAvatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      isChannelVerified: true,
      viewsCount: 2310000,
      uploadTimeAgo: '5 days ago',
      durationSeconds: 1240,
      thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
      streamUrl: 'https://stream.quantrinity.in/videos/ue5_cyberpunk.m3u8',
      category: 'Gaming',
      likesCount: 215000,
      dislikesCount: 850,
      description: 'Full ray-traced benchmark analysis running on RTX 5090. Nanite geometry density, Lumen global illumination, and direct hardware frame generation comparison.',
      commentsCount: 4120,
      isPublicFeed: true,
      segments: [
        VideoSegment(
          id: 'seg-3-sponsor',
          title: 'Sponsor: Energy Drink / Gaming Chair',
          startSeconds: 180,
          endSeconds: 220,
          type: SegmentType.sponsor,
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-3-intermission',
          title: 'Intermission: Raytracing Load Phase',
          startSeconds: 520,
          endSeconds: 545,
          type: SegmentType.intermission,
          autoSkip: true,
        ),
      ],
    ),
    const VideoItem(
      id: 'v4',
      title: 'Lossless Spatial Audio & Vinyl Simulation: Spotify Killer Deep Tech Architecture',
      channelTitle: 'SoundLab Acoustics',
      channelHandle: '@soundlab',
      channelAvatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      isChannelVerified: false,
      viewsCount: 450000,
      uploadTimeAgo: '1 week ago',
      durationSeconds: 615,
      thumbnailUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800',
      streamUrl: 'https://stream.quantrinity.in/videos/spatial_audio.m3u8',
      category: 'Music',
      likesCount: 52000,
      dislikesCount: 110,
      description: 'How QuanTube delivers 24-bit/192kHz FLAC streaming with synchronized millisecond lyrics, turntable analog warmth DSP, and background low-power hardware decoders.',
      commentsCount: 960,
      isPublicFeed: true,
      segments: [],
    ),
    const VideoItem(
      id: 'v5',
      title: 'FastCDC 64KB Chunking & Zero-Knowledge Deduplication Explained Visually',
      channelTitle: 'Quantrinity Sovereign',
      channelHandle: '@quantrinity',
      channelAvatarUrl: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150',
      isChannelVerified: true,
      viewsCount: 670000,
      uploadTimeAgo: '1 week ago',
      durationSeconds: 890,
      thumbnailUrl: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800',
      streamUrl: 'https://stream.quantrinity.in/videos/fastcdc_explained.m3u8',
      category: 'Tech',
      likesCount: 71000,
      dislikesCount: 90,
      description: 'Content-Defined Chunking using FastCDC algorithm: gear hash matrix, 64KB normalized target size, BLAKE3 content addressing, and client-side ChaCha20-Poly1305 encryption.',
      commentsCount: 1320,
      isPublicFeed: true,
      segments: [
        VideoSegment(
          id: 'seg-5-sponsor',
          title: 'Sponsor: Cloud Storage Hosting',
          startSeconds: 150,
          endSeconds: 190,
          type: SegmentType.sponsor,
          autoSkip: true,
        ),
      ],
    ),
  ];
}
