import { LiteMode } from '../lite/lite-mode.js';
import { LiteConfig } from '../types.js';

function makeConfig(overrides: Partial<LiteConfig> = {}): LiteConfig {
  return {
    maxAssetSizeKb: 100,
    compressionEnabled: true,
    offlineFirst: true,
    queueBasedSend: true,
    connectionQualityThreshold: 0.5,
    ...overrides,
  };
}

describe('LiteMode', () => {
  it('should compress when asset exceeds maxAssetSizeKb', () => {
    const lite = new LiteMode(makeConfig());
    expect(lite.shouldCompress(200)).toBe(true);
  });

  it('should not compress when asset is under threshold', () => {
    const lite = new LiteMode(makeConfig());
    expect(lite.shouldCompress(50)).toBe(false);
  });

  it('should not compress when compression is disabled', () => {
    const lite = new LiteMode(makeConfig({ compressionEnabled: false }));
    expect(lite.shouldCompress(200)).toBe(false);
  });

  it('should allow sending when connection quality meets threshold', () => {
    const lite = new LiteMode(makeConfig({ connectionQualityThreshold: 0.5 }));
    expect(lite.canSend(0.7)).toBe(true);
  });

  it('should block sending when connection quality is below threshold', () => {
    const lite = new LiteMode(makeConfig({ connectionQualityThreshold: 0.5 }));
    expect(lite.canSend(0.3)).toBe(false);
  });

  it('should enqueue and flush messages', () => {
    const lite = new LiteMode(makeConfig());
    lite.enqueue({ type: 'msg', text: 'hello' });
    lite.enqueue({ type: 'msg', text: 'world' });
    const flushed = lite.flush();
    expect(flushed).toHaveLength(2);
    expect(lite.flush()).toHaveLength(0);
  });

  it('should return config copy', () => {
    const config = makeConfig();
    const lite = new LiteMode(config);
    const returned = lite.getConfig();
    expect(returned).toEqual(config);
    expect(returned).not.toBe(config);
  });

  it('should detect connection quality level', () => {
    expect(new LiteMode(makeConfig({ connectionQualityThreshold: 0.9 })).getQualityTier()).toBe(
      'good',
    );
    expect(new LiteMode(makeConfig({ connectionQualityThreshold: 0.6 })).getQualityTier()).toBe(
      'moderate',
    );
    expect(new LiteMode(makeConfig({ connectionQualityThreshold: 0.3 })).getQualityTier()).toBe(
      'poor',
    );
  });

  it('should evict oldest message when queue reaches maxQueueSize', () => {
    const lite = new LiteMode(makeConfig({ maxQueueSize: 3 }));
    lite.enqueue({ id: 1 });
    lite.enqueue({ id: 2 });
    lite.enqueue({ id: 3 });
    lite.enqueue({ id: 4 });
    const flushed = lite.flush();
    expect(flushed).toHaveLength(3);
    expect(flushed[0]).toEqual({ id: 2 });
    expect(flushed[2]).toEqual({ id: 4 });
  });

  it('should default maxQueueSize to 100', () => {
    const lite = new LiteMode(makeConfig());
    for (let i = 0; i < 110; i++) {
      lite.enqueue({ i });
    }
    const flushed = lite.flush();
    expect(flushed).toHaveLength(100);
    expect(flushed[0]).toEqual({ i: 10 });
    expect(flushed[99]).toEqual({ i: 109 });
  });
});
