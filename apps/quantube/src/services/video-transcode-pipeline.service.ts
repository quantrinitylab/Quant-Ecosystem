export type ResolutionTier = '1080p' | '720p' | '480p' | '360p';

export interface WatermarkConfig {
  imageUrl: string;
  position: 'top_left' | 'top_right' | 'bottom_left' | 'bottom_right';
  opacity: number; // 0.1 to 1.0
  scalePercentage?: number; // e.g. 15 for 15% width
}

export interface TranscodeJobParams {
  videoId: string;
  sourceUrl: string;
  inputHeight: number; // e.g. 1080, 720, 480
  inputWidth: number;
  watermark?: WatermarkConfig;
}

export interface TranscodeVariantOutput {
  tier: ResolutionTier;
  width: number;
  height: number;
  bandwidth: number; // bps e.g. 5000000 for 1080p
  playlistUrl: string;
}

export interface TranscodeJob {
  id: string;
  videoId: string;
  sourceUrl: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progressPercentage: number;
  availableTiers: ResolutionTier[];
  variants: TranscodeVariantOutput[];
  masterPlaylistUrl?: string;
  masterPlaylistContent?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

const TIER_SPECS: Record<ResolutionTier, { height: number; width: number; bandwidth: number }> = {
  '1080p': { height: 1080, width: 1920, bandwidth: 5000000 },
  '720p': { height: 720, width: 1280, bandwidth: 2800000 },
  '480p': { height: 480, width: 854, bandwidth: 1400000 },
  '360p': { height: 360, width: 640, bandwidth: 800000 },
};

const TIERS: ResolutionTier[] = ['1080p', '720p', '480p', '360p'];

export class VideoTranscodePipelineService {
  private jobs = new Map<string, TranscodeJob>();

  public resolveAvailableTiers(inputHeight: number): ResolutionTier[] {
    const available = TIERS.filter((tier) => TIER_SPECS[tier].height <= inputHeight);
    if (available.length === 0 || !available.includes('360p')) {
      if (!available.includes('360p')) {
        available.push('360p');
      }
    }
    // ensure unique and sort descending by height
    const uniqueTiers = Array.from(new Set(available));
    return uniqueTiers.sort((a, b) => TIER_SPECS[b].height - TIER_SPECS[a].height);
  }

  public createTranscodeJob(params: TranscodeJobParams): TranscodeJob {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const availableTiers = this.resolveAvailableTiers(params.inputHeight);

    let watermark = params.watermark;
    if (watermark) {
      const clampedOpacity = Math.max(0.1, Math.min(1.0, watermark.opacity));
      watermark = { ...watermark, opacity: clampedOpacity };
    }

    const job: TranscodeJob = {
      id: jobId,
      videoId: params.videoId,
      sourceUrl: params.sourceUrl,
      status: 'QUEUED',
      progressPercentage: 0,
      availableTiers,
      variants: [],
      createdAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);
    return job;
  }

  public async processTranscodeJob(jobId: string): Promise<TranscodeJob> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    job.status = 'PROCESSING';
    job.progressPercentage = 50;
    this.jobs.set(jobId, job);

    // Simulate multi-pass encoding
    await new Promise((resolve) => setTimeout(resolve, 50));

    const variants: TranscodeVariantOutput[] = job.availableTiers.map((tier) => {
      const spec = TIER_SPECS[tier];
      return {
        tier,
        width: spec.width,
        height: spec.height,
        bandwidth: spec.bandwidth,
        playlistUrl: `https://cdn.quantube.in/video/${job.videoId}/hls/${tier}/index.m3u8`,
      };
    });

    job.variants = variants;
    job.masterPlaylistContent = this.generateHlsMasterPlaylist(variants);
    job.masterPlaylistUrl = `https://cdn.quantube.in/video/${job.videoId}/hls/master.m3u8`;
    job.status = 'COMPLETED';
    job.progressPercentage = 100;
    job.completedAt = new Date().toISOString();

    this.jobs.set(jobId, job);
    return job;
  }

  public generateHlsMasterPlaylist(variants: TranscodeVariantOutput[]): string {
    let playlist = '#EXTM3U\n#EXT-X-VERSION:3\n';

    // Sort variants by bandwidth descending
    const sortedVariants = [...variants].sort((a, b) => b.bandwidth - a.bandwidth);

    for (const variant of sortedVariants) {
      playlist += `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height},CODECS="avc1.4d401f,mp4a.40.2"\n`;
      playlist += `${variant.playlistUrl}\n`;
    }

    return playlist.trim();
  }

  public getTranscodeJob(jobId: string): TranscodeJob | null {
    return this.jobs.get(jobId) || null;
  }

  public clearTranscodeForTesting(): void {
    this.jobs.clear();
  }
}
