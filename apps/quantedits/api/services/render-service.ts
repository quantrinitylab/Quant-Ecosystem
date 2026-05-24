// ============================================================================
// QuantEdits - Render Service
// Video/image rendering pipeline, format conversion, encoding
// ============================================================================

import type { ExportConfig, ExportJob, ExportFormat, ExportQuality, Layer, Project } from '../../src/types';

interface RenderFrame {
  frameNumber: number;
  time: number;
  layers: RenderedLayer[];
  width: number;
  height: number;
}

interface RenderedLayer {
  layerId: string;
  type: string;
  pixelData: ArrayBuffer | null;
  transform: { x: number; y: number; rotation: number; scaleX: number; scaleY: number; opacity: number };
  blendMode: string;
}

interface CodecConfig {
  video: { codec: string; profile: string; bitrate: number; keyframeInterval: number };
  audio: { codec: string; bitrate: number; sampleRate: number; channels: number };
  container: string;
}

const QUALITY_PRESETS: Record<ExportQuality, { multiplier: number; bitrateFactor: number }> = {
  draft: { multiplier: 0.5, bitrateFactor: 0.3 },
  standard: { multiplier: 1, bitrateFactor: 0.6 },
  high: { multiplier: 1, bitrateFactor: 1 },
  ultra: { multiplier: 1, bitrateFactor: 1.5 },
  '4k': { multiplier: 2, bitrateFactor: 2 },
  '8k': { multiplier: 4, bitrateFactor: 4 },
};

const FORMAT_CODECS: Record<ExportFormat, Partial<CodecConfig>> = {
  mp4: { video: { codec: 'h264', profile: 'high', bitrate: 8000000, keyframeInterval: 30 }, audio: { codec: 'aac', bitrate: 256000, sampleRate: 48000, channels: 2 }, container: 'mp4' },
  mov: { video: { codec: 'prores', profile: '422', bitrate: 50000000, keyframeInterval: 1 }, audio: { codec: 'pcm', bitrate: 1536000, sampleRate: 48000, channels: 2 }, container: 'mov' },
  avi: { video: { codec: 'h264', profile: 'main', bitrate: 10000000, keyframeInterval: 30 }, audio: { codec: 'mp3', bitrate: 320000, sampleRate: 44100, channels: 2 }, container: 'avi' },
  webm: { video: { codec: 'vp9', profile: 'main', bitrate: 6000000, keyframeInterval: 60 }, audio: { codec: 'opus', bitrate: 128000, sampleRate: 48000, channels: 2 }, container: 'webm' },
  gif: { video: { codec: 'gif', profile: 'standard', bitrate: 0, keyframeInterval: 1 }, container: 'gif' },
  png: { container: 'png' },
  jpg: { container: 'jpg' },
  webp: { container: 'webp' },
  svg: { container: 'svg' },
  pdf: { container: 'pdf' },
};

export class RenderService {
  private jobs: Map<string, ExportJob> = new Map();
  private renderQueue: string[] = [];
  private maxConcurrent = 3;
  private activeRenders = 0;

