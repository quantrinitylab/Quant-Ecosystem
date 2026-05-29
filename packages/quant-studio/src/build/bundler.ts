import type { QAppManifest, QAppBundle, BundleFile } from '../types.js';

export class AssetBundler {
  collectAssets(sourceDir: string, fileList: string[]): BundleFile[] {
    return fileList.map((path) => ({
      path: `${sourceDir}/${path}`,
      content: `/* content of ${path} */`,
      size: path.length * 10, // simulated file size
    }));
  }

  validateSize(files: BundleFile[], maxBytes: number): boolean {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    return totalSize <= maxBytes;
  }

  createBundle(files: BundleFile[], manifest: QAppManifest): QAppBundle {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    return {
      manifest,
      files,
      totalSize,
      createdAt: Date.now(),
    };
  }
}
