// ============================================================================
// QuantEdits - Render Controller
// Handles render job management, status, cancellation, downloads
// ============================================================================

interface RenderRequest {
  projectId: string;
  format: 'mp4' | 'mov' | 'gif' | 'png' | 'jpg' | 'pdf' | 'svg';
  quality: number;
  resolution: { width: number; height: number };
  fps: number;
  startTime?: number;
  endTime?: number;
  includeAudio: boolean;
  watermark?: string;
}

interface RenderJob {
  id: string;
  projectId: string;
  userId: string;
  format: string;
  quality: number;
  resolution: { width: number; height: number };
  fps: number;
  status: 'queued' | 'preparing' | 'rendering' | 'encoding' | 'complete' | 'failed' | 'cancelled';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  startedAt: number;
  completedAt: number | null;
  outputUrl: string | null;
  outputSize: number;
  error: string | null;
  priority: number;
}

interface RenderPreset {
  id: string;
  name: string;
  platform: string;
  format: string;
  resolution: { width: number; height: number };
  quality: number;
  fps: number;
}

class RenderController {
  private jobs: Map<string, RenderJob> = new Map();
  private userQueues: Map<string, string[]> = new Map();
  private maxConcurrent = 3;
  private activeCount = 0;

  async startRender(req: { body: RenderRequest; userId: string }): Promise<{ status: number; body: { jobId: string; estimatedTime: number } }> {
    const { body, userId } = req;
    if (!body.projectId) return { status: 400, body: { jobId: '', estimatedTime: 0 } };
    if (body.quality < 1 || body.quality > 100) return { status: 400, body: { jobId: '', estimatedTime: 0 } };
    if (body.resolution.width < 1 || body.resolution.height < 1) return { status: 400, body: { jobId: '', estimatedTime: 0 } };
    const userJobs = this.userQueues.get(userId) || [];
    if (userJobs.filter(jId => { const j = this.jobs.get(jId); return j && ['queued', 'preparing', 'rendering', 'encoding'].includes(j.status); }).length >= 5) {
      return { status: 429, body: { jobId: '', estimatedTime: 0 } };
    }
    const job: RenderJob = {
      id: `render-${Date.now()}-${Math.random().toString(36).slice(2)}`, projectId: body.projectId, userId, format: body.format, quality: body.quality,
      resolution: body.resolution, fps: body.fps || 30, status: 'queued', progress: 0, currentFrame: 0,
      totalFrames: body.fps * 60, startedAt: Date.now(), completedAt: null, outputUrl: null, outputSize: 0, error: null, priority: 1,
    };
    this.jobs.set(job.id, job);
    userJobs.push(job.id);
    this.userQueues.set(userId, userJobs);
    this.processQueue();
    const estimatedTime = Math.ceil((job.totalFrames / job.fps) * (body.resolution.width * body.resolution.height) / (1920 * 1080) * 0.5);
    return { status: 202, body: { jobId: job.id, estimatedTime } };
  }

  async getStatus(req: { params: { jobId: string }; userId: string }): Promise<{ status: number; body: RenderJob | { error: string } }> {
    const job = this.jobs.get(req.params.jobId);
    if (!job) return { status: 404, body: { error: 'Job not found' } };
    if (job.userId !== req.userId) return { status: 403, body: { error: 'Access denied' } };
    return { status: 200, body: job };
  }

  async cancelRender(req: { params: { jobId: string }; userId: string }): Promise<{ status: number; body: { success: boolean } }> {
    const job = this.jobs.get(req.params.jobId);
    if (!job) return { status: 404, body: { success: false } };
    if (job.userId !== req.userId) return { status: 403, body: { success: false } };
    if (job.status === 'complete' || job.status === 'failed') return { status: 400, body: { success: false } };
    job.status = 'cancelled';
    if (['rendering', 'encoding', 'preparing'].includes(job.status)) this.activeCount--;
    return { status: 200, body: { success: true } };
  }

  async getQueue(req: { userId: string }): Promise<{ status: number; body: { jobs: RenderJob[]; activeCount: number } }> {
    const userJobIds = this.userQueues.get(req.userId) || [];
    const jobs = userJobIds.map(id => this.jobs.get(id)).filter(Boolean) as RenderJob[];
    return { status: 200, body: { jobs: jobs.sort((a, b) => b.startedAt - a.startedAt), activeCount: this.activeCount } };
  }

