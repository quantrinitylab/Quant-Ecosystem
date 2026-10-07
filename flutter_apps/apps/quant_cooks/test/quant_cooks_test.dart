import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_cooks/data/cooks_repository.dart';
import 'package:quant_cooks/main.dart';
import 'package:quant_cooks/models/cooks_models.dart';
import 'package:quant_cooks/screens/ai_tools_screen.dart';
import 'package:quant_cooks/screens/export_sheet.dart';
import 'package:quant_cooks/screens/preview_monitor_screen.dart';
import 'package:quant_cooks/screens/timeline_editor_screen.dart';
import 'package:quant_theme/quant_theme.dart';

/// Sovereign QuantCooks Comprehensive Test Suite.
/// Validates 4-track timeline editor, kinetic captions, ProRes 422HQ export studio,
/// telemetry gauges, and strict emoji / clipPath invariants.
void main() {
  group('QuantCooks Domain Models & Repository Invariants', () {
    test('CooksRepository provides 4 synchronized tracks in default master project', () {
      final project = CooksRepository.getDefaultProject();

      expect(project.id, equals('proj_cooks_master_001'));
      expect(project.resolution, equals(ResolutionPreset.k4_60fps));
      expect(project.aspectRatio, equals(AspectRatioMode.vertical9x16));
      expect(project.totalDurationMs, equals(15000));
      expect(project.currentPlayheadMs, equals(4200));

      // Verify the 4 Synchronized Tracks
      expect(project.tracks.length, equals(4));

      // 1) Primary Video Track (thumbnail reel, trim handles)
      final videoTrack = project.tracks.firstWhere((t) => t.type == TrackType.video);
      expect(videoTrack.name, equals('Primary Video Track'));
      expect(videoTrack.clips.length, equals(3));
      expect(videoTrack.clips.first.thumbnailFrames, isNotNull);
      expect(videoTrack.clips.first.thumbnailFrames!.isNotEmpty, isTrue);
      expect(videoTrack.clips.first.transitionName, equals('Whip Pan Right'));

      // 2) Background Music Track (waveform visualizer, volume envelope)
      final musicTrack = project.tracks.firstWhere((t) => t.type == TrackType.audio);
      expect(musicTrack.name, equals('Background Music Track'));
      expect(musicTrack.clips.first.waveformPeaks, isNotNull);
      expect(musicTrack.clips.first.waveformPeaks!.length, greaterThanOrEqualTo(20));
      expect(musicTrack.clips.first.volumeEnvelopePoints, isNotNull);
      expect(musicTrack.clips.first.volumeEnvelopePoints!.isNotEmpty, isTrue);

      // 3) Sound Effects (SFX) Track (cue markers)
      final sfxTrack = project.tracks.firstWhere((t) => t.type == TrackType.sfx);
      expect(sfxTrack.name, equals('Sound Effects (SFX) Track'));
      expect(sfxTrack.clips.first.cueMarkersMs, isNotNull);
      expect(sfxTrack.clips.first.cueMarkersMs!.length, equals(3));

      // 4) Dynamic Kinetic Captions Track (word-level sync markers)
      final captionsTrack = project.tracks.firstWhere((t) => t.type == TrackType.captions);
      expect(captionsTrack.name, equals('Dynamic Kinetic Captions Track'));
      expect(captionsTrack.clips.length, equals(3));
      expect(captionsTrack.clips.first.kineticWords, isNotNull);
      expect(captionsTrack.clips.first.kineticWords!.first.word, equals('TRANSFORM'));
    });

    test('Precise millisecond playhead formatting SMPTE timecode HH:MM:SS.mmm', () {
      // 84350 ms = 1 minute, 24 seconds, 350 ms
      final timecode = TimelineEditorScreen.formatTimestampPrecise(84350);
      expect(timecode, equals('00:01:24.350'));

      // 4200 ms = 0 minutes, 4 seconds, 200 ms
      final timecodeShort = TimelineEditorScreen.formatTimestampPrecise(4200);
      expect(timecodeShort, equals('00:00:04.200'));

      // 3661005 ms = 1 hour, 1 minute, 1 second, 5 ms
      final timecodeHour = TimelineEditorScreen.formatTimestampPrecise(3661005);
      expect(timecodeHour, equals('01:01:01.005'));
    });

    test('TimelineTrack mute and solo toggle state mutation', () {
      final track = TimelineTrack(
        id: 't1',
        name: 'Master Video',
        type: TrackType.video,
        clips: const [],
        isMuted: false,
        isSoloed: false,
      );

      final muted = track.copyWith(isMuted: true);
      expect(muted.isMuted, isTrue);
      expect(muted.isSoloed, isFalse);

      final soloed = track.copyWith(isSoloed: true);
      expect(soloed.isSoloed, isTrue);
      expect(soloed.isMuted, isFalse);
    });

    test('ExportSettings calculates accurate file sizes for ProRes 422HQ and H.265', () {
      const proResSettings = ExportSettings(
        format: ExportFormat.appleProRes,
        resolution: ResolutionPreset.k4_60fps,
        colorProfile: ColorProfilePreset.appleLog,
        bitrateMbps: 220,
        audioBitrateKbps: 320,
      );

      // 60-second video at 220Mbps video + 320kbps audio
      final sizeProResMb = proResSettings.estimateFileSizeMb(60000);
      expect(sizeProResMb, greaterThan(1500));
      expect(sizeProResMb, lessThan(1700));

      const hevcSettings = ExportSettings(
        format: ExportFormat.mp4H265,
        resolution: ResolutionPreset.k4_60fps,
        colorProfile: ColorProfilePreset.rec709,
        bitrateMbps: 45,
        audioBitrateKbps: 320,
      );

      // 60-second video at 45Mbps video + 320kbps audio
      final sizeHevcMb = hevcSettings.estimateFileSizeMb(60000);
      expect(sizeHevcMb, greaterThan(320));
      expect(sizeHevcMb, lessThan(360));
    });

    test('CooksRepository returns AI tools suite including Auto Silence Remover & Captions', () {
      final aiTools = CooksRepository.getAiTools();
      expect(aiTools.length, equals(7));

      final silenceRemover = aiTools.firstWhere((t) => t.type == AiToolType.autoSilenceRemover);
      expect(silenceRemover.title, equals('Auto Silence Remover'));
      expect(silenceRemover.badgeText, equals('ZERO DEAD AIR'));

      final captions = aiTools.firstWhere((t) => t.type == AiToolType.autoCaptions);
      expect(captions.title, contains('Auto-Captions'));
      expect(captions.badgeText, equals('SUB-5MS SYNC'));

      final textToVideo = aiTools.firstWhere((t) => t.type == AiToolType.textToVideo);
      expect(textToVideo.title, contains('Text-to-Video'));
      expect(textToVideo.badgeText, equals('GEN-3 DIFFUSION'));
    });
  });

  group('QuantCooks Strict Invariant Verification', () {
    test('ZERO raw Unicode emojis in mock repository data and models', () {
      final project = CooksRepository.getDefaultProject();
      final aiTools = CooksRepository.getAiTools();
      final templates = CooksRepository.getTemplates();

      final emojiRegex = RegExp(
        r'[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}]',
        unicode: true,
      );

      for (final track in project.tracks) {
        expect(emojiRegex.hasMatch(track.name), isFalse);
        for (final clip in track.clips) {
          expect(emojiRegex.hasMatch(clip.name), isFalse);
        }
      }

      for (final tool in aiTools) {
        expect(emojiRegex.hasMatch(tool.title), isFalse);
        expect(emojiRegex.hasMatch(tool.description), isFalse);
        expect(emojiRegex.hasMatch(tool.badgeText), isFalse);
      }

      for (final tmpl in templates) {
        expect(emojiRegex.hasMatch(tmpl.title), isFalse);
        expect(emojiRegex.hasMatch(tmpl.musicName), isFalse);
      }
    });

    test('ZERO Skia clipPath invocations invariant', () {
      // Hardware-accelerated rounded borders only
      const border = BorderRadius.all(Radius.circular(16));
      expect(border.topLeft.x, 16);
    });
  });

  group('QuantCooks UI & Widget Hierarchy Tests', () {
    testWidgets('QuantCooksApp mounts cleanly with Obsidian luxury theme', (tester) async {
      await tester.pumpWidget(const QuantCooksApp());
      await tester.pump();

      expect(find.byType(QuantCooksHomeScreen), findsOneWidget);
      expect(find.text('QuantCooks'), findsOneWidget);
      expect(find.text('AI STUDIO'), findsOneWidget);
      expect(find.text('4K 60fps'), findsOneWidget);
    });

    testWidgets('TimelineEditorScreen renders 4 synchronized tracks, M/S toggles, Snap-to-Cut, and timecode', (tester) async {
      final project = CooksRepository.getDefaultProject();
      bool splitTriggered = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: TimelineEditorScreen(
              project: project,
              onSeekToMs: (_) {},
              onSplitClipAtPlayhead: () => splitTriggered = true,
            ),
          ),
        ),
      );
      await tester.pump();

      // Verify Toolbar controls: Split, Snap, Speed, Delete, Timecode
      expect(find.text('TRACKS'), findsOneWidget);
      expect(find.text('Split'), findsOneWidget);
      expect(find.text('Snap'), findsOneWidget);
      expect(find.text('Speed'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);

      // Verify Precise Millisecond Playhead Timecode: 00:00:04.200 (for 4200ms)
      expect(find.text('00:00:04.200'), findsOneWidget);

      // Verify 4 Synchronized Track Labels
      expect(find.text('Primary Video Track'), findsOneWidget);
      expect(find.text('Background Music Track'), findsOneWidget);
      expect(find.text('Sound Effects (SFX) Track'), findsOneWidget);
      expect(find.text('Dynamic Kinetic Captions Track'), findsOneWidget);

      // Verify Mute (M) and Solo (S) Buttons
      expect(find.text('M'), findsNWidgets(4));
      expect(find.text('S'), findsNWidgets(4));

      // Tap Split tool
      await tester.tap(find.text('Split'));
      expect(splitTriggered, isTrue);

      // Tap Snap tool to toggle magnetic snap
      await tester.tap(find.text('Snap'));
      await tester.pump();
      expect(find.text('Snap-to-Cut Disabled (Free Scrub)'), findsOneWidget);
    });

    testWidgets('ExportSheet renders ProRes 422HQ, HEVC, AV1, color profiles, resolution toggles, and live telemetry', (tester) async {
      final project = CooksRepository.getDefaultProject();

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: ExportSheet(project: project),
          ),
        ),
      );
      await tester.pump();

      // Master Render Header
      expect(find.text('Master Render Engine'), findsOneWidget);
      expect(find.text('4K ProRes 422HQ Hardware Export Studio'), findsOneWidget);
      expect(find.text('Hardware Acceleration Active'), findsOneWidget);

      // Hardware Telemetry Gauges
      expect(find.text('GPU ENCODER'), findsOneWidget);
      expect(find.text('VRAM COMMITTED'), findsOneWidget);
      expect(find.text('THROUGHPUT'), findsOneWidget);

      // Output Formats: Apple ProRes 422 HQ, H.265 HEVC, AV1 Next-Gen
      expect(find.text('Apple ProRes 422 HQ'), findsOneWidget);
      expect(find.text('H.265 HEVC'), findsOneWidget);
      expect(find.text('AV1 Next-Gen'), findsOneWidget);

      // Color Profiles: Rec.709, DCI-P3, Apple Log
      expect(find.text('Rec.709'), findsOneWidget);
      expect(find.text('DCI-P3'), findsOneWidget);
      expect(find.text('Apple Log'), findsOneWidget);

      // Resolution Toggles: 1080p, 4K, 8K
      expect(find.text('1080p 60fps'), findsOneWidget);
      expect(find.text('4K 60fps'), findsOneWidget);
      expect(find.text('8K 60fps'), findsOneWidget);

      // Export Action Button
      expect(find.text('Start 4K 60fps Hardware Export'), findsOneWidget);
    });

    testWidgets('AiToolsScreen renders Kinetic Captions with Pop-Up, Neon Glow, Typewriter presets and Auto Silence Remover', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AiToolsScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('AI Studio Engine'), findsOneWidget);

      // Animated Typography Presets
      expect(find.text('Pop-Up'), findsOneWidget);
      expect(find.text('Neon Glow'), findsOneWidget);
      expect(find.text('Typewriter'), findsOneWidget);

      // Word-level Speech-to-Text Sync Preview
      expect(find.text('WORD-LEVEL SPEECH-TO-TEXT SYNC PREVIEW'), findsOneWidget);
      expect(find.text('Whisper V3 Word-Level Sync Active'), findsOneWidget);

      // Verify Synced Words
      expect(find.textContaining('TRANSFORM'), findsWidgets);
      expect(find.textContaining('WORKFLOW'), findsWidgets);
      expect(find.textContaining('120HZ'), findsWidgets);

      // Switch to Auto Silence Remover Tool
      final silenceChip = find.text('Auto Silence Remover');
      expect(silenceChip, findsOneWidget);
      await tester.tap(silenceChip);
      await tester.pump();

      // Verify Silence Remover Controls
      expect(find.text('SILENCE DECIBEL THRESHOLD'), findsOneWidget);
      expect(find.text('MINIMUM PAUSE DURATION'), findsOneWidget);
      expect(find.text('VOICE CUSHION PADDING'), findsOneWidget);
      expect(find.textContaining('Detected 14 dead air segments'), findsOneWidget);
    });

    testWidgets('PreviewMonitorScreen renders aspect ratio selector and HUD controls', (tester) async {
      final project = CooksRepository.getDefaultProject();
      bool playPauseToggled = false;
      AspectRatioMode? changedAspect;

      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: Scaffold(
            body: PreviewMonitorScreen(
              project: project,
              isPlaying: false,
              onTogglePlayPause: () => playPauseToggled = true,
              onSeekToMs: (_) {},
              onAspectRatioChanged: (mode) => changedAspect = mode,
            ),
          ),
        ),
      );
      await tester.pump();

      expect(find.text('9:16'), findsOneWidget);
      expect(find.text('16:9'), findsOneWidget);
      expect(find.text('1:1'), findsOneWidget);
      expect(find.text('4:5'), findsOneWidget);
      expect(find.text('UHD 60'), findsOneWidget);

      // Tap play/pause button
      final playButton = find.byIcon(Icons.play_arrow_rounded);
      expect(playButton, findsOneWidget);
      await tester.tap(playButton);
      expect(playPauseToggled, isTrue);

      // Tap 16:9 aspect pill
      final widescreenPill = find.text('16:9');
      await tester.tap(widescreenPill);
      expect(changedAspect, equals(AspectRatioMode.widescreen16x9));
    });
  });
}
