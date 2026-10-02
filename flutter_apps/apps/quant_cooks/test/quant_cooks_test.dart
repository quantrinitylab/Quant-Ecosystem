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

void main() {
  group('QuantCooks Domain Models & Repository Invariants', () {
    test('CooksRepository provides valid default 4K multi-track project', () {
      final project = CooksRepository.getDefaultProject();

      expect(project.id, equals('proj_cooks_master_001'));
      expect(project.resolution, equals(ResolutionPreset.k4_60fps));
      expect(project.aspectRatio, equals(AspectRatioMode.vertical9x16));
      expect(project.totalDurationMs, equals(15000));
      expect(project.currentPlayheadMs, equals(4200));

      // Verify multi-track composition
      expect(project.tracks.length, greaterThanOrEqualTo(5));

      final videoTrack = project.tracks.firstWhere((t) => t.type == TrackType.video);
      expect(videoTrack.clips.length, equals(3));
      expect(videoTrack.clips.first.name, contains('Cyber City'));
      expect(videoTrack.clips.first.transitionName, equals('Whip Pan Right'));

      final audioTrack = project.tracks.firstWhere((t) => t.type == TrackType.audio);
      expect(audioTrack.clips.first.waveformPeaks, isNotNull);
      expect(audioTrack.clips.first.waveformPeaks!.isNotEmpty, isTrue);

      final captionsTrack = project.tracks.firstWhere((t) => t.type == TrackType.captions);
      expect(captionsTrack.clips.length, equals(3));
    });

    test('TimelineClip trimming and effective duration math is accurate', () {
      const clip = TimelineClip(
        id: 'c1',
        name: 'Test Clip',
        trackType: TrackType.video,
        startTimeMs: 1000,
        durationMs: 5000,
        trimStartMs: 500,
        trimEndMs: 1000,
        speed: 1.0,
        color: Colors.blue,
        assetUrl: 'test.mp4',
      );

      // (5000 - 500 - 1000) / 1.0 = 3500ms
      expect(clip.effectiveDurationMs, equals(3500));

      final spedUpClip = clip.copyWith(speed: 2.0);
      // (5000 - 500 - 1000) / 2.0 = 1750ms
      expect(spedUpClip.effectiveDurationMs, equals(1750));
    });

    test('ExportSettings calculates accurate file sizes for 4K 60fps', () {
      const settings = ExportSettings(
        format: ExportFormat.mp4H265,
        resolution: ResolutionPreset.k4_60fps,
        bitrateMbps: 50,
        audioBitrateKbps: 320,
      );

      // 60-second video at 50Mbps video + 320kbps audio
      final sizeMb = settings.estimateFileSizeMb(60000);
      expect(sizeMb, greaterThan(350));
      expect(sizeMb, lessThan(380));
    });

    test('CooksRepository returns comprehensive AI tool suite', () {
      final aiTools = CooksRepository.getAiTools();
      expect(aiTools.length, equals(6));

      final textToVideo = aiTools.firstWhere((t) => t.type == AiToolType.textToVideo);
      expect(textToVideo.title, contains('Text-to-Video'));
      expect(textToVideo.badgeText, equals('GEN-3 DIFFUSION'));

      final captions = aiTools.firstWhere((t) => t.type == AiToolType.autoCaptions);
      expect(captions.title, contains('Auto-Captions'));
      expect(captions.subtitle, contains('Whisper V3'));

      final bgRemover = aiTools.firstWhere((t) => t.type == AiToolType.backgroundRemover);
      expect(bgRemover.badgeText, equals('INSTANT MATTE'));

      final voiceEnhancer = aiTools.firstWhere((t) => t.type == AiToolType.voiceEnhancer);
      expect(voiceEnhancer.badgeText, equals('STUDIO GRADE'));
    });

    test('CooksRepository provides viral CapCut-class templates', () {
      final templates = CooksRepository.getTemplates();
      expect(templates.isNotEmpty, isTrue);

      final viralHook = templates.first;
      expect(viralHook.title, contains('Retention Hook'));
      expect(viralHook.aspectRatio, equals(AspectRatioMode.vertical9x16));
      expect(viralHook.usesCount, greaterThan(100000));
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

    testWidgets('QuantCooks renders 5 bottom navigation tabs', (tester) async {
      await tester.pumpWidget(const QuantCooksApp());
      await tester.pump();

      expect(find.text('Studio'), findsOneWidget);
      expect(find.text('Templates'), findsOneWidget);
      expect(find.text('AI Tools'), findsOneWidget);
      expect(find.text('Assets'), findsOneWidget);
      expect(find.text('Projects'), findsOneWidget);
    });

    testWidgets('PreviewMonitorScreen renders aspect ratio selector and HUD', (tester) async {
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

    testWidgets('TimelineEditorScreen renders tracks and split blade tool', (tester) async {
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

      expect(find.text('TRACKS'), findsOneWidget);
      expect(find.text('Split'), findsOneWidget);
      expect(find.text('Speed'), findsOneWidget);
      expect(find.text('Delete'), findsOneWidget);

      // Verify track labels
      expect(find.text('Video Master (A-Roll)'), findsOneWidget);
      expect(find.text('B-Roll & Alpha VFX'), findsOneWidget);
      expect(find.text('Synthwave Sound Bed'), findsOneWidget);

      // Tap Split tool
      await tester.tap(find.text('Split'));
      expect(splitTriggered, isTrue);
    });

    testWidgets('AiToolsScreen renders generative controls and action button', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: QuantTheme.obsidianDarkTheme,
          home: const AiToolsScreen(),
        ),
      );
      await tester.pump();

      expect(find.text('AI Studio Engine'), findsOneWidget);
      expect(find.text('GEN-3 DIFFUSION'), findsOneWidget);
      expect(find.text('Orbital Drone'), findsOneWidget);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('ExportSheet renders format options and hardware engine', (tester) async {
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

      expect(find.text('Master Render Engine'), findsOneWidget);
      expect(find.text('Hardware Acceleration Active'), findsOneWidget);
      expect(find.text('MP4 (H.265 / HEVC)'), findsOneWidget);
      expect(find.text('Apple ProRes 422 HQ'), findsOneWidget);
      expect(find.text('Animated GIF (60fps)'), findsOneWidget);
      expect(find.text('TARGET BITRATE (CBR/VBR)'), findsOneWidget);
      expect(find.text('Start 4K 60fps Hardware Export'), findsOneWidget);
    });
  });
}
