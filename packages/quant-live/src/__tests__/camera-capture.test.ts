import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CameraCapture } from '../capture/camera-capture.js';

function setupBrowserMocks() {
  const drawImage = vi.fn();
  const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,abc123');
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
      },
    },
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: {
      createElement: vi.fn().mockImplementation((tag: string) => {
        if (tag === 'video') return { srcObject: null, play: vi.fn().mockResolvedValue(undefined) };
        if (tag === 'canvas')
          return { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL };
        return {};
      }),
    },
    writable: true,
  });
  return { drawImage, toDataURL };
}

describe('CameraCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupBrowserMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops lifecycle', async () => {
    const camera = new CameraCapture({ fps: 1 });
    await camera.start();
    expect(camera.isRunning()).toBe(true);
    camera.stop();
    expect(camera.isRunning()).toBe(false);
  });

  it('invokes frame callbacks at configured FPS', async () => {
    const camera = new CameraCapture({ fps: 2 });
    const frameCb = vi.fn();
    camera.onFrame(frameCb);
    await camera.start();
    vi.advanceTimersByTime(500);
    expect(frameCb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(frameCb).toHaveBeenCalledTimes(2);
    camera.stop();
  });

  it('limits FPS to maximum of 5', async () => {
    const camera = new CameraCapture({ fps: 10 });
    const frameCb = vi.fn();
    camera.onFrame(frameCb);
    await camera.start();
    vi.advanceTimersByTime(200); // 5fps = 200ms interval
    expect(frameCb).toHaveBeenCalledTimes(1);
    camera.stop();
  });

  it('invokes privacy callback on start and stop', async () => {
    const camera = new CameraCapture();
    const privacyCb = vi.fn();
    camera.onPrivacy(privacyCb);
    await camera.start();
    expect(privacyCb).toHaveBeenCalledWith(true);
    camera.stop();
    expect(privacyCb).toHaveBeenCalledWith(false);
  });

  it('invokes error callback on getUserMedia failure', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NotAllowed'),
    );
    const camera = new CameraCapture();
    const errorCb = vi.fn();
    camera.onError(errorCb);
    await camera.start();
    expect(camera.isRunning()).toBe(false);
    expect(errorCb).toHaveBeenCalledTimes(1);
    expect(errorCb).toHaveBeenCalledWith(expect.any(Error));
    expect((errorCb.mock.calls[0] as [Error])[0].message).toBe('NotAllowed');
  });

  it('returns unsubscribe function from onFrame', async () => {
    const camera = new CameraCapture({ fps: 1 });
    const frameCb = vi.fn();
    const unsub = camera.onFrame(frameCb);
    await camera.start();
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(1);
    unsub();
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(1);
    camera.stop();
  });

  it('returns unsubscribe function from onPrivacy', async () => {
    const camera = new CameraCapture();
    const privacyCb = vi.fn();
    const unsub = camera.onPrivacy(privacyCb);
    unsub();
    await camera.start();
    expect(privacyCb).not.toHaveBeenCalled();
    camera.stop();
  });

  it('returns unsubscribe function from onError', async () => {
    (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NotAllowed'),
    );
    const camera = new CameraCapture();
    const errorCb = vi.fn();
    const unsub = camera.onError(errorCb);
    unsub();
    await camera.start();
    expect(errorCb).not.toHaveBeenCalled();
  });
});
