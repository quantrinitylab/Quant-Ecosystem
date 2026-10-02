import 'package:flutter/material.dart';
import 'package:quant_theme/quant_theme.dart';
import '../models/cooks_models.dart';

/// Repository providing default project state, AI tool catalogs, viral templates,
/// and asset libraries for QuantCooks.
class CooksRepository {
  CooksRepository._();

  /// Default active project loaded into the Studio timeline.
  static TimelineProject getDefaultProject() {
    return TimelineProject(
      id: 'proj_cooks_master_001',
      title: 'Neon Cyberpunk Viral Reel 4K',
      resolution: ResolutionPreset.k4_60fps,
      aspectRatio: AspectRatioMode.vertical9x16,
      totalDurationMs: 15000,
      currentPlayheadMs: 4200,
      lastModified: DateTime.now().subtract(const Duration(minutes: 12)),
      isAutoSaved: true,
      overlays: [
        const OverlayElement(
          id: 'ov_caption_1',
          content: 'NEON MATRIX AI',
          isCaption: true,
          normalizedX: 0.5,
          normalizedY: 0.78,
          scale: 1.25,
          rotation: 0.0,
          textColor: Colors.white,
          backgroundColor: Color(0xCC090A0E),
          fontStyle: 'Impact Heavy',
          isSelected: true,
        ),
        const OverlayElement(
          id: 'ov_watermark_2',
          content: 'QUANT SOVEREIGN STUDIO',
          isCaption: false,
          normalizedX: 0.5,
          normalizedY: 0.12,
          scale: 0.85,
          rotation: 0.0,
          textColor: QuantColors.sovereignCyan,
          fontStyle: 'Monospace Pro',
          isSelected: false,
        ),
      ],
      tracks: [
        // Track 0: Video Master Track
        TimelineTrack(
          id: 'track_vid_0',
          name: 'Video Master (A-Roll)',
          type: TrackType.video,
          clips: [
            const TimelineClip(
              id: 'clip_v1',
              name: 'Cyber City Drone 4K',
              trackType: TrackType.video,
              startTimeMs: 0,
              durationMs: 4200,
              trimStartMs: 0,
              trimEndMs: 0,
              speed: 1.0,
              color: QuantColors.sovereignCyan,
              assetUrl: 'assets/video/cyber_drone.mp4',
              transitionName: 'Whip Pan Right',
            ),
            const TimelineClip(
              id: 'clip_v2',
              name: 'AI Neural Core Glow',
              trackType: TrackType.video,
              startTimeMs: 4200,
              durationMs: 5600,
              trimStartMs: 200,
              trimEndMs: 400,
              speed: 1.2,
              color: QuantColors.moltenAmber,
              assetUrl: 'assets/video/ai_neural.mp4',
              transitionName: 'Zoom In 2x',
            ),
            const TimelineClip(
              id: 'clip_v3',
              name: 'Holographic Interface Outro',
              trackType: TrackType.video,
              startTimeMs: 9800,
              durationMs: 5200,
              trimStartMs: 0,
              trimEndMs: 0,
              speed: 1.0,
              color: QuantColors.obsidianPurple,
              assetUrl: 'assets/video/holo_outro.mp4',
            ),
          ],
        ),

        // Track 1: B-Roll & Overlay VFX Track
        TimelineTrack(
          id: 'track_broll_1',
          name: 'B-Roll & Alpha VFX',
          type: TrackType.broll,
          clips: [
            const TimelineClip(
              id: 'clip_br1',
              name: 'Glitch Light Leak FX',
              trackType: TrackType.broll,
              startTimeMs: 3800,
              durationMs: 1200,
              speed: 1.0,
              volume: 0.8,
              color: QuantColors.sunsetGold,
              assetUrl: 'assets/vfx/light_leak.mov',
            ),
            const TimelineClip(
              id: 'clip_br2',
              name: 'HUD Telemetry Overlay',
              trackType: TrackType.broll,
              startTimeMs: 8200,
              durationMs: 4000,
              speed: 1.0,
              volume: 1.0,
              color: QuantColors.statusSuccess,
              assetUrl: 'assets/vfx/hud_overlay.mov',
            ),
          ],
        ),

        // Track 2: Music Bed Track
        TimelineTrack(
          id: 'track_aud_2',
          name: 'Synthwave Sound Bed',
          type: TrackType.audio,
          clips: [
            TimelineClip(
              id: 'clip_aud1',
              name: 'Sub-Bass Euphoria 140BPM',
              trackType: TrackType.audio,
              startTimeMs: 0,
              durationMs: 15000,
              volume: 0.85,
              color: QuantColors.emeraldMatrix,
              assetUrl: 'assets/audio/synthwave.wav',
              waveformPeaks: [
                0.2, 0.4, 0.7, 0.9, 0.5, 0.3, 0.8, 1.0, 0.6, 0.4,
                0.9, 0.8, 0.7, 0.5, 0.9, 1.0, 0.8, 0.4, 0.3, 0.6,
                0.7, 0.9, 0.5, 0.4, 0.8, 0.9, 0.6, 0.3, 0.7, 0.8,
                0.9, 0.5, 0.6, 0.8, 1.0, 0.7, 0.4, 0.8, 0.9, 0.5
              ],
            ),
          ],
        ),

        // Track 3: Voice / Mic Track
        TimelineTrack(
          id: 'track_vox_3',
          name: 'Neural Studio Voice',
          type: TrackType.voiceover,
          clips: [
            TimelineClip(
              id: 'clip_vox1',
              name: 'AI Voiceover: "Experience Infinity"',
              trackType: TrackType.voiceover,
              startTimeMs: 800,
              durationMs: 13200,
              volume: 1.0,
              color: QuantColors.sunriseRose,
              assetUrl: 'assets/audio/voiceover.wav',
              waveformPeaks: [
                0.1, 0.6, 0.8, 0.9, 0.2, 0.1, 0.8, 0.7, 0.5, 0.2,
                0.0, 0.7, 0.9, 0.6, 0.3, 0.0, 0.5, 0.8, 0.9, 0.4,
                0.2, 0.7, 0.9, 0.8, 0.1, 0.0, 0.6, 0.8, 0.7, 0.3
              ],
            ),
          ],
        ),

        // Track 4: Kinetic Captions
        TimelineTrack(
          id: 'track_cap_4',
          name: 'Kinetic Captions Whisper V3',
          type: TrackType.captions,
          clips: [
            const TimelineClip(
              id: 'clip_cap1',
              name: 'TRANSFORM YOUR WORKFLOW',
              trackType: TrackType.captions,
              startTimeMs: 1000,
              durationMs: 3200,
              color: QuantColors.moltenAmber,
              assetUrl: 'text/cap1',
            ),
            const TimelineClip(
              id: 'clip_cap2',
              name: '120HZ HARDWARE RENDERING',
              trackType: TrackType.captions,
              startTimeMs: 4400,
              durationMs: 4600,
              color: QuantColors.sovereignCyan,
              assetUrl: 'text/cap2',
            ),
            const TimelineClip(
              id: 'clip_cap3',
              name: 'AI CREATION UNLEASHED',
              trackType: TrackType.captions,
              startTimeMs: 9200,
              durationMs: 5000,
              color: QuantColors.sunsetGold,
              assetUrl: 'text/cap3',
            ),
          ],
        ),
      ],
    );
  }

