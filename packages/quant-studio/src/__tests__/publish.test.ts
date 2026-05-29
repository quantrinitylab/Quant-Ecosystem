import { describe, it, expect } from 'vitest';
import { Publisher } from '../publish/publisher.js';
import { RemixManager } from '../publish/remix.js';
import { Permission } from '../types.js';
import type { QAppBundle, QAppManifest } from '../types.js';

describe('Publisher', () => {
  function createBundle(): QAppBundle {
    const manifest: QAppManifest = {
      name: 'test-app',
      version: '1.0.0',
      permissions: [Permission.Storage],
      entryPoint: 'index.html',
      assets: ['index.html'],
      author: 'author1',
      description: 'Test app',
    };
    return {
      manifest,
      files: [{ path: 'index.html', content: '<html></html>', size: 13 }],
      totalSize: 13,
      createdAt: Date.now(),
    };
  }

  it('should publish a valid bundle and create a listing', () => {
    const publisher = new Publisher();
    const bundle = createBundle();
    const result = publisher.publish(bundle, {
      appId: 'app-1',
      version: '1.0.0',
      author: 'author1',
      description: 'My app',
    });
    expect(result.success).toBe(true);
    expect(result.metadata?.appId).toBe('app-1');
  });

  it('should unpublish a version', () => {
    const publisher = new Publisher();
    const bundle = createBundle();
    publisher.publish(bundle, {
      appId: 'app-1',
      version: '1.0.0',
      author: 'author1',
      description: 'My app',
    });
    expect(publisher.unpublish('app-1', '1.0.0')).toBe(true);
    expect(publisher.getVersions('app-1')).toHaveLength(0);
  });

  it('should return false when unpublishing non-existent app', () => {
    const publisher = new Publisher();
    expect(publisher.unpublish('non-existent', '1.0.0')).toBe(false);
  });

  it('should return version history for a published app', () => {
    const publisher = new Publisher();
    const bundle = createBundle();
    publisher.publish(bundle, {
      appId: 'app-1',
      version: '1.0.0',
      author: 'author1',
      description: 'v1',
    });
    publisher.publish(bundle, {
      appId: 'app-1',
      version: '2.0.0',
      author: 'author1',
      description: 'v2',
    });
    const versions = publisher.getVersions('app-1');
    expect(versions).toHaveLength(2);
  });
});

describe('RemixManager', () => {
  it('should fork an app and create remix with attribution', () => {
    const manager = new RemixManager();
    const remix = manager.fork('original-app', 'original-author', 'remixer1');
    expect(remix.originalAppId).toBe('original-app');
    expect(remix.originalAuthor).toBe('original-author');
    expect(remix.remixAuthor).toBe('remixer1');
    expect(remix.attributionChain).toContain('original-author');
  });

  it('should grow the attribution chain on remix of remix', () => {
    const manager = new RemixManager();
    manager.fork('app-1', 'author-A', 'remixer-B');
    const secondRemix = manager.fork('app-1', 'author-A', 'remixer-C');
    expect(secondRemix.attributionChain).toContain('author-A');
    expect(secondRemix.attributionChain).toContain('remixer-B');
    expect(secondRemix.remixAuthor).toBe('remixer-C');
  });

  it('should return attribution by appId after fork', () => {
    const manager = new RemixManager();
    manager.fork('app-1', 'author-A', 'remixer-B');
    const attribution = manager.getAttribution('app-1');
    expect(attribution).toContain('author-A');
  });

  it('should calculate earnings with 70/20/10 split', () => {
    const manager = new RemixManager();
    const earnings = manager.calculateEarnings(100);
    expect(earnings.creatorAmount).toBe(70);
    expect(earnings.remixerChainAmount).toBe(20);
    expect(earnings.platformAmount).toBe(10);
  });

  it('should return empty attribution for unknown remix', () => {
    const manager = new RemixManager();
    expect(manager.getAttribution('unknown')).toHaveLength(0);
  });

  it('should calculate custom earning splits', () => {
    const manager = new RemixManager();
    const earnings = manager.calculateEarnings(200, {
      creator: 0.5,
      remixerChain: 0.3,
      platform: 0.2,
    });
    expect(earnings.creatorAmount).toBe(100);
    expect(earnings.remixerChainAmount).toBe(60);
    expect(earnings.platformAmount).toBe(40);
  });

  it('should throw when earning split ratios do not sum to 1.0', () => {
    const manager = new RemixManager();
    expect(() =>
      manager.calculateEarnings(100, {
        creator: 0.8,
        remixerChain: 0.3,
        platform: 0.1,
      }),
    ).toThrow('must sum to 1.0');
  });

  it('should throw when earning split ratios sum to less than 1.0', () => {
    const manager = new RemixManager();
    expect(() =>
      manager.calculateEarnings(100, {
        creator: 0.2,
        remixerChain: 0.1,
        platform: 0.1,
      }),
    ).toThrow('must sum to 1.0');
  });
});
