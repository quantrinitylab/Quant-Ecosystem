import 'package:flutter/material.dart';

/// Aspect ratio modes for the Sovereign Preview Monitor.
enum AspectRatioMode {
  vertical9x16(
    label: '9:16',
    description: 'Vertical Reel / Shorts',
    aspectRatio: 9.0 / 16.0,
    icon: Icons.stay_current_portrait_rounded,
  ),
  widescreen16x9(
    label: '16:9',
    description: 'YouTube / Cinema',
    aspectRatio: 16.0 / 9.0,
    icon: Icons.stay_current_landscape_rounded,
  ),
  square1x1(
    label: '1:1',
    description: 'Square Feed / Post',
    aspectRatio: 1.0,
    icon: Icons.crop_square_rounded,
  ),
  portrait4x5(
    label: '4:5',
    description: 'Social Portrait Feed',
    aspectRatio: 4.0 / 5.0,
    icon: Icons.crop_portrait_rounded,
  );

  const AspectRatioMode({
    required this.label,
    required this.description,
    required this.aspectRatio,
    required this.icon,
  });

  final String label;
  final String description;
  final double aspectRatio;
  final IconData icon;
}

/// Resolution presets for timeline & 4K 60fps export engine.
enum ResolutionPreset {
  k4_60fps(
    label: '4K 60fps',
    badge: 'UHD 60',
    width: 3840,
    height: 2160,
    fps: 60,
    isUltra: true,
  ),
  k4_30fps(
    label: '4K 30fps',
    badge: 'UHD 30',
    width: 3840,
    height: 2160,
    fps: 30,
    isUltra: true,
  ),
  p1080_60fps(
    label: '1080p 60fps',
    badge: 'FHD 60',
    width: 1920,
    height: 1080,
    fps: 60,
    isUltra: false,
  ),
  p1080_30fps(
    label: '1080p 30fps',
    badge: 'FHD 30',
    width: 1920,
    height: 1080,
    fps: 30,
    isUltra: false,
  ),
  p720_30fps(
    label: '720p 30fps',
    badge: 'HD 30',
    width: 1280,
    height: 720,
    fps: 30,
    isUltra: false,
  );

  const ResolutionPreset({
    required this.label,
    required this.badge,
    required this.width,
    required this.height,
    required this.fps,
    required this.isUltra,
  });

  final String label;
  final String badge;
  final int width;
  final int height;
  final int fps;
  final bool isUltra;
}

/// Track classification in the multi-track timeline engine.
enum TrackType {
  video(label: 'Video Master', icon: Icons.videocam_rounded),
  broll(label: 'B-Roll Overlay', icon: Icons.layers_rounded),
  audio(label: 'Music Bed', icon: Icons.music_note_rounded),
  voiceover(label: 'Voice / Mic', icon: Icons.mic_rounded),
  captions(label: 'Kinetic Captions', icon: Icons.subtitles_rounded),
  effects(label: 'VFX & Filters', icon: Icons.auto_awesome_rounded);

  const TrackType({required this.label, required this.icon});

  final String label;
  final IconData icon;
}

/// An individual media clip on the multi-track timeline.
class TimelineClip {
  final String id;
  final String name;
  final TrackType trackType;
  final int startTimeMs;
  final int durationMs;
  final int trimStartMs;
  final int trimEndMs;
  final double speed;
  final double volume;
  final Color color;
  final String assetUrl;
  final String? transitionName;
  final List<double>? waveformPeaks;

  const TimelineClip({
    required this.id,
    required this.name,
    required this.trackType,
    required this.startTimeMs,
    required this.durationMs,
    this.trimStartMs = 0,
    this.trimEndMs = 0,
    this.speed = 1.0,
    this.volume = 1.0,
    required this.color,
    required this.assetUrl,
    this.transitionName,
    this.waveformPeaks,
  });

  int get effectiveDurationMs =>
      ((durationMs - trimStartMs - trimEndMs) / speed).round();

  TimelineClip copyWith({
    String? id,
    String? name,
    TrackType? trackType,
    int? startTimeMs,
    int? durationMs,
    int? trimStartMs,
    int? trimEndMs,
    double? speed,
    double? volume,
    Color? color,
    String? assetUrl,
    String? transitionName,
    List<double>? waveformPeaks,
  }) {
    return TimelineClip(
      id: id ?? this.id,
      name: name ?? this.name,
      trackType: trackType ?? this.trackType,
      startTimeMs: startTimeMs ?? this.startTimeMs,
      durationMs: durationMs ?? this.durationMs,
      trimStartMs: trimStartMs ?? this.trimStartMs,
      trimEndMs: trimEndMs ?? this.trimEndMs,
      speed: speed ?? this.speed,
      volume: volume ?? this.volume,
      color: color ?? this.color,
      assetUrl: assetUrl ?? this.assetUrl,
      transitionName: transitionName ?? this.transitionName,
      waveformPeaks: waveformPeaks ?? this.waveformPeaks,
    );
  }
}

