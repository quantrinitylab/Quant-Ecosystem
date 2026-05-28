import type { CameraConfig, CaptureFrame } from '../types.js';

type FrameCallback = (frame: CaptureFrame) => void;
type PrivacyCallback = (active: boolean) => void;

export class CameraCapture {
  private config: Required<CameraConfig>;
  private frameCallbacks: FrameCallback[] = [];
  private privacyCallbacks: PrivacyCallback[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private running = false;

  constructor(config: CameraConfig = {}) {
    this.config = {
      fps: Math.min(config.fps ?? 1, 5),
      resolution: config.resolution ?? { width: 640, height: 480 },
      autoStart: config.autoStart ?? false,
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: this.config.resolution.width, height: this.config.resolution.height },
      });
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      await this.video.play();
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.config.resolution.width;
      this.canvas.height = this.config.resolution.height;
      this.running = true;
      this.notifyPrivacy(true);
      const intervalMs = 1000 / this.config.fps;
      this.intervalId = setInterval(() => this.captureFrame(), intervalMs);
    } catch {
      // No-op fallback when camera unavailable
      this.running = false;
    }
  }

  stop(): void {
    if (!this.running) return;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.running = false;
    this.notifyPrivacy(false);
  }

  onFrame(cb: FrameCallback): void {
    this.frameCallbacks.push(cb);
  }

  onPrivacy(cb: PrivacyCallback): void {
    this.privacyCallbacks.push(cb);
  }

  isRunning(): boolean {
    return this.running;
  }

  private captureFrame(): void {
    if (!this.canvas || !this.video) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const data = this.canvas.toDataURL('image/jpeg', 0.7);
    const frame: CaptureFrame = { data, timestamp: Date.now(), source: 'camera' };
    for (const cb of this.frameCallbacks) {
      cb(frame);
    }
  }

  private notifyPrivacy(active: boolean): void {
    for (const cb of this.privacyCallbacks) {
      cb(active);
    }
  }
}