  /// AI Creation & Editing Tools Catalog.
  static List<AiToolItem> getAiTools() {
    return const [
      AiToolItem(
        id: 'ai_text_to_video',
        type: AiToolType.textToVideo,
        title: 'Text-to-Video Synthesis',
        subtitle: 'Sora & Gen-3 Diffusion Core',
        description:
            'Generate photorealistic 4K 60fps video clips from natural language prompt descriptions in seconds.',
        badgeText: 'GEN-3 DIFFUSION',
        icon: Icons.movie_filter_rounded,
        accentColor: QuantColors.sovereignCyan,
        estimatedSeconds: 12,
      ),
      AiToolItem(
        id: 'ai_auto_captions',
        type: AiToolType.autoCaptions,
        title: 'Auto-Captions & Kinetic Text',
        subtitle: 'Whisper V3 Word-Level Sync',
        description:
            'Transcribe audio with 99.4% precision and apply bouncy kinetic typography with glowing emphasis.',
        badgeText: 'SUB-5MS SYNC',
        icon: Icons.subtitles_rounded,
        accentColor: QuantColors.moltenAmber,
        estimatedSeconds: 3,
      ),
      AiToolItem(
        id: 'ai_bg_remover',
        type: AiToolType.backgroundRemover,
        title: 'Background Remover / Green Screen',
        subtitle: 'Neural Rotoscoping & Matte',
        description:
            'Isolate subjects from any complex background without physical green screen. Instant alpha transparency.',
        badgeText: 'INSTANT MATTE',
        icon: Icons.person_remove_rounded,
        accentColor: QuantColors.obsidianPurple,
        estimatedSeconds: 6,
      ),
      AiToolItem(
        id: 'ai_voice_enhancer',
        type: AiToolType.voiceEnhancer,
        title: 'Voice Enhancer / Noise Cleaner',
        subtitle: 'Studio Denoiser & De-Reverb',
        description:
            'Remove background hum, wind noise, and room reverb. Elevates budget phone mics to broadcast studio clarity.',
        badgeText: 'STUDIO GRADE',
        icon: Icons.mic_external_on_rounded,
        accentColor: QuantColors.statusSuccess,
        estimatedSeconds: 4,
      ),
      AiToolItem(
        id: 'ai_color_match',
        type: AiToolType.colorMatch,
        title: 'Hollywood Cinema Color Match',
        subtitle: 'Neural 3D LUT Palette Transfer',
        description:
            'Upload a reference frame from Blade Runner, Dune, or Oppenheimer and adapt your lighting profile.',
        badgeText: '3D LUT ENGINE',
        icon: Icons.palette_rounded,
        accentColor: QuantColors.sunsetGold,
        estimatedSeconds: 5,
      ),
      AiToolItem(
        id: 'ai_speed_ramp',
        type: AiToolType.speedRamp,
        title: 'Optical Flow Speed Ramp',
        subtitle: '480fps AI Frame Synthesis',
        description:
            'Seamlessly interpolate 30fps/60fps clips into ultra-fluid super slow-motion with beat-marker snapping.',
        badgeText: '480FPS FLOW',
        icon: Icons.speed_rounded,
        accentColor: QuantColors.sunriseRose,
        estimatedSeconds: 8,
      ),
    ];
  }

