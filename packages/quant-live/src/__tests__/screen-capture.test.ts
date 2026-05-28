import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScreenCapture } from '../capture/screen-capture.js';

function setupBrowserMocks() {
  const drawImage = vi.fn();
  const toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,screen123');
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getDisplayMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
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

describe('ScreenCapture', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupBrowserMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops lifecycle', async () => {
    const screen = new ScreenCapture({ fps: 1 });
    await screen.start();
    expect(screen.isRunning()).toBe(true);
    screen.stop();
    expect(screen.isRunning()).toBe(false);
  });

  it('invokes frame callbacks at configured FPS', async () => {
    const screen = new ScreenCapture({ fps: 1 });
    const frameCb = vi.fn();
    screen.onFrame(frameCb);
    await screen.start();
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(2);
    screen.stop();
  });

  it('limits FPS to maximum of 5', async () => {
    const screen = new ScreenCapture({ fps: 30 });
    const frameCb = vi.fn();
    screen.onFrame(frameCb);
    await screen.start();
    vi.advanceTimersByTime(200); // 5fps = 200ms interval
    expect(frameCb).toHaveBeenCalledTimes(1);
    screen.stop();
  });

  it('invokes privacy callback on start and stop', async () => {
    const screen = new ScreenCapture();
    const privacyCb = vi.fn();
    screen.onPrivacy(privacyCb);
    await screen.start();
    expect(privacyCb).toHaveBeenCalledWith(true);
    screen.stop();
    expect(privacyCb).toHaveBeenCalledWith(false);
  });

  it('invokes error callback on getDisplayMedia failure', async () => {
    (navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NotAllowed'),
    );
    const screen = new ScreenCapture();
    const errorCb = vi.fn();
    screen.onError(errorCb);
    await screen.start();
    expect(screen.isRunning()).toBe(false);
    expect(errorCb).toHaveBeenCalledTimes(1);
    expect(errorCb).toHaveBeenCalledWith(expect.any(Error));
    expect((errorCb.mock.calls[0] as [Error])[0].message).toBe('NotAllowed');
  });

  it('returns unsubscribe function from onFrame', async () => {
    const screen = new ScreenCapture({ fps: 1 });
    const frameCb = vi.fn();
    const unsub = screen.onFrame(frameCb);
    await screen.start();
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(1);
    unsub();
    vi.advanceTimersByTime(1000);
    expect(frameCb).toHaveBeenCalledTimes(1);
    screen.stop();
  });

  it('returns unsubscribe function from onPrivacy', async () => {
    const screen = new ScreenCapture();
    const privacyCb = vi.fn();
    const unsub = screen.onPrivacy(privacyCb);
    unsub();
    await screen.start();
    expect(privacyCb).not.toHaveBeenCalled();
    screen.stop();
  });

  it('returns unsubscribe function from onError', async () => {
    (navigator.mediaDevices.getDisplayMedia as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('NotAllowed'),
    );
    const screen = new ScreenCapture();
    const errorCb = vi.fn();
    const unsub = screen.onError(errorCb);
    unsub();
    await screen.start();
    expect(errorCb).not.toHaveBeenCalled();
  });
});