  async batchRender(req: { body: { projects: RenderRequest[] }; userId: string }): Promise<{ status: number; body: { jobIds: string[] } }> {
    const jobIds: string[] = [];
    for (const project of req.body.projects.slice(0, 10)) {
      const result = await this.startRender({ body: project, userId: req.userId });
      if (result.status === 202) jobIds.push(result.body.jobId);
    }
    return { status: 202, body: { jobIds } };
  }

  async getPresets(): Promise<{ status: number; body: { presets: RenderPreset[] } }> {
    const presets: RenderPreset[] = [
      { id: 'qneon-reel', name: 'QuantNeon Reel', platform: 'QuantNeon', format: 'mp4', resolution: { width: 1080, height: 1920 }, quality: 85, fps: 30 },
      { id: 'qtube-hd', name: 'QuantTube HD', platform: 'QuantTube', format: 'mp4', resolution: { width: 1920, height: 1080 }, quality: 90, fps: 30 },
      { id: 'qtube-4k', name: 'QuantTube 4K', platform: 'QuantTube', format: 'mp4', resolution: { width: 3840, height: 2160 }, quality: 95, fps: 30 },
      { id: 'social-square', name: 'Social Square', platform: 'Social', format: 'mp4', resolution: { width: 1080, height: 1080 }, quality: 85, fps: 30 },
      { id: 'web-gif', name: 'Web GIF', platform: 'Web', format: 'gif', resolution: { width: 480, height: 480 }, quality: 70, fps: 15 },
    ];
    return { status: 200, body: { presets } };
  }

  async generatePreview(req: { body: { projectId: string; time: number; resolution: { width: number; height: number } }; userId: string }): Promise<{ status: number; body: { previewUrl: string } }> {
    const previewUrl = `/previews/${req.body.projectId}-${req.body.time}.jpg`;
    return { status: 200, body: { previewUrl } };
  }

  async downloadOutput(req: { params: { jobId: string }; userId: string }): Promise<{ status: number; body: { url: string } | { error: string } }> {
    const job = this.jobs.get(req.params.jobId);
    if (!job) return { status: 404, body: { error: 'Job not found' } };
    if (job.userId !== req.userId) return { status: 403, body: { error: 'Access denied' } };
    if (job.status !== 'complete' || !job.outputUrl) return { status: 400, body: { error: 'Output not ready' } };
    return { status: 200, body: { url: job.outputUrl } };
  }

  async generateThumbnail(req: { body: { projectId: string; time: number }; userId: string }): Promise<{ status: number; body: { thumbnailUrl: string } }> {
    return { status: 200, body: { thumbnailUrl: `/thumbnails/${req.body.projectId}.jpg` } };
  }

  async deleteJob(req: { params: { jobId: string }; userId: string }): Promise<{ status: number; body: { success: boolean } }> {
    const job = this.jobs.get(req.params.jobId);
    if (!job || job.userId !== req.userId) return { status: 404, body: { success: false } };
    this.jobs.delete(req.params.jobId);
    const userJobs = this.userQueues.get(req.userId) || [];
    this.userQueues.set(req.userId, userJobs.filter(id => id !== req.params.jobId));
    return { status: 200, body: { success: true } };
  }

  private processQueue(): void {
    if (this.activeCount >= this.maxConcurrent) return;
    const queuedJobs: RenderJob[] = [];
    this.jobs.forEach(job => { if (job.status === 'queued') queuedJobs.push(job); });
    queuedJobs.sort((a, b) => b.priority - a.priority || a.startedAt - b.startedAt);
    const toProcess = queuedJobs.slice(0, this.maxConcurrent - this.activeCount);
    toProcess.forEach(job => {
      this.activeCount++;
      job.status = 'rendering';
      this.simulateRender(job);
    });
  }

  private simulateRender(job: RenderJob): void {
    let frame = 0;
    const interval = setInterval(() => {
      frame += Math.floor(Math.random() * 30) + 10;
      if (frame >= job.totalFrames) {
        clearInterval(interval);
        job.status = 'complete';
        job.progress = 100;
        job.currentFrame = job.totalFrames;
        job.completedAt = Date.now();
        job.outputUrl = `/exports/${job.id}.${job.format}`;
        job.outputSize = job.resolution.width * job.resolution.height * job.quality * 0.01;
        this.activeCount--;
        this.processQueue();
      } else {
        job.currentFrame = frame;
        job.progress = Math.round((frame / job.totalFrames) * 100);
        if (job.progress > 85) job.status = 'encoding';
      }
    }, 200);
  }
}

export const renderController = new RenderController();
export default RenderController;
