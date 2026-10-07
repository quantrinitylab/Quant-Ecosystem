export interface VisionAnalysisResult {
  success: boolean;
  elements: DetectedElement[];
  timestamp: number;
  screenshotId: string;
}

export interface DetectedElement {
  description: string;
  bounds: { x: number; y: number; width: number; height: number };
  confidence: number;
  clickable: boolean;
}

export interface ClickCoords {
  x: number;
  y: number;
  confidence: number;
  elementDescription: string;
}

export interface VisionInferenceAdapter {
  analyzeScreenshot(imageData: Uint8Array): Promise<DetectedElement[]>;
  findElementByDescription(
    imageData: Uint8Array,
    description: string,
  ): Promise<DetectedElement | null>;
}

/**
 * Real screen source providing actual screenshot bytes for vision analysis.
 * When configured (injected, or auto-created from SCREEN_CAPTURE_URL), real
 * screenshots are analyzed; otherwise a simulated placeholder image is used.
 */
export interface VisionScreenSource {
  captureScreen(): Promise<Uint8Array>;
}

/** Real screen source backed by a configured HTTP capture service (SCREEN_CAPTURE_URL). */
export class HttpVisionScreenSource implements VisionScreenSource {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async captureScreen(): Promise<Uint8Array> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/capture`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({ format: 'png' }),
    });
    if (!res.ok) {
      throw new Error(`screen-capture service responded ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

export class Tier3VisionController {
  private readonly inferenceAdapter: VisionInferenceAdapter;
  private readonly screenSource: VisionScreenSource | null;
  private lastScreenshot: Uint8Array | null = null;

  constructor(inferenceAdapter: VisionInferenceAdapter, screenSource?: VisionScreenSource | null) {
    this.inferenceAdapter = inferenceAdapter;
    this.screenSource = screenSource ?? Tier3VisionController.createScreenSourceFromEnv();
  }

  private static createScreenSourceFromEnv(): VisionScreenSource | null {
    const url = process.env['SCREEN_CAPTURE_URL'];
    if (url) {
      return new HttpVisionScreenSource(url, process.env['SCREEN_CAPTURE_API_KEY']);
    }
    return null;
  }

  /** Whether a real screen source is wired up. */
  isScreenSourceConfigured(): boolean {
    return this.screenSource !== null;
  }

  async captureAndAnalyze(): Promise<VisionAnalysisResult> {
    const screenshot = await this.captureScreen();
    this.lastScreenshot = screenshot;

    const elements = await this.inferenceAdapter.analyzeScreenshot(screenshot);

    return {
      success: true,
      elements,
      timestamp: Date.now(),
      screenshotId: `screenshot-${Date.now()}`,
    };
  }

  async findElement(description: string): Promise<DetectedElement | null> {
    const screenshot = this.lastScreenshot ?? (await this.captureScreen());
    this.lastScreenshot = screenshot;

    return this.inferenceAdapter.findElementByDescription(screenshot, description);
  }

  async getClickCoords(target: string): Promise<ClickCoords | null> {
    const element = await this.findElement(target);
    if (!element) {
      return null;
    }

    return {
      x: element.bounds.x + element.bounds.width / 2,
      y: element.bounds.y + element.bounds.height / 2,
      confidence: element.confidence,
      elementDescription: element.description,
    };
  }

  private async captureScreen(): Promise<Uint8Array> {
    if (this.screenSource) {
      try {
        return await this.screenSource.captureScreen();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.warn(
          `[tier3-vision] screen source capture failed, using simulated image: ${message}`,
        );
      }
    }
    // Simulated screen capture (PNG magic bytes) used when no real source configured.
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  }

  getLastScreenshot(): Uint8Array | null {
    return this.lastScreenshot;
  }
}
