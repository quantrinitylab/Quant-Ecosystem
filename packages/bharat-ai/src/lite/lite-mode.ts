import { LiteConfig } from '../types.js';

export class LiteMode {
  private config: LiteConfig;
  private queue: object[] = [];

  constructor(config: LiteConfig) {
    this.config = config;
  }

  shouldCompress(assetSizeKb: number): boolean {
    return this.config.compressionEnabled && assetSizeKb > this.config.maxAssetSizeKb;
  }

  canSend(connectionQuality: number): boolean {
    return connectionQuality >= this.config.connectionQualityThreshold;
  }

  enqueue(message: object): void {
    this.queue.push(message);
  }

  flush(): object[] {
    const messages = [...this.queue];
    this.queue = [];
    return messages;
  }

  getConfig(): LiteConfig {
    return { ...this.config };
  }

  detectConnectionQuality(): 'good' | 'moderate' | 'poor' {
    const threshold = this.config.connectionQualityThreshold;
    if (threshold >= 0.8) return 'good';
    if (threshold >= 0.5) return 'moderate';
    return 'poor';
  }
}
