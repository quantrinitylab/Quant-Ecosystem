// ============================================================================
// Moderation - Video Moderator
// Frame sampling, scene detection, and audio analysis for video content
// ============================================================================

import type {
  ContentCategory,
  ModerationAction,
  ModerationResult,
  CategoryScore,
  TimelineFlag,
} from '../types';

interface VideoModeratorConfig {
  sampleRateSeconds: number;
  maxFrameSamples: number;
  sceneChangeThreshold: number;
  audioAnalysisEnabled: boolean;
  autoRemoveThreshold: number;
  flagThreshold: number;
}

const DEFAULT_CONFIG: VideoModeratorConfig = {
  sampleRateSeconds: 5,
  maxFrameSamples: 200,
  sceneChangeThreshold: 0.4,
  audioAnalysisEnabled: true,
  autoRemoveThreshold: 0.85,
  flagThreshold: 0.6,
};

export interface VideoMetadata {
  id: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  fileSize: number;
  hasAudio: boolean;
  audioCodec?: string;
}

interface FrameSample {
  index: number;
  timestamp: number;
  hash: string;
  brightness: number;
  colorVariance: number;
  motionScore: number;
}

interface SceneInfo {
  startTime: number;
  endTime: number;
  duration: number;
  avgBrightness: number;
  avgMotion: number;
  frameCount: number;
  flags: ContentCategory[];
}

interface AudioAnalysis {
  hasExplicitLyrics: boolean;
  hasSpeech: boolean;
  speechSegments: { start: number; end: number; confidence: number }[];
  volumePeaks: number[];
  explicitScore: number;
}

export type { FrameSample as VideoFrameSample, AudioAnalysis as VideoAudioAnalysis };

/**
 * Real video-analysis backend. Implementations perform genuine frame extraction
 * + per-frame vision classification and real audio analysis (e.g. via ffmpeg +
 * an inference endpoint). When configured, the VideoModerator uses it instead of
 * the built-in heuristic simulation. A configured backend that throws FAILS CLOSED
 * (the error propagates); the heuristic is used only when no backend is configured.
 */
export interface VideoAnalysisBackend {
  sampleFrames(videoId: string, metadata: VideoMetadata): Promise<FrameSample[]>;
  analyzeAudio?(videoId: string, metadata: VideoMetadata): Promise<AudioAnalysis>;
}

/**
 * VideoModerator - Video content moderation engine
 *
 * Performs frame sampling at configurable intervals, scene change
 * detection, audio analysis, and timeline-based flagging for
 * comprehensive video content moderation.
 */
export class VideoModerator {
  private config: VideoModeratorConfig;
  private moderationResults: Map<string, ModerationResult>;
  private timelineFlags: Map<string, TimelineFlag[]>;
  private videoMetadata: Map<string, VideoMetadata>;
  private sceneCache: Map<string, SceneInfo[]>;
  private readonly backend: VideoAnalysisBackend | undefined;