  /// Viral CapCut-class video templates.
  static List<CooksTemplate> getTemplates() {
    return const [
      CooksTemplate(
        id: 'tmpl_viral_hook',
        title: 'Kinetic 3-Second Retention Hook',
        category: 'Viral Reels',
        durationSec: 15,
        aspectRatio: AspectRatioMode.vertical9x16,
        clipsCount: 7,
        usesCount: 142800,
        musicName: 'Hyperdrive Trap Beat (Sync)',
        thumbnailColor: Color(0xFF1E293B),
      ),
      CooksTemplate(
        id: 'tmpl_tech_review',
        title: 'Minimalist Tech Showcase 4K',
        category: 'Tech & Reviews',
        durationSec: 30,
        aspectRatio: AspectRatioMode.widescreen16x9,
        clipsCount: 12,
        usesCount: 89400,
        musicName: 'Clean Ambient Future Bass',
        thumbnailColor: Color(0xFF0F172A),
      ),
      CooksTemplate(
        id: 'tmpl_beat_montage',
        title: 'Fast Cut Beat Drop Montage',
        category: 'Action & Travel',
        durationSec: 12,
        aspectRatio: AspectRatioMode.vertical9x16,
        clipsCount: 18,
        usesCount: 230500,
        musicName: 'Glitch Hop Heavy Drop',
        thumbnailColor: Color(0xFF312E81),
      ),
      CooksTemplate(
        id: 'tmpl_ai_avatar',
        title: 'Sovereign AI Explainer Series',
        category: 'Education & AI',
        durationSec: 45,
        aspectRatio: AspectRatioMode.vertical9x16,
        clipsCount: 9,
        usesCount: 65100,
        musicName: 'Corporate Lo-Fi Chill',
        thumbnailColor: Color(0xFF14532D),
      ),
    ];
  }

  /// Recent projects drafts in workspace.
  static List<TimelineProject> getRecentProjects() {
    final now = DateTime.now();
    return [
      getDefaultProject(),
      TimelineProject(
        id: 'proj_2',
        title: 'Tech Keynote Launch Video',
        resolution: ResolutionPreset.k4_60fps,
        aspectRatio: AspectRatioMode.widescreen16x9,
        totalDurationMs: 64000,
        currentPlayheadMs: 12000,
        tracks: const [],
        overlays: const [],
        lastModified: now.subtract(const Duration(hours: 3)),
      ),
      TimelineProject(
        id: 'proj_3',
        title: 'Sneaker Drop Kinetic Reel',
        resolution: ResolutionPreset.p1080_60fps,
        aspectRatio: AspectRatioMode.vertical9x16,
        totalDurationMs: 12000,
        currentPlayheadMs: 5000,
        tracks: const [],
        overlays: const [],
        lastModified: now.subtract(const Duration(days: 1)),
      ),
    ];
  }
}
