import type { SDKDownload, SDKVersion } from '../types.js';

export class SDKTracker {
  private downloads: SDKDownload[] = [];
  private versions = new Map<string, SDKVersion>();

  registerVersion(version: string, platforms: string[]): SDKVersion {
    const v: SDKVersion = {
      version,
      deprecated: false,
      platforms,
      releasedAt: Date.now(),
    };
    this.versions.set(version, v);
    return v;
  }

  deprecateVersion(version: string, message: string): boolean {
    const v = this.versions.get(version);
    if (!v) return false;
    v.deprecated = true;
    v.deprecationMessage = message;
    return true;
  }

  trackDownload(version: string, platform: string): SDKDownload | null {
    if (!this.versions.has(version)) return null;
    const dl: SDKDownload = {
      id: crypto.randomUUID(),
      version,
      platform,
      downloadedAt: Date.now(),
    };
    this.downloads.push(dl);
    return dl;
  }

  getDownloadCount(version?: string): number {
    if (version) {
      return this.downloads.filter((d) => d.version === version).length;
    }
    return this.downloads.length;
  }

  getDownloadsByPlatform(platform: string): SDKDownload[] {
    return this.downloads.filter((d) => d.platform === platform);
  }

  isDeprecated(version: string): boolean {
    return this.versions.get(version)?.deprecated ?? false;
  }

  getDeprecationWarning(version: string): string | null {
    const v = this.versions.get(version);
    if (!v || !v.deprecated) return null;
    return v.deprecationMessage ?? 'This version is deprecated';
  }

  getVersion(version: string): SDKVersion | null {
    return this.versions.get(version) ?? null;
  }

  getCompatiblePlatforms(version: string): string[] {
    return this.versions.get(version)?.platforms ?? [];
  }

  getLatestVersion(): SDKVersion | null {
    const all = [...this.versions.values()].filter((v) => !v.deprecated);
    if (all.length === 0) return null;
    // Last registered non-deprecated version is latest
    return all[all.length - 1] ?? null;
  }
}
