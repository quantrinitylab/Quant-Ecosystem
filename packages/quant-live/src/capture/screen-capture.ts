import type { CaptureFrame, ScreenCaptureConfig } from '../types.js';

type FrameCallback = (frame: CaptureFrame) => void;
type PrivacyCallback = (active: boolean) => void;

export class ScreenCapture {
  private config: Required<ScreenCaptureConfig>;
  private frameCallbacks: FrameCallback[] = [];
  private privacyCallbacks: PrivacyCallback[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private running = false;

  constructor(config: ScreenCaptureConfig = {}) {
    this.config = {
      fps: config.fps ?? 0.5,
      captureType: config.captureType ?? 'screen',
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
      });
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      await this.video.play();
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1280;
      this.canvas.height = 720;
      this.running = true;
      this.notifyPrivacy(true);
      const intervalMs = 1000 / this.config.fps;
      this.intervalId = setInterval(() => this.captureFrame(), intervalMs);
    } catch {
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
    const frame: CaptureFrame = { data, timestamp: Date.now(), source: 'screen' };
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
