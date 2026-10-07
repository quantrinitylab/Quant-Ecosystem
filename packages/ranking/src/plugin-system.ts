// ============================================================================
// Plugin System - WASM-based custom ranking plugin management
// ============================================================================

import type { FeedItem, PluginManifest, RankedItem } from './types.js';
import { AlgorithmType } from './types.js';

export interface PluginSandbox {
  loadPlugin(manifest: PluginManifest): Promise<void>;
  executeRanking(items: FeedItem[]): Promise<RankedItem[]>;
  unloadPlugin(): void;
}

export interface PluginRankingFn {
  (items: FeedItem[]): RankedItem[];
}

export class PluginSystem {
  private plugins: Map<string, PluginManifest> = new Map();
  private loadedPlugins: Map<string, PluginRankingFn> = new Map();
  private memoryLimitBytes: number;
  private timeoutMs: number;

  constructor(options?: { memoryLimitBytes?: number; timeoutMs?: number }) {
    this.memoryLimitBytes = options?.memoryLimitBytes ?? 64 * 1024 * 1024; // 64MB default
    this.timeoutMs = options?.timeoutMs ?? 5000; // 5s default
  }

  async loadPlugin(manifest: PluginManifest, rankingFn?: PluginRankingFn): Promise<void> {
    this.plugins.set(manifest.id, manifest);

    // In a real implementation, this would load the WASM module from manifest.wasmUrl.
    // For now, we accept a configurable ranking function for testing.
    if (rankingFn) {
      this.loadedPlugins.set(manifest.id, rankingFn);
    } else {
      // Default passthrough ranking function
      this.loadedPlugins.set(manifest.id, (items: FeedItem[]) =>
        items.map((item, index) => ({
          ...item,
          score: 1 - index / Math.max(items.length, 1),
          algorithmUsed: AlgorithmType.Custom,
        })),
      );
    }
  }

  async executeRanking(pluginId: string, items: FeedItem[]): Promise<RankedItem[]> {
    const rankingFn = this.loadedPlugins.get(pluginId);
    if (!rankingFn) {
      throw new Error(`Plugin ${pluginId} is not loaded`);
    }

    // Simulate memory limit check
    const estimatedMemory = JSON.stringify(items).length * 2;
    if (estimatedMemory > this.memoryLimitBytes) {
      throw new Error(
        `Plugin ${pluginId} exceeded memory limit: ${estimatedMemory} > ${this.memoryLimitBytes}`,
      );
    }

    // Enforce timeout with Promise.race
    const executionPromise = new Promise<RankedItem[]>((resolve) => {
      resolve(rankingFn(items));
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Plugin ${pluginId} exceeded timeout: ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    return Promise.race([executionPromise, timeoutPromise]);
  }

  unloadPlugin(pluginId: string): void {
    this.plugins.delete(pluginId);
    this.loadedPlugins.delete(pluginId);
  }

  getPlugin(pluginId: string): PluginManifest | undefined {
    return this.plugins.get(pluginId);
  }

  listPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values());
  }

  isLoaded(pluginId: string): boolean {
    return this.loadedPlugins.has(pluginId);
  }

  getMemoryLimit(): number {
    return this.memoryLimitBytes;
  }

  getTimeout(): number {
    return this.timeoutMs;
  }
}
