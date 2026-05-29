import { describe, it, expect } from 'vitest';
import { BuildPipeline } from '../build/pipeline.js';
import { AssetBundler } from '../build/bundler.js';
import { Permission } from '../types.js';
import type { QAppManifest } from '../types.js';

describe('AssetBundler', () => {
  it('should collect assets from a file list', () => {
    const bundler = new AssetBundler();
    const files = bundler.collectAssets('src', ['index.html', 'app.js']);
    expect(files).toHaveLength(2);
    expect(files[0]!.path).toContain('index.html');
  });

  it('should validate bundle size against limit', () => {
    const bundler = new AssetBundler();
    const files = bundler.collectAssets('src', ['a.js', 'b.js']);
    expect(bundler.validateSize(files, 10000)).toBe(true);
    expect(bundler.validateSize(files, 1)).toBe(false);
  });

  it('should create a valid QAppBundle', () => {
    const bundler = new AssetBundler();
    const manifest: QAppManifest = {
      name: 'test-app',
      version: '1.0.0',
      permissions: [Permission.Storage],
      entryPoint: 'index.html',
      assets: ['index.html'],
      author: 'tester',
      description: 'Test',
    };
    const files = bundler.collectAssets('.', manifest.assets);
    const bundle = bundler.createBundle(files, manifest);
    expect(bundle.manifest.name).toBe('test-app');
    expect(bundle.files).toHaveLength(1);
    expect(bundle.totalSize).toBeGreaterThan(0);
  });
});

describe('BuildPipeline', () => {
  function validManifest(): QAppManifest {
    return {
      name: 'my-game',
      version: '2.0.0',
      permissions: [Permission.Network],
      entryPoint: 'index.html',
      assets: ['index.html', 'game.js'],
      author: 'dev',
      description: 'A game',
    };
  }

  it('should produce a valid QAppBundle from a valid manifest', () => {
    const pipeline = new BuildPipeline();
    const result = pipeline.build(validManifest());
    expect(result.success).toBe(true);
    expect(result.bundle).toBeDefined();
    expect(result.bundle!.manifest.name).toBe('my-game');
  });

  it('should detect and include project type when dependencies are provided', () => {
    const pipeline = new BuildPipeline();
    const result = pipeline.build(validManifest(), undefined, { phaser: '3.60.0' });
    expect(result.success).toBe(true);
    expect(result.projectType).toBe('phaser');
  });

  it('should default to raw project type when no dependencies provided', () => {
    const pipeline = new BuildPipeline();
    const result = pipeline.build(validManifest());
    expect(result.success).toBe(true);
    expect(result.projectType).toBe('raw');
  });

  it('should reject builds with invalid manifests', () => {
    const pipeline = new BuildPipeline();
    const manifest = { ...validManifest(), version: 'bad' };
    const result = pipeline.build(manifest);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid manifest');
  });

  it('should detect phaser project type', () => {
    const pipeline = new BuildPipeline();
    expect(pipeline.detectProjectType({ phaser: '3.0.0' })).toBe('phaser');
  });

  it('should detect react project type', () => {
    const pipeline = new BuildPipeline();
    expect(pipeline.detectProjectType({ react: '18.0.0' })).toBe('react');
  });

  it('should default to raw project type', () => {
    const pipeline = new BuildPipeline();
    expect(pipeline.detectProjectType({})).toBe('raw');
  });
});