  async startExport(project: Project, config: ExportConfig, userId: string): Promise<ExportJob> {
    const job: ExportJob = {
      id: `export_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      projectId: project.id,
      userId,
      config,
      status: 'queued',
      progress: 0,
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(job.id, job);
    this.renderQueue.push(job.id);
    this.processQueue();
    return job;
  }

  getJob(jobId: string): ExportJob | null {
    return this.jobs.get(jobId) || null;
  }

  listJobs(userId: string): ExportJob[] {
    return Array.from(this.jobs.values()).filter(j => j.userId === userId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === 'completed' || job.status === 'failed') return false;
    job.status = 'failed';
    job.error = 'Cancelled by user';
    job.completedAt = new Date().toISOString();
    this.renderQueue = this.renderQueue.filter(id => id !== jobId);
    return true;
  }

  private async processQueue(): Promise<void> {
    while (this.renderQueue.length > 0 && this.activeRenders < this.maxConcurrent) {
      const jobId = this.renderQueue.shift();
      if (!jobId) break;
      this.activeRenders++;
      this.processJob(jobId).finally(() => { this.activeRenders--; this.processQueue(); });
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    try {
      job.status = 'processing';
      job.progress = 5;

      // Validate configuration
      const codecConfig = this.resolveCodec(job.config);
      job.progress = 10;

      // Resolve output dimensions
      const quality = QUALITY_PRESETS[job.config.quality];
      const outputWidth = Math.round(job.config.width * quality.multiplier);
      const outputHeight = Math.round(job.config.height * quality.multiplier);
      job.progress = 15;

      // Rendering phase
      job.status = 'rendering';
      const isImageExport = ['png', 'jpg', 'webp', 'svg', 'pdf'].includes(job.config.format);

      if (isImageExport) {
        await this.renderImage(job, outputWidth, outputHeight);
      } else {
        await this.renderVideo(job, outputWidth, outputHeight, codecConfig);
      }

      // Encoding phase
      job.status = 'encoding';
      job.progress = 85;
      await this.encode(job, codecConfig);

      // Publishing phase
      if (job.config.publishTo && job.config.publishTo.length > 0) {
        job.status = 'publishing';
        job.progress = 90;
        await this.publishToApps(job);
      }

      job.status = 'completed';
      job.progress = 100;
      job.outputUrl = `/exports/${job.id}/output.${job.config.format}`;
      job.completedAt = new Date().toISOString();
    } catch (error: any) {
      job.status = 'failed';
      job.error = error.message || 'Render failed';
      job.completedAt = new Date().toISOString();
    }
  }

  private resolveCodec(config: ExportConfig): CodecConfig {
    const formatDefaults = FORMAT_CODECS[config.format];
    const quality = QUALITY_PRESETS[config.quality];

    return {
      video: {
        codec: config.codec || formatDefaults.video?.codec || 'h264',
        profile: formatDefaults.video?.profile || 'main',
        bitrate: config.bitrate || Math.round((formatDefaults.video?.bitrate || 8000000) * quality.bitrateFactor),
        keyframeInterval: formatDefaults.video?.keyframeInterval || 30,
      },
      audio: {
        codec: config.audioCodec || formatDefaults.audio?.codec || 'aac',
        bitrate: formatDefaults.audio?.bitrate || 256000,
        sampleRate: formatDefaults.audio?.sampleRate || 48000,
        channels: formatDefaults.audio?.channels || 2,
      },
      container: formatDefaults.container || 'mp4',
    };
  }

  private async renderImage(job: ExportJob, width: number, height: number): Promise<void> {
    // Simulate compositing layers for a single frame
    job.progress = 50;
    await this.simulateProcessing(100);
    job.progress = 70;
    await this.simulateProcessing(50);
    job.progress = 80;
  }

  private async renderVideo(job: ExportJob, width: number, height: number, codec: CodecConfig): Promise<void> {
    // Simulate frame-by-frame rendering
    const totalFrames = 100; // Simplified
    const batchSize = 10;

    for (let frame = 0; frame < totalFrames; frame += batchSize) {
      const progress = 20 + Math.round((frame / totalFrames) * 60);
      job.progress = Math.min(progress, 80);
      await this.simulateProcessing(10);
    }
  }

  private async encode(job: ExportJob, codec: CodecConfig): Promise<void> {
    await this.simulateProcessing(50);
    job.progress = 88;
  }

  private async publishToApps(job: ExportJob): Promise<void> {
    if (!job.config.publishTo) return;
    for (const target of job.config.publishTo) {
      await this.simulateProcessing(20);
      job.progress = Math.min(job.progress + 2, 99);
    }
  }

  private simulateProcessing(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Frame composition algorithm
  composeFrame(layers: Layer[], time: number, width: number, height: number): RenderFrame {
    const visibleLayers = layers
      .filter(l => l.visible && time >= l.startTime && time <= l.endTime)
      .sort((a, b) => a.position.z - b.position.z);

    const renderedLayers: RenderedLayer[] = visibleLayers.map(layer => ({
      layerId: layer.id,
      type: layer.type,
      pixelData: null,
      transform: {
        x: layer.position.x,
        y: layer.position.y,
        rotation: layer.rotation,
        scaleX: layer.scale.x,
        scaleY: layer.scale.y,
        opacity: layer.opacity,
      },
      blendMode: layer.blendMode,
    }));

    return {
      frameNumber: Math.round(time * 30),
      time,
      layers: renderedLayers,
      width,
      height,
    };
  }

  estimateRenderTime(project: Project, config: ExportConfig): number {
    const quality = QUALITY_PRESETS[config.quality];
    const pixels = config.width * config.height * quality.multiplier * quality.multiplier;
    const layerComplexity = project.layers.length * 0.5;
    const durationFactor = project.duration;
    const formatFactor = ['mov', 'avi'].includes(config.format) ? 1.5 : 1;
    return Math.round(durationFactor * layerComplexity * (pixels / 1000000) * formatFactor * 0.1);
  }
}

export const renderService = new RenderService();
