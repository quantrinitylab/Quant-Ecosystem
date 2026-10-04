import { AssetBundler } from './bundler.js';
import type { ProjectType, QAppBundle, QAppManifest } from '../types.js';

export interface BuildOptions {
  minify?: boolean;
  sourceMaps?: boolean;
}

export interface BuildResult {
  success: boolean;
  bundle?: QAppBundle;
  projectType?: ProjectType;
  error?: string;
}

const SEMVER_RE = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/**
 * Validates a QApp manifest, detects the project type from declared
 * dependencies and produces a QAppBundle via the AssetBundler.
 */
export class BuildPipeline {
  private readonly bundler = new AssetBundler();

  detectProjectType(dependencies: Record<string, string>): ProjectType {
    if ('phaser' in dependencies) return 'phaser';
    if ('react' in dependencies || 'react-dom' in dependencies) return 'react';
    if ('three' in dependencies || '@babylonjs/core' in dependencies) return 'webgl';
    return 'raw';
  }

  build(
    manifest: QAppManifest,
    _options?: BuildOptions,
    dependencies: Record<string, string> = {},
  ): BuildResult {
    const validationError = this.validateManifest(manifest);
    if (validationError) {
      return { success: false, error: `Invalid manifest: ${validationError}` };
    }
    const projectType = this.detectProjectType(dependencies);
    const files = this.bundler.collectAssets('.', manifest.assets);
    const bundle = this.bundler.createBundle(files, manifest);
    return { success: true, bundle, projectType };
  }

  private validateManifest(manifest: QAppManifest): string | null {
    if (!manifest || typeof manifest !== 'object') return 'manifest must be an object';
    if (!manifest.name || typeof manifest.name !== 'string') return 'name is required';
    if (!SEMVER_RE.test(manifest.version ?? '')) {
      return `version '${manifest.version}' is not valid semver`;
    }
    if (!manifest.entryPoint || typeof manifest.entryPoint !== 'string') {
      return 'entryPoint is required';
    }
    if (!Array.isArray(manifest.assets)) return 'assets must be an array';
    if (!manifest.entryPoint || !manifest.assets.includes(manifest.entryPoint)) {
      return 'entryPoint must be listed in assets';
    }
    return null;
  }
}
