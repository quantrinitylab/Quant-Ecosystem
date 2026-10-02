import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:quant_tube/models/tube_models.dart';
import 'package:quant_tube/data/tube_repository.dart';
import 'package:quant_tube/main.dart';
import 'package:quant_tube/screens/video_feed_screen.dart';
import 'package:quant_tube/screens/music_player_screen.dart';
import 'package:quant_tube/screens/channel_studio_screen.dart';

void main() {
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

  group('SponsorBlock Segment-Skipping Engine Invariants', () {
    test('SegmentSkipper accurately skips sponsor segment and reports time saved', () {
      final skipper = SegmentSkipper(autoSkipEnabled: true);
      const segments = [
        VideoSegment(
          id: 'seg-sponsor-1',
          title: 'Sponsor Segment',
          startSeconds: 85.0,
          endSeconds: 125.0,
          type: SegmentType.sponsor,
          autoSkip: true,
        ),
        VideoSegment(
          id: 'seg-outro-1',
          title: 'Outro Segment',
          startSeconds: 700.0,
          endSeconds: 742.0,
          type: SegmentType.outro,
          autoSkip: true,
        ),
      ];

      // Before sponsor: should not skip
      final beforeResult = skipper.evaluatePosition(50.0, segments);
      expect(beforeResult.shouldSkip, isFalse);

      // Inside sponsor segment: must trigger auto-skip
      final skipResult = skipper.evaluatePosition(85.0, segments);
      expect(skipResult.shouldSkip, isTrue);
      expect(skipResult.targetSeconds, equals(125.0));
      expect(skipResult.timeSavedSeconds, equals(40.0));
      expect(skipResult.segment!.id, equals('seg-sponsor-1'));

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

  group('QuanTube Widget Hierarchy & Navigation Tests', () {
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
  });
}
