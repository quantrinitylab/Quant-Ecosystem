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

export class ScreenCapture {
  private frameBuffer: CaptureFrame[] = [];
  private readonly maxBufferSize: number;
  private frameCounter: number = 0;

  constructor(maxBufferSize: number = 10) {
    this.maxBufferSize = maxBufferSize;
  }

  async capture(width: number = 1920, height: number = 1080): Promise<CaptureFrame> {
    // Simulated capture - actual implementation uses platform-specific APIs
    const frame: CaptureFrame = {
      id: `frame-${++this.frameCounter}`,
      data: new Uint8Array(width * height * 4), // RGBA buffer (uninitialized)
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