/// A track container holding sequence clips.
class TimelineTrack {
  final String id;
  final String name;
  final TrackType type;
  final List<TimelineClip> clips;
  final bool isMuted;
  final bool isLocked;
  final bool isHidden;
  final double volume;

  const TimelineTrack({
    required this.id,
    required this.name,
    required this.type,
    required this.clips,
    this.isMuted = false,
    this.isLocked = false,
    this.isHidden = false,
    this.volume = 1.0,
  });

  int get totalTrackDurationMs {
    if (clips.isEmpty) return 0;
    int maxEnd = 0;
    for (final clip in clips) {
      final end = clip.startTimeMs + clip.effectiveDurationMs;
      if (end > maxEnd) maxEnd = end;
    }
    return maxEnd;
  }

  TimelineTrack copyWith({
    String? id,
    String? name,
    TrackType? type,
    List<TimelineClip>? clips,
    bool? isMuted,
    bool? isLocked,
    bool? isHidden,
    double? volume,
  }) {
    return TimelineTrack(
      id: id ?? this.id,
      name: name ?? this.name,
      type: type ?? this.type,
      clips: clips ?? this.clips,
      isMuted: isMuted ?? this.isMuted,
      isLocked: isLocked ?? this.isLocked,
      isHidden: isHidden ?? this.isHidden,
      volume: volume ?? this.volume,
    );
  }
}

/// Overlay elements (text captions, stickers, watermarks) positioned on preview monitor.
class OverlayElement {
  final String id;
  final String content;
  final bool isCaption;
  final double normalizedX; // 0.0 to 1.0
  final double normalizedY; // 0.0 to 1.0
  final double scale;
  final double rotation;
  final Color textColor;
  final Color? backgroundColor;
  final String fontStyle;
  final bool isSelected;

  const OverlayElement({
    required this.id,
    required this.content,
    this.isCaption = false,
    required this.normalizedX,
    required this.normalizedY,
    this.scale = 1.0,
    this.rotation = 0.0,
    this.textColor = Colors.white,
    this.backgroundColor,
    this.fontStyle = 'Bebas Neue',
    this.isSelected = false,
  });

  OverlayElement copyWith({
    String? id,
    String? content,
    bool? isCaption,
    double? normalizedX,
    double? normalizedY,
    double? scale,
    double? rotation,
    Color? textColor,
    Color? backgroundColor,
    String? fontStyle,
    bool? isSelected,
  }) {
    return OverlayElement(
      id: id ?? this.id,
      content: content ?? this.content,
      isCaption: isCaption ?? this.isCaption,
      normalizedX: normalizedX ?? this.normalizedX,
      normalizedY: normalizedY ?? this.normalizedY,
      scale: scale ?? this.scale,
      rotation: rotation ?? this.rotation,
      textColor: textColor ?? this.textColor,
      backgroundColor: backgroundColor ?? this.backgroundColor,
      fontStyle: fontStyle ?? this.fontStyle,
      isSelected: isSelected ?? this.isSelected,
    );
  }
}

/// Active project representation with state machine.
class TimelineProject {
  final String id;
  final String title;
  final ResolutionPreset resolution;
  final AspectRatioMode aspectRatio;
  final int totalDurationMs;
  final int currentPlayheadMs;
  final List<TimelineTrack> tracks;
  final List<OverlayElement> overlays;
  final DateTime lastModified;
  final bool isAutoSaved;

  const TimelineProject({
    required this.id,
    required this.title,
    required this.resolution,
    required this.aspectRatio,
    required this.totalDurationMs,
    required this.currentPlayheadMs,
    required this.tracks,
    required this.overlays,
    required this.lastModified,
    this.isAutoSaved = true,
  });

