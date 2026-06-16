import { describe, it, expect, vi } from 'vitest';
import {
  Tier3VisionController,
  VisionInferenceAdapter,
  DetectedElement,
  type VisionScreenSource,
} from '../../device/tier3-vision.js';

function createMockAdapter(elements: DetectedElement[]): VisionInferenceAdapter {
  return {
    analyzeScreenshot: vi.fn().mockResolvedValue(elements),
    findElementByDescription: vi
      .fn()
      .mockImplementation(async (_data: Uint8Array, description: string) => {
        return elements.find((e) => e.description.includes(description)) ?? null;
      }),
  };
}

describe('Tier3VisionController', () => {
  const mockElements: DetectedElement[] = [
    {
      description: 'Login button',
      bounds: { x: 100, y: 200, width: 80, height: 40 },
      confidence: 0.95,
      clickable: true,
    },
    {
      description: 'Search input',
      bounds: { x: 50, y: 50, width: 200, height: 30 },
      confidence: 0.9,
      clickable: true,
    },
  ];

  it('captures and analyzes screen', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);

    const result = await controller.captureAndAnalyze();
    expect(result.success).toBe(true);
    expect(result.elements).toHaveLength(2);
    expect(result.screenshotId).toContain('screenshot-');
    expect(adapter.analyzeScreenshot).toHaveBeenCalledOnce();
  });

  it('finds element by description', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);
    await controller.captureAndAnalyze();

    const element = await controller.findElement('Login');
    expect(element).not.toBeNull();
    expect(element!.description).toBe('Login button');
  });

  it('returns null for non-existent element', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);
    await controller.captureAndAnalyze();

    const element = await controller.findElement('NonExistent');
    expect(element).toBeNull();
  });

  it('gets click coordinates for target', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);
    await controller.captureAndAnalyze();

    const coords = await controller.getClickCoords('Login');
    expect(coords).not.toBeNull();
    expect(coords!.x).toBe(140); // 100 + 80/2
    expect(coords!.y).toBe(220); // 200 + 40/2
    expect(coords!.confidence).toBe(0.95);
  });

  it('returns null coords for missing target', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);
    await controller.captureAndAnalyze();

    const coords = await controller.getClickCoords('Missing');
    expect(coords).toBeNull();
  });

  it('stores last screenshot', async () => {
    const adapter = createMockAdapter(mockElements);
    const controller = new Tier3VisionController(adapter);
    expect(controller.getLastScreenshot()).toBeNull();

    await controller.captureAndAnalyze();
    expect(controller.getLastScreenshot()).not.toBeNull();
  });

  describe('real screen source mode', () => {
    it('reports no screen source by default', () => {
      const controller = new Tier3VisionController(createMockAdapter([]), null);
      expect(controller.isScreenSourceConfigured()).toBe(false);
    });

    it('analyzes the real screenshot bytes from the configured source', async () => {
      const realShot = new Uint8Array([10, 20, 30, 40]);
      const source: VisionScreenSource = {
        captureScreen: vi.fn().mockResolvedValue(realShot),
      };
      const adapter = createMockAdapter(mockElements);
      const controller = new Tier3VisionController(adapter, source);
      expect(controller.isScreenSourceConfigured()).toBe(true);

      await controller.captureAndAnalyze();
      expect(source.captureScreen).toHaveBeenCalledOnce();
      expect(controller.getLastScreenshot()).toBe(realShot);
      expect(adapter.analyzeScreenshot).toHaveBeenCalledWith(realShot);
    });

    it('falls back to the simulated image when the source throws', async () => {
      const source: VisionScreenSource = {
        captureScreen: vi.fn().mockRejectedValue(new Error('no display')),
      };
      const adapter = createMockAdapter(mockElements);
      const controller = new Tier3VisionController(adapter, source);
      const result = await controller.captureAndAnalyze();
      expect(result.success).toBe(true);
      expect(controller.getLastScreenshot()).not.toBeNull();
    });
  });
});
