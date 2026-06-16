export interface ScreenBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptureFrame {
  id: string;
  data: Uint8Array;
  timestamp: number;
  width: number;
  height: number;
}

export interface ScreenDiff {
  changed: boolean;
  changedRegions: ScreenBounds[];
  changePercentage: number;
  previousFrameId: string;
  currentFrameId: string;
}

/**
 * Real screen-capture backend. Implementations return raw RGBA pixel data for
 * the requested dimensions (e.g. via a platform-native capture service or a
 * configured capture daemon). Throwing falls back to the simulated empty frame.
 */
export interface ScreenCaptureBackend {
  capture(width: number, height: number): Promise<Uint8Array>;
}

/**
 * Real screen-capture backend backed by a configured HTTP capture service.
 * Enabled by SCREEN_CAPTURE_URL (optionally SCREEN_CAPTURE_API_KEY). The service
 * is expected to return raw RGBA bytes for the requested dimensions.
 */
export class HttpScreenCaptureBackend implements ScreenCaptureBackend {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async capture(width: number, height: number): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/capture`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ width, height }),
    });
    if (!res.ok) {
      throw new Error(`screen-capture service responded ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }
}

export class ScreenCapture {
  private frameBuffer: CaptureFrame[] = [];
  private readonly maxBufferSize: number;
  private frameCounter: number = 0;
  private readonly backend: ScreenCaptureBackend | null;

  constructor(maxBufferSize: number = 10, backend?: ScreenCaptureBackend | null) {
    this.maxBufferSize = maxBufferSize;
    this.backend = backend ?? ScreenCapture.createBackendFromEnv();
  }

  private static createBackendFromEnv(): ScreenCaptureBackend | null {
    const url = process.env['SCREEN_CAPTURE_URL'];
    if (url) {
      return new HttpScreenCaptureBackend(url, process.env['SCREEN_CAPTURE_API_KEY']);
    }
    return null;
  }

  /** Whether a real screen-capture backend is wired up. */
  isBackendConfigured(): boolean {
    return this.backend !== null;
  }

  async capture(width: number = 1920, height: number = 1080): Promise<CaptureFrame> {
    const data = await this.captureData(width, height);
    const frame: CaptureFrame = {
      id: `frame-${++this.frameCounter}`,
      data,
      timestamp: Date.now(),
      width,
      height,
    };

    this.frameBuffer.push(frame);
    if (this.frameBuffer.length > this.maxBufferSize) {
      this.frameBuffer.shift();
    }

    return frame;
  }

  /** Acquire raw pixel data from the real backend when configured; simulated buffer otherwise. */
  private async captureData(width: number, height: number): Promise<Uint8Array> {
    if (this.backend) {
      try {
        return await this.backend.capture(width, height);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(`[screen-capture] backend capture failed, using simulated frame: ${message}`);
      }
    }
    // Simulated capture - RGBA buffer (uninitialized) used when no backend configured.
    return new Uint8Array(width * height * 4);
  }

  getDiff(previous: CaptureFrame, current: CaptureFrame): ScreenDiff {
    let changedPixels = 0;
    const totalPixels = Math.min(previous.data.length, current.data.length) / 4;
    const changedRegions: ScreenBounds[] = [];

    // Compare pixel data byte by byte (RGBA)
    const pixelCount = Math.min(previous.data.length, current.data.length);
    for (let i = 0; i < pixelCount; i += 4) {
      if (
        previous.data[i] !== current.data[i] ||
        previous.data[i + 1] !== current.data[i + 1] ||
        previous.data[i + 2] !== current.data[i + 2] ||
        previous.data[i + 3] !== current.data[i + 3]
      ) {
        changedPixels++;
      }
    }

    const changePercentage = totalPixels > 0 ? (changedPixels / totalPixels) * 100 : 0;

    if (changedPixels > 0) {
      // Simplified: report single bounding region
      changedRegions.push({
        x: 0,
        y: 0,
        width: current.width,
        height: current.height,
      });
    }

    return {
      changed: changedPixels > 0,
      changedRegions,
      changePercentage,
      previousFrameId: previous.id,
      currentFrameId: current.id,
    };
  }

  getRegion(frame: CaptureFrame, bounds: ScreenBounds): Uint8Array {
    // Extract region from frame data
    const regionWidth = Math.min(bounds.width, frame.width - bounds.x);
    const regionHeight = Math.min(bounds.height, frame.height - bounds.y);
    const regionData = new Uint8Array(regionWidth * regionHeight * 4);

    for (let row = 0; row < regionHeight; row++) {
      const srcOffset = ((bounds.y + row) * frame.width + bounds.x) * 4;
      const destOffset = row * regionWidth * 4;
      regionData.set(frame.data.slice(srcOffset, srcOffset + regionWidth * 4), destOffset);
    }

    return regionData;
  }

  getFrameBuffer(): ReadonlyArray<CaptureFrame> {
    return [...this.frameBuffer];
  }

  getLastFrame(): CaptureFrame | null {
    return this.frameBuffer.length > 0 ? this.frameBuffer[this.frameBuffer.length - 1]! : null;
  }

  clearBuffer(): void {
    this.frameBuffer = [];
  }
}
