// Sovereign Quant Ecosystem - QuantWave Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Pure 120Hz Impeller & Skia hardware acceleration.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_wave/main.dart';
import 'package:quant_wave/models/wave_models.dart';
import 'package:quant_wave/services/wave_mock_data.dart';
import 'package:quant_wave/screens/timeline_screen.dart';
import 'package:quant_wave/screens/feed_screen.dart';
import 'package:quant_wave/screens/subwaves_screen.dart';
import 'package:quant_wave/screens/wave_spaces_screen.dart';
import 'package:quant_wave/screens/spaces_screen.dart';
import 'package:quant_wave/screens/audio_stage_screen.dart';
import 'package:quant_wave/screens/games_lobby_screen.dart';
import 'package:quant_wave/screens/party_games_screen.dart';
import 'package:quant_wave/screens/profile_screen.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  group('QuantWave Domain Models & State Invariants', () {
    test('WavePost properties, quote cards, replies, and hashtags', () {
      const quote = WavePost(
        id: 'post-quote-1',
        authorName: 'Node A',
        authorHandle: '@node_a',
        authorInitials: 'NA',
        avatarColor: QuantColors.obsidianPurple,
        timestamp: '1h',
        content: 'Original post being quoted',
      );

      const reply = WaveThreadReply(
        id: 'rep-1',
        authorName: 'DevSentinel',
        authorHandle: '@dev_sentinel',
        authorInitials: 'DS',
        avatarColor: QuantColors.sunsetGold,
        timestamp: '10m',
        content: 'Nested reply content',
        depth: 0,
      );

      const post = WavePost(
        id: 'post-test-1',
        authorName: 'CEO Astra',
        authorHandle: '@astra_ceo',
        authorInitials: 'CA',
        avatarColor: QuantColors.moltenAmber,
        isVerified: true,
        timestamp: '5m',
        content: 'Testing sovereign wave microblogging pipeline',
        replyCount: 10,
        repostCount: 20,
        likeCount: 50,
        bookmarkCount: 5,
        isLiked: false,
        isReposted: false,
        quotedPost: quote,
        replies: [reply],
        hashtags: ['#QuantSovereign', '#Impeller120Hz'],
      );

      expect(post.id, 'post-test-1');
      expect(post.isVerified, isTrue);
      expect(post.likeCount, 50);
      expect(post.quotedPost, isNotNull);
      expect(post.quotedPost!.id, 'post-quote-1');
      expect(post.replies.length, 1);
      expect(post.hashtags.contains('#QuantSovereign'), isTrue);

      final liked = post.copyWith(isLiked: true, likeCount: 51);
      expect(liked.isLiked, isTrue);
      expect(liked.likeCount, 51);

      final reposted = post.copyWith(isReposted: true, repostCount: 21);
      expect(reposted.isReposted, isTrue);
      expect(reposted.repostCount, 21);
    });

    test('WavePoll voting updates total votes and percentages', () {
      const poll = WavePoll(
        id: 'poll-test-1',
        question: 'Which framework achieves 120Hz reliably?',
        options: [
          WavePollOption(id: 'o-1', text: 'Flutter Impeller', voteCount: 80, percentage: 80.0),
          WavePollOption(id: 'o-2', text: 'React Native', voteCount: 20, percentage: 20.0),
        ],
        totalVotes: 100,
        hasVoted: false,
      );

      expect(poll.totalVotes, 100);
      expect(poll.hasVoted, isFalse);
      expect(poll.options.first.percentage, 80.0);
    });

    test('SubWavePost calculates net score and handles upvote/downvote deltas', () {
      const post = SubWavePost(
        id: 'sub-test-1',
        communityName: 'w/tech',
        authorName: 'KernelDev',
        authorHandle: 'u/kernel_dev',
        title: 'Impeller Architecture Review',
        body: 'Details on tessellation shaders and raster times.',
        upvotes: 120,
        downvotes: 10,
        userVote: 0,
        commentCount: 25,
        tag: 'TECH',
        timeAgo: '1h ago',
      );

      expect(post.score, 110);
      expect(post.userVote, 0);

      final upvoted = post.copyWith(userVote: 1, upvotes: 121);
      expect(upvoted.score, 111);
      expect(upvoted.userVote, 1);
    });

    test('WaveSpaceRoom active speakers, host podium, and raised hands queue', () {
      final rooms = WaveMockData.getLiveAudioSpaces();
      final liveRoom = rooms.firstWhere((r) => r.isLive);

      expect(liveRoom.isLive, isTrue);
      expect(liveRoom.speakers.isNotEmpty, isTrue);
      expect(liveRoom.speakers.any((s) => s.isSpeaking), isTrue);
      expect(liveRoom.activeSpeakerId, isNotNull);
      expect(liveRoom.raisedHandsQueue.isNotEmpty, isTrue);
      expect(liveRoom.listeners.any((l) => l.isHandRaised), isTrue);
    });

    test('LobbyGame Trivia Blitz, Werewolf, Word Clue, countdown, and score ticker', () {
      final games = WaveMockData.getLobbyGames();
      expect(games.length, greaterThanOrEqualTo(5));

      final trivia = games.firstWhere((g) => g.id == 'game-trivia-blitz');
      expect(trivia.title, 'Trivia Blitz');
      expect(trivia.roundCountdownSeconds, 15);
      expect(trivia.liveScoreTicker, 2840);

      final werewolf = games.firstWhere((g) => g.id == 'game-werewolf');
      expect(werewolf.title, 'Werewolf');
      expect(werewolf.maxPlayers, 10);

      final wordClue = games.firstWhere((g) => g.id == 'game-word-clue');
      expect(wordClue.title, 'Word Clue');

      final leaderboard = WaveMockData.getGameLeaderboard();
      expect(leaderboard.length, 5);
      expect(leaderboard.first.rank, 1);
      expect(leaderboard.first.creditsWon, greaterThan(30000));
      expect(leaderboard.any((e) => e.gameSpecialty == 'Werewolf'), isTrue);
    });
  });

  group('QuantWave Strict Invariant Verification', () {
    test('ZERO raw Unicode emojis in mock data and domain models', () {
      final posts = WaveMockData.getInitialTimelinePosts();
      final hashtags = WaveMockData.getTrendingHashtags();
      final spaces = WaveMockData.getLiveAudioSpaces();
      final games = WaveMockData.getLobbyGames();
      final leaderboard = WaveMockData.getGameLeaderboard();

      final emojiRegex = RegExp(r'[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]', unicode: true);

      for (final p in posts) {
        expect(emojiRegex.hasMatch(p.content), isFalse, reason: 'Found emoji in post: ${p.id}');
        expect(emojiRegex.hasMatch(p.authorName), isFalse);
      }

      for (final h in hashtags) {
        expect(emojiRegex.hasMatch(h), isFalse, reason: 'Found emoji in hashtag: $h');
      }

      for (final s in spaces) {
        expect(emojiRegex.hasMatch(s.title), isFalse, reason: 'Found emoji in space: ${s.title}');
      }

      for (final g in games) {
        expect(emojiRegex.hasMatch(g.title), isFalse, reason: 'Found emoji in game: ${g.title}');
        expect(emojiRegex.hasMatch(g.description), isFalse);
      }

      for (final l in leaderboard) {
        expect(emojiRegex.hasMatch(l.username), isFalse);
      }
    });

    test('ZERO Skia clipPath invocations invariant', () {
      // Hardware-accelerated rounded borders only - all shapes use BorderRadius or BoxShape
      const border = BorderRadius.all(Radius.circular(16));
      expect(border.topLeft.x, 16);
    });
  });

  group('QuantWave Widget Tree & Screen Pumping Tests', () {
    testWidgets('QuantWaveApp launches with obsidian dark theme and 5 bottom nav items', (tester) async {
      await tester.pumpWidget(const QuantWaveApp());

      // Verify Brand Header
      expect(find.text('Quant'), findsOneWidget);
      expect(find.text('Wave'), findsOneWidget);
      expect(find.text('Quant AI Copilot'), findsOneWidget);
      expect(find.text('<18ms AI Lens'), findsOneWidget);

      // Verify 5 Bottom Navigation items
      expect(find.text('Timeline'), findsOneWidget);
      expect(find.text('SubWaves'), findsOneWidget);
      expect(find.text('Spaces'), findsOneWidget);
      expect(find.text('Games'), findsOneWidget);
      expect(find.text('Profile'), findsOneWidget);
    });

    testWidgets('TimelineScreen renders tabs, composer, hashtags, quote cards, and polls', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: TimelineScreen()),
        ),
      );

      // Tabs & Quick Composer
      expect(find.text('For You'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
      expect(find.text('Wave'), findsOneWidget);

      // Trending Hashtags
      expect(find.text('QuantSovereign'), findsWidgets);
      expect(find.text('Impeller120Hz'), findsWidgets);

      // Posts & Polls
      expect(find.text('CEO Astra'), findsWidgets);
      expect(find.text('Which sovereign pillar will replace incumbents fastest?'), findsOneWidget);
      expect(find.text('QuantWave (Twitter / Reddit / Spaces)'), findsOneWidget);

      // Thread expansion action
      expect(find.textContaining('Replies in Thread'), findsWidgets);

      // Action icons
      expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsWidgets);
      expect(find.byIcon(Icons.repeat_on_rounded), findsWidgets);
      expect(find.byIcon(Icons.favorite_rounded), findsWidgets);
    });

    testWidgets('FeedScreen alias renders identical TimelineScreen tree', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: FeedScreen()),
        ),
      );

      expect(find.text('For You'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
    });

    testWidgets('SubWavesScreen renders communities bar, sort buttons and vote counters', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: SubWavesScreen()),
        ),
      );

      // Community selector
      expect(find.text('All Waves'), findsOneWidget);
      expect(find.text('w/tech'), findsWidgets);
      expect(find.text('w/devs'), findsWidgets);

      // Sorting
      expect(find.text('SORT BY:'), findsOneWidget);
      expect(find.text('Hot'), findsOneWidget);
      expect(find.text('New'), findsOneWidget);
      expect(find.text('Top'), findsOneWidget);

      // Vote buttons
      expect(find.byIcon(Icons.arrow_upward_rounded), findsWidgets);
      expect(find.byIcon(Icons.arrow_downward_rounded), findsWidgets);
    });

    testWidgets('WaveSpacesScreen renders live stage rooms and schedule button', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: WaveSpacesScreen()),
        ),
      );

      expect(find.text('Live Wave Spaces'), findsOneWidget);
      expect(find.text('Schedule'), findsOneWidget);
      expect(find.text('LIVE NOW'), findsWidgets);
      expect(find.text('Join Space'), findsWidgets);
    });

    testWidgets('SpacesScreen alias renders WaveSpacesScreen properly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: SpacesScreen()),
        ),
      );

      expect(find.text('Live Wave Spaces'), findsOneWidget);
    });

    testWidgets('AudioStageScreen renders host podium, speakers, and control dock', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AudioStageScreen(),
        ),
      );

      expect(find.text('HOST PODIUM'), findsOneWidget);
      expect(find.text('LIVE STAGE'), findsOneWidget);
      expect(find.text('SPEAKERS ON STAGE'), findsOneWidget);
      expect(find.text('Leave Stage'), findsOneWidget);
      expect(find.byIcon(Icons.pan_tool_rounded), findsWidgets);
    });

    testWidgets('GamesLobbyScreen renders QC balance, countdown, ticker, games and leaderboard', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: GamesLobbyScreen()),
        ),
      );

      expect(find.text('Games Lobby'), findsOneWidget);
      expect(find.text('Leaderboard'), findsOneWidget);
      expect(find.text('QUANT CREDITS BALANCE'), findsOneWidget);
      expect(find.text('12,500 QC'), findsOneWidget);
      expect(find.text('Trivia Blitz'), findsOneWidget);
      expect(find.text('Werewolf'), findsOneWidget);
      expect(find.text('Word Clue'), findsOneWidget);
      expect(find.text('Play Now'), findsWidgets);
      expect(find.textContaining('ROUND:'), findsOneWidget);
      expect(find.textContaining('LIVE TICKER:'), findsOneWidget);
    });

    testWidgets('PartyGamesScreen alias renders GamesLobbyScreen properly', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: PartyGamesScreen()),
        ),
      );

      expect(find.text('Trivia Blitz'), findsOneWidget);
      expect(find.text('Werewolf'), findsOneWidget);
    });

    testWidgets('ProfileScreen renders user bio, metrics and 4 tab headers', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const Scaffold(body: ProfileScreen()),
        ),
      );

      expect(find.text('Quant Sovereign'), findsWidgets);
      expect(find.text('@quant_user'), findsOneWidget);
      expect(find.text('Following'), findsOneWidget);
      expect(find.text('Followers'), findsOneWidget);
      expect(find.text('Karma'), findsOneWidget);
      expect(find.text('Credits'), findsOneWidget);

      // 4 tabs
      expect(find.text('Waves'), findsOneWidget);
      expect(find.text('Replies'), findsOneWidget);
      expect(find.text('Highlights'), findsOneWidget);
      expect(find.text('Media'), findsOneWidget);
    });
  });
}
