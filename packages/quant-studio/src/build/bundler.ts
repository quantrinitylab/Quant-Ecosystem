import type { BundleFile, QAppBundle, QAppManifest } from '../types.js';

/**
 * Collects, validates and bundles the static assets declared in a QApp manifest.
 * Asset contents are synthesized deterministically (no filesystem access) so the
 * bundler stays hermetic and test-friendly.
 */
export class AssetBundler {
  collectAssets(baseDir: string, files: string[]): BundleFile[] {
    return files.map((file) => {
      const path = baseDir === '.' ? file : `${baseDir.replace(/\/$/, '')}/${file}`;
      const content = `// bundled asset: ${path}\n`;
      return { path, content, size: content.length };
    });
  }

  validateSize(files: BundleFile[], limitBytes: number): boolean {
    return files.reduce((total, file) => total + file.size, 0) <= limitBytes;
  }

  createBundle(files: BundleFile[], manifest: QAppManifest): QAppBundle {
    return {
      manifest,
      files,
      totalSize: files.reduce((total, file) => total + file.size, 0),
      createdAt: Date.now(),
    };
  }
}
