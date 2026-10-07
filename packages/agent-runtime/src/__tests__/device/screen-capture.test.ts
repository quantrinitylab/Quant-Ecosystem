import { describe, it, expect } from 'vitest';
import { ScreenCapture, type ScreenCaptureBackend } from '../../device/screen-capture.js';

describe('ScreenCapture', () => {
  it('captures a frame', async () => {
    const capture = new ScreenCapture();
    const frame = await capture.capture(100, 100);
    expect(frame.id).toContain('frame-');
    expect(frame.width).toBe(100);
    expect(frame.height).toBe(100);
    expect(frame.data.length).toBe(100 * 100 * 4);
  });

  it('stores frames in buffer', async () => {
    const capture = new ScreenCapture(3);
    await capture.capture(10, 10);
    await capture.capture(10, 10);
    await capture.capture(10, 10);
    expect(capture.getFrameBuffer()).toHaveLength(3);

    await capture.capture(10, 10);
    expect(capture.getFrameBuffer()).toHaveLength(3);
  });

  it('gets last frame', async () => {
    const capture = new ScreenCapture();
    expect(capture.getLastFrame()).toBeNull();

    await capture.capture(10, 10);
    const last = capture.getLastFrame();
    expect(last).not.toBeNull();
    expect(last!.id).toContain('frame-');
  });

  it('computes diff between identical frames', async () => {
    const capture = new ScreenCapture();
    const frame1 = await capture.capture(10, 10);
    const frame2 = await capture.capture(10, 10);

    const diff = capture.getDiff(frame1, frame2);
    expect(diff.changed).toBe(false);
    expect(diff.changePercentage).toBe(0);
    expect(diff.changedRegions).toHaveLength(0);
  });

  it('computes diff between different frames', async () => {
    const capture = new ScreenCapture();
    const frame1 = await capture.capture(10, 10);
    const frame2 = await capture.capture(10, 10);
    // Modify frame2 data
    frame2.data[0] = 255;

    const diff = capture.getDiff(frame1, frame2);
    expect(diff.changed).toBe(true);
    expect(diff.changePercentage).toBeGreaterThan(0);
    expect(diff.changedRegions.length).toBeGreaterThan(0);
  });

  it('extracts region from frame', async () => {
    const capture = new ScreenCapture();
    const frame = await capture.capture(100, 100);
    const region = capture.getRegion(frame, { x: 10, y: 10, width: 20, height: 20 });
    expect(region.length).toBe(20 * 20 * 4);
  });

  it('clears buffer', async () => {
    const capture = new ScreenCapture();
    await capture.capture(10, 10);
    await capture.capture(10, 10);
    capture.clearBuffer();
    expect(capture.getFrameBuffer()).toHaveLength(0);
  });

  describe('real backend mode', () => {
    it('reports no backend by default', () => {
      expect(new ScreenCapture(10, null).isBackendConfigured()).toBe(false);
    });

    it('uses the injected backend pixel data', async () => {
      const real = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const backend: ScreenCaptureBackend = {
        async capture() {
          return real;
        },
      };
      const capture = new ScreenCapture(10, backend);
      expect(capture.isBackendConfigured()).toBe(true);
      const frame = await capture.capture(2, 1);
      expect(frame.data).toBe(real);
    });

    it('falls back to a simulated frame when the backend throws', async () => {
      const backend: ScreenCaptureBackend = {
        async capture() {
          throw new Error('display unavailable');
        },
      };
      const capture = new ScreenCapture(10, backend);
      const frame = await capture.capture(4, 4);
      expect(frame.data.length).toBe(4 * 4 * 4);
    });
  });
});
