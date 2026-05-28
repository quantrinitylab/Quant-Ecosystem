import type { CameraConfig, CaptureFrame } from '../types.js';

type FrameCallback = (frame: CaptureFrame) => void;
type PrivacyCallback = (active: boolean) => void;
type ErrorCallback = (error: Error) => void;
type Unsubscribe = () => void;

export class CameraCapture {
  private config: Required<CameraConfig>;
  private frameCallbacks: FrameCallback[] = [];
  private privacyCallbacks: PrivacyCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private running = false;

  constructor(config: CameraConfig = {}) {
    this.config = {
      fps: Math.min(config.fps ?? 1, 5),
      resolution: config.resolution ?? { width: 640, height: 480 },
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
    } catch (err: unknown) {
      this.running = false;
      const error = err instanceof Error ? err : new Error(String(err));
      for (const cb of this.errorCallbacks) {
        cb(error);
      }
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

  onFrame(cb: FrameCallback): Unsubscribe {
    this.frameCallbacks.push(cb);
    return () => {
      const idx = this.frameCallbacks.indexOf(cb);
      if (idx >= 0) this.frameCallbacks.splice(idx, 1);
    };
  }

  onPrivacy(cb: PrivacyCallback): Unsubscribe {
    this.privacyCallbacks.push(cb);
    return () => {
      const idx = this.privacyCallbacks.indexOf(cb);
      if (idx >= 0) this.privacyCallbacks.splice(idx, 1);
    };
  }

  onError(cb: ErrorCallback): Unsubscribe {
    this.errorCallbacks.push(cb);
    return () => {
      const idx = this.errorCallbacks.indexOf(cb);
      if (idx >= 0) this.errorCallbacks.splice(idx, 1);
    };
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