  TimelineProject copyWith({
    String? id,
    String? title,
    ResolutionPreset? resolution,
    AspectRatioMode? aspectRatio,
    int? totalDurationMs,
    int? currentPlayheadMs,
    List<TimelineTrack>? tracks,
    List<OverlayElement>? overlays,
    DateTime? lastModified,
    bool? isAutoSaved,
  }) {
    return TimelineProject(
      id: id ?? this.id,
      title: title ?? this.title,
      resolution: resolution ?? this.resolution,
      aspectRatio: aspectRatio ?? this.aspectRatio,
      totalDurationMs: totalDurationMs ?? this.totalDurationMs,
      currentPlayheadMs: currentPlayheadMs ?? this.currentPlayheadMs,
      tracks: tracks ?? this.tracks,
      overlays: overlays ?? this.overlays,
      lastModified: lastModified ?? this.lastModified,
      isAutoSaved: isAutoSaved ?? this.isAutoSaved,
    );
  }
}

/// Render engine export formats.
enum ExportFormat {
  mp4H265(
    label: 'MP4 (H.265 / HEVC)',
    codec: 'hevc_nvenc',
    extension: 'mp4',
    badge: 'Hardware 10-Bit',
  ),
  mp4H264(
    label: 'MP4 (H.264 Universal)',
    codec: 'h264_mediacodec',
    extension: 'mp4',
    badge: 'Universal Web',
  ),
  appleProRes(
    label: 'Apple ProRes 422 HQ',
    codec: 'prores_ks',
    extension: 'mov',
    badge: 'Studio Master',
  ),
  animatedGif(
    label: 'Animated GIF (60fps)',
    codec: 'gif_lossless',
    extension: 'gif',
    badge: 'Looping Sticker',
  );

  const ExportFormat({
    required this.label,
    required this.codec,
    required this.extension,
    required this.badge,
  });

  final String label;
  final String codec;
  final String extension;
  final String badge;
}

/// Export configuration state.
class ExportSettings {
  final ExportFormat format;
  final ResolutionPreset resolution;
  final int bitrateMbps;
  final int audioBitrateKbps;
  final String hardwareEngine;
  final bool enableColorGradingLut;
  final bool twoPassEncoding;

  const ExportSettings({
    required this.format,
    required this.resolution,
    this.bitrateMbps = 45,
    this.audioBitrateKbps = 320,
    this.hardwareEngine = 'MediaCodec / NVENC Hybrid Engine',
    this.enableColorGradingLut = true,
    this.twoPassEncoding = true,
  });

  double estimateFileSizeMb(int durationMs) {
    final durationSeconds = durationMs / 1000.0;
    final totalBitrateBitsPerSec = (bitrateMbps * 1000000) + (audioBitrateKbps * 1000);
    final totalBytes = (totalBitrateBitsPerSec * durationSeconds) / 8.0;
    return totalBytes / (1024 * 1024);
  }

  ExportSettings copyWith({
    ExportFormat? format,
    ResolutionPreset? resolution,
    int? bitrateMbps,
    int? audioBitrateKbps,
    String? hardwareEngine,
    bool? enableColorGradingLut,
    bool? twoPassEncoding,
  }) {
    return ExportSettings(
      format: format ?? this.format,
      resolution: resolution ?? this.resolution,
      bitrateMbps: bitrateMbps ?? this.bitrateMbps,
      audioBitrateKbps: audioBitrateKbps ?? this.audioBitrateKbps,
      hardwareEngine: hardwareEngine ?? this.hardwareEngine,
      enableColorGradingLut: enableColorGradingLut ?? this.enableColorGradingLut,
      twoPassEncoding: twoPassEncoding ?? this.twoPassEncoding,
    );
  }
}

/// AI Video & Audio Tool types.
enum AiToolType {
  textToVideo,
  autoCaptions,
  backgroundRemover,
  voiceEnhancer,
  colorMatch,
  speedRamp,
}

/// Catalog item for AI Tools Screen.
class AiToolItem {
  final String id;
  final AiToolType type;
  final String title;
  final String subtitle;
  final String description;
  final String badgeText;
  final IconData icon;
  final Color accentColor;
  final int estimatedSeconds;
  final bool isNeuralAccelerated;

  const AiToolItem({
    required this.id,
    required this.type,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.badgeText,
    required this.icon,
    required this.accentColor,
    required this.estimatedSeconds,
    this.isNeuralAccelerated = true,
  });
}

/// CapCut-style viral video template item.
class CooksTemplate {
  final String id;
  final String title;
  final String category;
  final int durationSec;
  final AspectRatioMode aspectRatio;
  final int clipsCount;
  final int usesCount;
  final String musicName;
  final Color thumbnailColor;

  const CooksTemplate({
    required this.id,
    required this.title,
    required this.category,
    required this.durationSec,
    required this.aspectRatio,
    required this.clipsCount,
    required this.usesCount,
    required this.musicName,
    required this.thumbnailColor,
  });
}
