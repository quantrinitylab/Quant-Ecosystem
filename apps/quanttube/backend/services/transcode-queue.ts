import { EventEmitter } from 'events';
import { VideoProcessorService } from './video-processor.service';
import { VideoStreamService } from './video-stream.service';

interface TranscodeJob {
  id: string;
  videoId: string;
  inputPath: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  createdAt: Date;
}

export class TranscodeQueue extends EventEmitter {
  private queue: TranscodeJob[] = [];
  private processing = false;
  private processor: VideoProcessorService;
  private streamer: VideoStreamService;

  constructor() {
    super();
    this.processor = new VideoProcessorService();
    this.streamer = new VideoStreamService();
  }

  addJob(videoId: string, inputPath: string): string {
    const job: TranscodeJob = {
      id: `job-${Date.now()}`,
      videoId,
      inputPath,
      status: 'queued',
      progress: 0,
      createdAt: new Date(),
    };

    this.queue.push(job);
    this.emit('job:added', job);

    if (!this.processing) {
      this.processNext();
    }

    return job.id;
  }

  private async processNext() {
    if (this.queue.length === 0 || this.processing) return;

    this.processing = true;
    const job = this.queue[0];
    job.status = 'processing';

    this.emit('job:started', job);

    try {
      // Simulate transcoding progress
      for (let i = 0; i <= 100; i += 10) {
        job.progress = i;
        this.emit('job:progress', job);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Generate HLS
      await this.streamer.generateHLS(job.videoId, job.inputPath);

      job.status = 'completed';
      job.progress = 100;
      this.emit('job:completed', job);
    } catch (error) {
      job.status = 'failed';
      this.emit('job:failed', job, error);
    } finally {
      this.queue.shift();
      this.processing = false;
      this.processNext();
    }
  }

  getJob(jobId: string): TranscodeJob | undefined {
    return this.queue.find((j) => j.id === jobId) || this.queue.find((j) => j.id === jobId);
  }

  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      jobs: this.queue,
    };
  }
}

export const transcodeQueue = new TranscodeQueue();
