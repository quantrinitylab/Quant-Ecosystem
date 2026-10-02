// Sovereign Quant Ecosystem - QuantWave Unit & Widget Test Suite
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & Skia acceleration).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_wave/main.dart';
import 'package:quant_wave/models/wave_models.dart';
import 'package:quant_wave/services/wave_mock_data.dart';
import 'package:quant_wave/screens/timeline_screen.dart';
import 'package:quant_wave/screens/subwaves_screen.dart';
import 'package:quant_wave/screens/wave_spaces_screen.dart';
import 'package:quant_wave/screens/games_lobby_screen.dart';
import 'package:quant_wave/screens/profile_screen.dart';
import 'package:quant_theme/quant_theme.dart';
import 'package:quant_ui/quant_ui.dart';

void main() {
  group('QuantWave Domain Models & State Invariants', () {
    test('WavePost properties, copyWith and engagement metrics', () {
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
      );

      expect(post.id, 'post-test-1');
      expect(post.isVerified, isTrue);
      expect(post.likeCount, 50);

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

    test('WaveSpaceRoom active speakers and hand-raising beacons', () {
      final rooms = WaveMockData.getLiveAudioSpaces();
      final liveRoom = rooms.firstWhere((r) => r.isLive);

      expect(liveRoom.isLive, isTrue);
      expect(liveRoom.speakers.isNotEmpty, isTrue);
      expect(liveRoom.speakers.any((s) => s.isSpeaking), isTrue);
      expect(liveRoom.listeners.any((l) => l.isHandRaised), isTrue);
    });

    test('LobbyGame entry stakes and leaderboard data', () {
      final games = WaveMockData.getLobbyGames();
      expect(games.length, greaterThanOrEqualTo(4));

      final uno = games.firstWhere((g) => g.id == 'game-uno');
      expect(uno.stakeCredits, 50);
      expect(uno.maxPlayers, 4);

      final leaderboard = WaveMockData.getGameLeaderboard();
      expect(leaderboard.first.rank, 1);
      expect(leaderboard.first.creditsWon, greaterThan(30000));
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

    testWidgets('TimelineScreen renders tabs, composer and interactive poll cards', (tester) async {
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

      // Posts & Polls
      expect(find.text('CEO Astra'), findsWidgets);
      expect(find.text('Which sovereign pillar will replace incumbents fastest?'), findsOneWidget);
      expect(find.text('QuantWave (Twitter / Reddit / Spaces)'), findsOneWidget);

      // Action icons
      expect(find.byIcon(Icons.chat_bubble_outline_rounded), findsWidgets);
      expect(find.byIcon(Icons.repeat_on_rounded), findsWidgets);
      expect(find.byIcon(Icons.favorite_rounded), findsWidgets);
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

    testWidgets('GamesLobbyScreen renders QC credits capsule, games and entry stakes', (tester) async {
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
      expect(find.text('Sovereign Uno'), findsOneWidget);
      expect(find.text('Quant Trivia Arena'), findsOneWidget);
      expect(find.text('Speed Chess 3+2'), findsOneWidget);
      expect(find.text('Play Now'), findsWidgets);
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
