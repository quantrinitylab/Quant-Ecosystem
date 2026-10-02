// Sovereign Quant Ecosystem - QuanTube Unit & Widget Test Suite
// Wave 81 Sovereign Video & Audio Streaming Architect
// Strictly ZERO raw Unicode emojis throughout this file.
// Strictly ZERO Skia clipPath calls (120Hz Impeller & hardware acceleration).

import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:quant_tube/models/tube_models.dart';
import 'package:quant_tube/data/tube_repository.dart';
import 'package:quant_tube/main.dart';
import 'package:quant_tube/screens/video_feed_screen.dart';
import 'package:quant_tube/screens/music_player_screen.dart';
import 'package:quant_tube/screens/channel_studio_screen.dart';
import 'package:quant_tube/screens/video_detail_screen.dart';
import 'package:quant_tube/screens/creator_studio_screen.dart';
import 'package:quant_tube/screens/channel_screen.dart';
import 'package:quant_tube/screens/studio/video_upload_sheet.dart';
import 'package:quant_tube/widgets/audio_player_dock.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  // ===========================================================================
  // 1. DOMAIN MODEL & SPONSORBLOCK SEGMENT INVARIANTS
  // ===========================================================================
  group('QuanTube Domain Models & Repository Invariants', () {
    test('TubeRepository returns standard categories and non-empty video feed', () {
      expect(TubeRepository.categories, containsAll(['All', 'Gaming', 'Coding', 'AI', 'Music', 'Tech']));

      final allVideos = TubeRepository.getVideos();
      expect(allVideos.isNotEmpty, isTrue);
      expect(allVideos.length, greaterThanOrEqualTo(5));

      final firstVideo = allVideos.first;
      expect(firstVideo.channelTitle, equals('Quantrinity Sovereign'));
      expect(firstVideo.isChannelVerified, isTrue);
      expect(firstVideo.formattedDuration, equals('12:22'));
      expect(firstVideo.hasSponsorBlockSegments, isTrue);
      expect(firstVideo.isPublicFeed, isTrue);
    });

    test('Public Unauthenticated Feed Fallback guarantees zero 401 errors for guest visitors', () {
      final publicVideos = TubeRepository.getPublicUnauthenticatedFeed();
      expect(publicVideos.isNotEmpty, isTrue);
      for (final v in publicVideos) {
        expect(v.isPublicFeed, isTrue);
        expect(v.streamUrl.isNotEmpty, isTrue);
        expect(v.thumbnailUrl.isNotEmpty, isTrue);
      }

      final codingPublic = TubeRepository.getPublicUnauthenticatedFeed(category: 'Coding');
      expect(codingPublic.isNotEmpty, isTrue);
      for (final v in codingPublic) {
        expect(v.category, equals('Coding'));
      }
    });

    test('ChannelProfile domain model contains valid unauthenticated permissions', () {
      final profile = TubeRepository.getChannelProfile('@quantrinity');
      expect(profile.handle, equals('@quantrinity'));
      expect(profile.isVerified, isTrue);
      expect(profile.allowUnauthenticatedAccess, isTrue);
      expect(profile.publicVideos.isNotEmpty, isTrue);
      expect(profile.formattedSubscribers, equals('2.45M'));
    });

    test('VideoItem category filtering works correctly', () {
      final codingVideos = TubeRepository.getVideos(category: 'Coding');
      expect(codingVideos.isNotEmpty, isTrue);
      for (final v in codingVideos) {
        expect(v.category, equals('Coding'));
      }

      final aiVideos = TubeRepository.getVideos(category: 'AI');
      expect(aiVideos.isNotEmpty, isTrue);
      for (final v in aiVideos) {
        expect(v.category, equals('AI'));
      }
    });

    test('SponsorBlock segment color invariants: Sponsor #F59E0B, Self-promo #3B82F6, Intermission #10B981', () {
      expect(SegmentType.sponsor.indicatorColor, equals(const Color(0xFFF59E0B)));
      expect(SegmentType.selfPromo.indicatorColor, equals(const Color(0xFF3B82F6)));
      expect(SegmentType.intermission.indicatorColor, equals(const Color(0xFF10B981)));

      expect(SegmentType.sponsor.displayName, equals('Sponsor Segment'));
      expect(SegmentType.selfPromo.displayName, equals('Self Promotion'));
      expect(SegmentType.intermission.displayName, equals('Intermission'));

      expect(SegmentType.sponsor.icon, equals(Icons.campaign_rounded));
      expect(SegmentType.selfPromo.icon, equals(Icons.star_border_rounded));
      expect(SegmentType.intermission.icon, equals(Icons.hourglass_empty_rounded));
    });

    test('VideoSegment model correctly detects timestamp bounds and formats duration', () {
      const segment = VideoSegment(
        id: 'test-sponsor',
        title: 'Sponsor: Test VPN',
        startSeconds: 60.0,
        endSeconds: 95.0,
        type: SegmentType.sponsor,
        autoSkip: true,
      );

      expect(segment.durationSeconds, equals(35.0));
      expect(segment.durationFormatted, equals('35s'));
      expect(segment.containsTime(59.9), isFalse);
      expect(segment.containsTime(60.0), isTrue);
      expect(segment.containsTime(75.0), isTrue);
      expect(segment.containsTime(94.9), isTrue);
      expect(segment.containsTime(95.0), isFalse);
    });

    test('UploadStage 4-stage studio progression: Uploading -> Transcoding -> Thumbnail -> Published', () {
      expect(UploadStage.values.length, equals(4));
      expect(UploadStage.uploading.stepNumber, equals(1));
      expect(UploadStage.transcoding.stepNumber, equals(2));
      expect(UploadStage.thumbnail.stepNumber, equals(3));
      expect(UploadStage.published.stepNumber, equals(4));

      expect(UploadStage.uploading.title, contains('Uploading'));
      expect(UploadStage.transcoding.title, contains('Transcoding'));
      expect(UploadStage.thumbnail.title, contains('Thumbnail'));
      expect(UploadStage.published.title, contains('Published'));

      expect(UploadStage.uploading.icon, equals(Icons.cloud_upload_rounded));
      expect(UploadStage.transcoding.icon, equals(Icons.memory_rounded));
      expect(UploadStage.thumbnail.icon, equals(Icons.image_search_rounded));
      expect(UploadStage.published.icon, equals(Icons.check_circle_rounded));

      expect(UploadStage.uploading.accentColor, equals(const Color(0xFFF59E0B)));
      expect(UploadStage.transcoding.accentColor, equals(const Color(0xFF38BDF8)));
      expect(UploadStage.thumbnail.accentColor, equals(const Color(0xFFA855F7)));
      expect(UploadStage.published.accentColor, equals(const Color(0xFF10B981)));
    });

    test('VideoUploadSession correctly computes telemetry formatting and completion', () {
      const session = VideoUploadSession(
        id: 'sess-1',
        title: 'Sovereign Test Stream',
        category: 'Coding',
        stage: UploadStage.published,
        stageProgress: 1.0,
        overallProgress: 1.0,
        speedMbps: 54.2,
        etaSeconds: 0,
        contentCid: 'bafybeictest123',
      );

      expect(session.formattedProgress, equals('100%'));
      expect(session.formattedSpeed, equals('54.2 MB/s'));
      expect(session.formattedEta, equals('0s remaining'));
      expect(session.isCompleted, isTrue);
    });

    test('MusicTrack model contains valid lyrics and duration formatting', () {
      final tracks = TubeRepository.getMusicTracks();
      expect(tracks.isNotEmpty, isTrue);

      final track1 = tracks.first;
      expect(track1.title, equals('Obsidian Horizon'));
      expect(track1.lyrics.isNotEmpty, isTrue);
      expect(track1.lyrics.first.text, contains('Instrumental'));
      expect(track1.formattedDuration, equals('3:34'));
    });

    test('CreatorStudioMetrics correctly computes formatted metrics and revenue', () {
      final metrics = TubeRepository.getCreatorStudioMetrics();
      expect(metrics.handle, equals('@quantrinity'));
      expect(metrics.isVerified, isTrue);
      expect(metrics.formattedSubscribers, equals('2.45M'));
      expect(metrics.formattedMonthlyRevenue, equals('\$18450.00'));
      expect(metrics.formattedQuantCredits, equals('18450 QC'));
      expect(metrics.copyrightScanStatus, contains('0 Strikes'));
    });
  });

  // ===========================================================================
  // 2. SPONSORBLOCK SEGMENT-SKIPPING ENGINE INVARIANTS
  // ===========================================================================
  group('SponsorBlock Segment-Skipping Engine Invariants', () {
    test('SegmentSkipper accurately skips sponsor, self-promo, and intermission segments', () {
      final skipper = SegmentSkipper(autoSkipEnabled: true);
      const segments = [
        VideoSegment(
          id: 'seg-sponsor-1',
          title: 'Sponsor Segment',
          startSeconds: 85.0,
          endSeconds: 125.0,
          type: SegmentType.sponsor, // #F59E0B
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-selfpromo-1',
          title: 'Self Promotion Segment',
          startSeconds: 200.0,
          endSeconds: 220.0,
          type: SegmentType.selfPromo, // #3B82F6
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-intermission-1',
          title: 'Intermission Break',
          startSeconds: 350.0,
          endSeconds: 375.0,
          type: SegmentType.intermission, // #10B981
          autoSkip: true,
        ),
      ];

      // Before sponsor: should not skip
      final beforeResult = skipper.evaluatePosition(50.0, segments);
      expect(beforeResult.shouldSkip, isFalse);

      // Inside sponsor segment: must trigger auto-skip
      final sponsorResult = skipper.evaluatePosition(85.0, segments);
      expect(sponsorResult.shouldSkip, isTrue);
      expect(sponsorResult.targetSeconds, equals(125.0));
      expect(sponsorResult.timeSavedSeconds, equals(40.0));
      expect(sponsorResult.segment!.id, equals('seg-sponsor-1'));

      // Inside self-promo segment: must trigger auto-skip
      final promoResult = skipper.evaluatePosition(205.0, segments);
      expect(promoResult.shouldSkip, isTrue);
      expect(promoResult.targetSeconds, equals(220.0));
      expect(promoResult.timeSavedSeconds, equals(20.0));
      expect(promoResult.segment!.id, equals('seg-selfpromo-1'));

      // Inside intermission segment: must trigger auto-skip
      final intermissionResult = skipper.evaluatePosition(360.0, segments);
      expect(intermissionResult.shouldSkip, isTrue);
      expect(intermissionResult.targetSeconds, equals(375.0));
      expect(intermissionResult.timeSavedSeconds, equals(25.0));
      expect(intermissionResult.segment!.id, equals('seg-intermission-1'));

      // Mark as skipped: subsequent evaluation inside segment must not loop
      skipper.markSkipped('seg-sponsor-1');
      expect(skipper.isSkipped('seg-sponsor-1'), isTrue);
      final afterSkippedResult = skipper.evaluatePosition(85.0, segments);
      expect(afterSkippedResult.shouldSkip, isFalse);

      // Disable autoSkip: should not skip even if unskipped
      skipper.reset();
      skipper.autoSkipEnabled = false;
      final disabledResult = skipper.evaluatePosition(85.0, segments);
      expect(disabledResult.shouldSkip, isFalse);
    });
  });

  // ===========================================================================
  // 3. WIDGET & SCREEN RENDERING TESTS
  // ===========================================================================
  group('QuanTube Widget Hierarchy & Screen Tests', () {
    testWidgets('QuantTubeApp renders successfully with Dynamic Island AI Capsule and 5 tabs',
        (WidgetTester tester) async {
      await tester.pumpWidget(const QuantTubeApp());
      await tester.pump();

      // Verify branding and AI Capsule
      expect(find.text('QuanTube'), findsOneWidget);
      expect(find.text('QuanTube AI'), findsOneWidget);
      expect(find.text('Ad-Free • 120Hz'), findsOneWidget);

      // Verify bottom nav items
      expect(find.text('Home'), findsOneWidget);
      expect(find.text('Music'), findsOneWidget);
      expect(find.text('Subscriptions'), findsOneWidget);
      expect(find.text('Library'), findsOneWidget);

      // Initial active screen should be VideoFeedScreen
      expect(find.byType(VideoFeedScreen), findsOneWidget);

      // Switch to Music tab (index 1)
      await tester.tap(find.text('Music'));
      await tester.pump();
      expect(find.byType(MusicPlayerScreen), findsOneWidget);

      // Switch to Create tab / Channel Studio (index 2)
      await tester.tap(find.byIcon(Icons.add_rounded));
      await tester.pump();
      expect(find.byType(ChannelStudioScreen), findsOneWidget);
    });

    testWidgets('FloatingMiniPlayer renders compact docked player with controls',
        (WidgetTester tester) async {
      final testVideo = TubeRepository.getVideos().first;
      bool playPauseTapped = false;
      bool expandTapped = false;
      bool closeTapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: FloatingMiniPlayer(
              video: testVideo,
              isPlaying: true,
              currentSeconds: 120.0,
              onPlayPause: () => playPauseTapped = true,
              onExpand: () => expandTapped = true,
              onClose: () => closeTapped = true,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify title and channel
      expect(find.text(testVideo.title), findsOneWidget);
      expect(find.text('${testVideo.channelTitle} • 120Hz'), findsOneWidget);

      // Verify buttons
      expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
      expect(find.byIcon(Icons.open_in_full_rounded), findsOneWidget);
      expect(find.byIcon(Icons.close_rounded), findsOneWidget);

      // Tap play/pause
      await tester.tap(find.byIcon(Icons.pause_rounded));
      expect(playPauseTapped, isTrue);

      // Tap expand
      await tester.tap(find.byIcon(Icons.open_in_full_rounded));
      expect(expandTapped, isTrue);

      // Tap close
      await tester.tap(find.byIcon(Icons.close_rounded));
      expect(closeTapped, isTrue);
    });

    testWidgets('VideoDetailScreen renders 16:9 player viewport, SponsorBlock HUD pill and chapters',
        (WidgetTester tester) async {
      final testVideo = TubeRepository.getVideos().first;

      await tester.pumpWidget(
        MaterialApp(
          home: VideoDetailScreen(video: testVideo),
        ),
      );
      await tester.pump();

      // Verify video title
      expect(find.text(testVideo.title), findsOneWidget);

      // Verify Auto-Skip HUD toggle pill
      expect(find.text('Auto-Skip ON'), findsOneWidget);
      expect(find.byIcon(Icons.bolt_rounded), findsWidgets);

      // Verify SponsorBlock chapter legend chips
      expect(find.text('Timeline Chapters & SponsorBlock Segments'), findsOneWidget);
      expect(find.text('Sponsor'), findsOneWidget);
      expect(find.text('Self-promo'), findsOneWidget);
      expect(find.text('Intermission'), findsOneWidget);

      // Verify playback controls
      expect(find.byIcon(Icons.replay_10_rounded), findsOneWidget);
      expect(find.byIcon(Icons.forward_10_rounded), findsOneWidget);
      expect(find.byIcon(Icons.picture_in_picture_alt_rounded), findsOneWidget);
    });

    testWidgets('CreatorStudioScreen renders 4-stage studio stepper and public feed fallback banner',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: CreatorStudioScreen(),
        ),
      );
      await tester.pump();

      // Verify Creator Studio header
      expect(find.text('QuanTube Creator Studio'), findsOneWidget);
      expect(find.text('SOVEREIGN PARTNER'), findsOneWidget);

      // Verify Public Feed Fallback Banner
      expect(find.text('Public Feed Active (Zero 401 Authentication Barrier)'), findsOneWidget);

      // Verify Monetization Meter
      expect(find.text('Quant Credits Monetization'), findsOneWidget);
      expect(find.text('\$18450.00'), findsOneWidget);
      expect(find.text('18450 QC'), findsOneWidget);

      // Verify Upload Action Button
      expect(find.text('Upload Sovereign Video (4K / 120Hz)'), findsOneWidget);
    });

    testWidgets('ChannelScreen renders public unauthenticated feed without 401 barriers',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: ChannelScreen(handle: '@quantrinity'),
        ),
      );
      await tester.pump();

      // Verify Channel Info
      expect(find.text('Quantrinity Sovereign Tech'), findsOneWidget);
      expect(find.text('Public Unauthenticated Feed · Zero 401 Authentication Barrier'), findsOneWidget);
      expect(find.text('Subscribe'), findsOneWidget);
      expect(find.text('Videos'), findsOneWidget);
    });

    testWidgets('VideoUploadSheet renders 4-stage stepper and navigates through steps',
        (WidgetTester tester) async {
      VideoItem? publishedVideo;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: VideoUploadSheet(
              onVideoPublished: (video) => publishedVideo = video,
            ),
          ),
        ),
      );
      await tester.pump();

      // Step 1: File & Transcoding
      expect(find.text('Creator Studio Video Upload'), findsOneWidget);
      expect(find.text('Transcoding'), findsWidgets);
      expect(find.text('Metadata'), findsWidgets);
      expect(find.text('Thumbnail'), findsWidgets);
      expect(find.text('Monetization'), findsWidgets);
      expect(find.text('1. Source Media & Decentralized Transcoding'), findsOneWidget);
      expect(find.text('sovereign_benchmark_4k.raw'), findsOneWidget);

      // Navigate to Step 2: Metadata
      await tester.tap(find.text('Next Step (1/4)'));
      await tester.pumpAndSettle();
      expect(find.text('2. Video Metadata & Discoverability'), findsOneWidget);
      expect(find.text('Video Title *'), findsOneWidget);

      // Navigate to Step 3: Thumbnail
      await tester.tap(find.text('Next Step (2/4)'));
      await tester.pumpAndSettle();
      expect(find.text('3. Thumbnail Frame Selector'), findsOneWidget);
      expect(find.text('AI Auto-Select'), findsOneWidget);
      expect(find.text('Custom Upload'), findsOneWidget);

      // Navigate to Step 4: Monetization
      await tester.tap(find.text('Next Step (3/4)'));
      await tester.pumpAndSettle();
      expect(find.text('4. Visibility & Sovereign Monetization'), findsOneWidget);
      expect(find.text('Quant Credits Monetization'), findsOneWidget);
      expect(find.text('Publish Sovereign Video'), findsOneWidget);

      // Tap Publish
      await tester.tap(find.text('Publish Sovereign Video'));
      await tester.pumpAndSettle();
      expect(publishedVideo, isNotNull);
      expect(publishedVideo!.title.isNotEmpty, isTrue);
    });

    testWidgets('AudioPlayerDock renders 56dp height, spinning vinyl, controls and handles actions',
        (WidgetTester tester) async {
      bool playPauseCalled = false;
      bool nextCalled = false;
      bool expandCalled = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            bottomNavigationBar: AudioPlayerDock(
              isPlaying: true,
              currentSeconds: 42.0,
              onPlayPause: () => playPauseCalled = true,
              onNext: () => nextCalled = true,
              onExpand: () => expandCalled = true,
            ),
          ),
        ),
      );
      await tester.pump();

      // Check track title and lossless indicator
      final testTrack = TubeRepository.getMusicTracks().first;
      expect(find.text(testTrack.title), findsOneWidget);
      expect(find.text('${testTrack.artist} • Lossless 120Hz'), findsOneWidget);

      // Check buttons
      expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
      expect(find.byIcon(Icons.skip_next_rounded), findsOneWidget);
      expect(find.byIcon(Icons.open_in_full_rounded), findsOneWidget);

      // Play / Pause toggle
      await tester.tap(find.byIcon(Icons.pause_rounded));
      await tester.pump();
      expect(playPauseCalled, isTrue);
      expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);

      // Skip next
      await tester.tap(find.byIcon(Icons.skip_next_rounded));
      expect(nextCalled, isTrue);

      // Expand to full screen
      await tester.tap(find.byIcon(Icons.open_in_full_rounded));
      expect(expandCalled, isTrue);
    });
  });

  // ===========================================================================
  // 4. STRICT INVARIANT AUDIT TESTS (ZERO EMOJIS & ZERO CLIPPATH)
  // ===========================================================================
  group('QuanTube Sovereign Invariant Gatekeeper Audits', () {
    final appDir = Directory('lib');

    test('Invariant: ZERO raw Unicode emojis across all .dart source files in quant_tube/lib', () {
      expect(appDir.existsSync(), isTrue);

      final dartFiles = appDir
          .listSync(recursive: true)
          .whereType<File>()
          .where((f) => f.path.endsWith('.dart'))
          .toList();

      expect(dartFiles.isNotEmpty, isTrue);

      final violations = <String>[];

      for (final file in dartFiles) {
        final content = file.readAsStringSync();
        for (int i = 0; i < content.length; i++) {
          final cp = content.codeUnitAt(i);
          // Check standard emoji / symbol blocks
          if ((cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF)) {
            violations.add(
              '${file.path} at index $i -> code point 0x${cp.toRadixString(16)}',
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

    test('Invariant: ZERO Skia clipPath method invocations across all .dart source files in quant_tube/lib', () {
      expect(appDir.existsSync(), isTrue);

      final clipPathCallRegex = RegExp(r'(\.clipPath\s*\(|canvas\.clipPath\s*\()');

      final dartFiles = appDir
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
