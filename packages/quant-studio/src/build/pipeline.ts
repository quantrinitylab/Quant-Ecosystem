import type { QAppManifest, QAppBundle, ProjectType } from '../types.js';
import { ManifestValidator } from '../manifest/validator.js';
import { AssetBundler } from './bundler.js';

const MAX_BUNDLE_SIZE = 50 * 1024 * 1024; // 50MB

export interface BuildOptions {
  minify?: boolean;
}

export interface BuildResult {
  success: boolean;
  bundle?: QAppBundle;
  error?: string;
  projectType?: ProjectType;
}

export class BuildPipeline {
  private readonly validator = new ManifestValidator();
  private readonly bundler = new AssetBundler();

  detectProjectType(dependencies: Record<string, string>): ProjectType {
    if ('phaser' in dependencies) return 'phaser';
    if ('react' in dependencies) return 'react';
    return 'raw';
  }

  detectProjectTypeFromFiles(files: string[]): ProjectType {
    if (files.some((f) => f.endsWith('.wasm') || f.includes('canvas'))) return 'webgl';
    return 'raw';
  }

  build(manifest: QAppManifest, _options?: BuildOptions, dependencies?: Record<string, string>): BuildResult {
    // Validate manifest
    const validation = this.validator.validate(manifest);
    if (!validation.valid) {
      return { success: false, error: `Invalid manifest: ${validation.errors.join(', ')}` };
    }

    // Detect project type if dependencies are available
    let projectType: ProjectType = 'raw';
    if (dependencies) {
      projectType = this.detectProjectType(dependencies);
    }

    // Collect and bundle assets
    const files = this.bundler.collectAssets('.', manifest.assets);

    // Check size limit
    if (!this.bundler.validateSize(files, MAX_BUNDLE_SIZE)) {
      return { success: false, error: `Bundle exceeds maximum size of ${MAX_BUNDLE_SIZE} bytes` };
    }

    // Create bundle with detected project type
    const bundle = this.bundler.createBundle(files, manifest);
    return { success: true, bundle, projectType };
  }
}