  constructor(config: Partial<VideoModeratorConfig> = {}, backend?: VideoAnalysisBackend) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.moderationResults = new Map();
    this.timelineFlags = new Map();
    this.videoMetadata = new Map();
    this.sceneCache = new Map();
    this.backend = backend;
  }

  /** Whether a real video-analysis backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== undefined;
  }

  /** Moderate a complete video */
  async moderate(videoId: string, metadata: VideoMetadata): Promise<ModerationResult> {
    this.videoMetadata.set(videoId, metadata);

    // Sample frames throughout the video (real backend when configured).
    const frames = await this.acquireFrames(videoId, metadata);

    // Detect scene changes
    const scenes = this.detectScenes(frames, metadata);
    this.sceneCache.set(videoId, scenes);

    // Analyze audio if present
    let audioAnalysis: AudioAnalysis | null = null;
    if (metadata.hasAudio && this.config.audioAnalysisEnabled) {
      audioAnalysis = await this.acquireAudioAnalysis(videoId, metadata);
    }

    // Build timeline flags
    const flags = this.buildTimelineFlags(frames, scenes, audioAnalysis);
    this.timelineFlags.set(videoId, flags);

    // Calculate overall scores
    const categories = this.calculateCategoryScores(frames, flags, audioAnalysis);
    const overallScore = Math.max(...categories.map((c) => c.score), 0);
    const action = this.determineAction(overallScore, categories);

    const result: ModerationResult = {
      id: `vidmod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      contentId: videoId,
      contentType: 'video',
      categories,
      overallScore,
      action,
      confidence: this.calculateConfidence(frames.length, metadata.duration),
      automated: true,
      flags: categories.filter((c) => c.detected).map((c) => c.category),
      metadata: {
        duration: metadata.duration,
        framesSampled: frames.length,
        scenesDetected: scenes.length,
        timelineFlagsCount: flags.length,
      },
      createdAt: Date.now(),
    };

    this.moderationResults.set(videoId, result);
    return result;
  }

  /** Sample frames from a video at configured intervals */
  sampleFrames(metadata: VideoMetadata): FrameSample[] {
    const frames: FrameSample[] = [];
    const totalFrames = Math.min(
      this.config.maxFrameSamples,
      Math.floor(metadata.duration / this.config.sampleRateSeconds),
    );

    for (let i = 0; i < totalFrames; i++) {
      const timestamp = i * this.config.sampleRateSeconds;
      const frameIndex = Math.floor(timestamp * metadata.fps);

      // Simulate frame analysis
      const brightness = 0.3 + Math.random() * 0.4;
      const colorVariance = Math.random() * 0.8;
      const motionScore = Math.random() * 0.6;

      frames.push({
        index: frameIndex,
        timestamp,
        hash: `frame_${frameIndex}_${Date.now().toString(36)}`,
        brightness,
        colorVariance,
        motionScore,
      });
    }

    return frames;
  }

  /** Detect scene changes based on frame differences */
  detectScenes(frames: FrameSample[], _metadata: VideoMetadata): SceneInfo[] {
    const scenes: SceneInfo[] = [];
    let sceneStart = 0;
    let sceneFrames: FrameSample[] = [];

    for (let i = 0; i < frames.length; i++) {
      const currentFrame = frames[i]!;
      sceneFrames.push(currentFrame);

      // Check for scene change
      const prevFrame = frames[i - 1];
      const isSceneChange =
        i > 0 &&
        prevFrame !== undefined &&
        (Math.abs(currentFrame.brightness - prevFrame.brightness) >
          this.config.sceneChangeThreshold ||
          Math.abs(currentFrame.colorVariance - prevFrame.colorVariance) >
            this.config.sceneChangeThreshold ||
          currentFrame.motionScore > 0.8);

      if (isSceneChange || i === frames.length - 1) {
        const avgBrightness =
          sceneFrames.reduce((sum, f) => sum + f.brightness, 0) / sceneFrames.length;
        const avgMotion =
          sceneFrames.reduce((sum, f) => sum + f.motionScore, 0) / sceneFrames.length;

        // Flag dark scenes with high motion as potentially violent
        const flags: ContentCategory[] = [];
        if (avgBrightness < 0.25 && avgMotion > 0.5) flags.push('violence');
        if (avgMotion > 0.7) flags.push('violence');

        scenes.push({
          startTime: sceneStart,
          endTime: currentFrame.timestamp,
          duration: currentFrame.timestamp - sceneStart,
          avgBrightness,
          avgMotion,
          frameCount: sceneFrames.length,
          flags,
        });

        sceneStart = currentFrame.timestamp;
        sceneFrames = [];
      }
    }

    return scenes;
  }

  /** Analyze audio track of a video */
  async analyzeAudio(_videoId: string, metadata: VideoMetadata): Promise<AudioAnalysis> {
    // Simulate audio analysis
    const speechSegments: { start: number; end: number; confidence: number }[] = [];
    const volumePeaks: number[] = [];

    // Generate simulated speech segments
    const segmentCount = Math.floor(metadata.duration / 30);
    for (let i = 0; i < segmentCount; i++) {
      const start = i * 30 + Math.random() * 10;
      const duration = 5 + Math.random() * 20;
      speechSegments.push({
        start,
        end: Math.min(start + duration, metadata.duration),
        confidence: 0.7 + Math.random() * 0.3,
      });
    }

    // Simulate volume peaks
    for (let t = 0; t < metadata.duration; t += 10) {
      volumePeaks.push(0.3 + Math.random() * 0.7);
    }

    // Simulate explicit content detection in audio
    const explicitScore = Math.random() * 0.3;

    return {
      hasExplicitLyrics: explicitScore > 0.5,
      hasSpeech: speechSegments.length > 0,
      speechSegments,
      volumePeaks,
      explicitScore,
    };
  }

  /** Get timeline flags for a moderated video */
  async getTimelineFlags(videoId: string): Promise<TimelineFlag[]> {
    return this.timelineFlags.get(videoId) || [];
  }

  /** Get full moderation report for a video */
  async getReport(videoId: string): Promise<{
    result: ModerationResult | null;
    scenes: SceneInfo[];
    timelineFlags: TimelineFlag[];
    metadata: VideoMetadata | null;
  }> {
    return {
      result: this.moderationResults.get(videoId) || null,
      scenes: this.sceneCache.get(videoId) || [],
      timelineFlags: this.timelineFlags.get(videoId) || [],
      metadata: this.videoMetadata.get(videoId) || null,
    };
  }

  /** Moderate a live stream (processes in chunks) */
  async moderateStream(
    streamId: string,
    chunkDuration: number,
    chunkIndex: number,
  ): Promise<{
    flags: TimelineFlag[];
    shouldInterrupt: boolean;
    severity: number;
  }> {
    const startTime = chunkIndex * chunkDuration;
    const frames: FrameSample[] = [];

    // Sample frames within this chunk
    const samplesPerChunk = Math.floor(chunkDuration / this.config.sampleRateSeconds);
    for (let i = 0; i < samplesPerChunk; i++) {
      frames.push({
        index: i,
        timestamp: startTime + i * this.config.sampleRateSeconds,
        hash: `stream_${streamId}_${chunkIndex}_${i}`,
        brightness: 0.3 + Math.random() * 0.4,
        colorVariance: Math.random() * 0.8,
        motionScore: Math.random() * 0.6,
      });
    }

    const flags: TimelineFlag[] = [];
    let maxSeverity = 0;

    for (const frame of frames) {
      if (frame.brightness < 0.2 && frame.motionScore > 0.7) {
        const flag: TimelineFlag = {
          timestamp: frame.timestamp,
          duration: this.config.sampleRateSeconds,
          category: 'violence',
          confidence: 0.6,
          frameIndex: frame.index,
          description: 'Potential violent content detected in stream',
        };
        flags.push(flag);
        maxSeverity = Math.max(maxSeverity, 0.7);
      }
    }

    return {
      flags,
      shouldInterrupt: maxSeverity >= this.config.autoRemoveThreshold,
      severity: maxSeverity,
    };
  }

  // --- Private Methods ---

  /**
   * Acquire frame samples from the real backend when configured.
   *
   * Safety posture: once a real backend is wired up, a backend failure FAILS CLOSED
   * (the error propagates so the job retries / goes to manual review) instead of
   * silently scoring the video against a fabricated random heuristic. The heuristic
   * is only used when NO backend is configured at all (explicit demo/dev mode).
   */
  private async acquireFrames(videoId: string, metadata: VideoMetadata): Promise<FrameSample[]> {
    if (this.backend) {
      try {
        return await this.backend.sampleFrames(videoId, metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error(
          `[video-moderator] backend frame sampling failed for ${videoId}, failing closed: ${message}`,
        );
        throw error instanceof Error ? error : new Error(message);
      }
    }
    return this.sampleFrames(metadata);
  }

  /**
   * Acquire audio analysis from the real backend when available.
   *
   * Same fail-closed posture as {@link acquireFrames}: a configured backend that
   * errors propagates rather than degrading to the random heuristic.
   */
  private async acquireAudioAnalysis(
    videoId: string,
    metadata: VideoMetadata,
  ): Promise<AudioAnalysis> {
    if (this.backend?.analyzeAudio) {
      try {
        return await this.backend.analyzeAudio(videoId, metadata);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error(
          `[video-moderator] backend audio analysis failed for ${videoId}, failing closed: ${message}`,
        );
        throw error instanceof Error ? error : new Error(message);
      }
    }
    return this.analyzeAudio(videoId, metadata);
  }

  private buildTimelineFlags(
    frames: FrameSample[],
    scenes: SceneInfo[],
    audio: AudioAnalysis | null,
  ): TimelineFlag[] {
    const flags: TimelineFlag[] = [];

    // Flag scenes with issues
    for (const scene of scenes) {
      for (const category of scene.flags) {
        flags.push({
          timestamp: scene.startTime,
          duration: scene.duration,
          category,
          confidence: 0.6,
          frameIndex: 0,
          description: `Scene flagged for ${category} (brightness: ${scene.avgBrightness.toFixed(2)}, motion: ${scene.avgMotion.toFixed(2)})`,
        });
      }
    }

    // Flag audio issues
    if (audio && audio.hasExplicitLyrics) {
      flags.push({
        timestamp: 0,
        duration: frames.length > 0 ? (frames[frames.length - 1]?.timestamp ?? 0) : 0,
        category: 'profanity',
        confidence: 0.7,
        frameIndex: 0,
        description: 'Explicit audio content detected',
      });
    }

    return flags.sort((a, b) => a.timestamp - b.timestamp);
  }

  private calculateCategoryScores(
    _frames: FrameSample[],
    flags: TimelineFlag[],
    audio: AudioAnalysis | null,
  ): CategoryScore[] {
    const categoryCounts: Map<ContentCategory, number> = new Map();
    for (const flag of flags) {
      categoryCounts.set(flag.category, (categoryCounts.get(flag.category) || 0) + 1);
    }

    const categories: CategoryScore[] = [];
    const allCategories: ContentCategory[] = ['nsfw', 'violence', 'profanity', 'hate_speech'];

    for (const category of allCategories) {
      const count = categoryCounts.get(category) || 0;
      const score = Math.min(1, count * 0.2);
      categories.push({
        category,
        score,
        confidence: score > 0 ? 0.65 : 0.9,
        detected: score >= this.config.flagThreshold,
      });
    }

    // Audio-based scoring
    if (audio && audio.explicitScore > 0.5) {
      const profanityIdx = categories.findIndex((c) => c.category === 'profanity');
      const profanityCategory = categories[profanityIdx];
      if (profanityIdx >= 0 && profanityCategory) {
        profanityCategory.score = Math.max(profanityCategory.score, audio.explicitScore);
        profanityCategory.detected = profanityCategory.score >= this.config.flagThreshold;
      }
    }

    return categories;
  }

  private calculateConfidence(frameCount: number, duration: number): number {
    const coverageRatio = (frameCount * this.config.sampleRateSeconds) / Math.max(1, duration);
    return Math.min(0.95, 0.5 + coverageRatio * 0.45);
  }

  private determineAction(score: number, categories: CategoryScore[]): ModerationAction {
    if (score >= this.config.autoRemoveThreshold) return 'remove';
    if (score >= this.config.flagThreshold) return 'flag';
    if (categories.some((c) => c.detected)) return 'age_restrict';
    return 'approve';
  }
}
