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
    expect(
      new LiteMode(makeConfig({ connectionQualityThreshold: 0.9 })).detectConnectionQuality(),
    ).toBe('good');
    expect(
      new LiteMode(makeConfig({ connectionQualityThreshold: 0.6 })).detectConnectionQuality(),
    ).toBe('moderate');
    expect(
      new LiteMode(makeConfig({ connectionQualityThreshold: 0.3 })).detectConnectionQuality(),
    ).toBe('poor');
  });
});
