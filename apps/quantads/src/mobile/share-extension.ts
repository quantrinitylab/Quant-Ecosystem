// Quantads - Share Extension Service
// Mobile share extension for advertising platform

export interface SharedContent {
  id: string;
  type: SharedContentType;
  data: string | ArrayBuffer;
  mimeType: string;
  fileName?: string;
  fileSize?: number;
  metadata: SharedContentMetadata;
  receivedAt: number;
}

export type SharedContentType = 'text' | 'url' | 'image' | 'video' | 'file' | 'contact' | 'location';

export interface SharedContentMetadata {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  sourceApp?: string;
  originalUrl?: string;
}

export interface ShareTarget {
  id: string;
  contentTypes: SharedContentType[];
  maxFileSize: number;
  maxFiles: number;
  description: string;
}

export interface ComposeData {
  contentType: SharedContentType;
  title: string;
  body: string;
  attachments: SharedContent[];
  recipients?: string[];
  metadata: Record<string, unknown>;
}

export interface ShareHistoryEntry {
  id: string;
  content: SharedContent;
  processedAt: number;
  action: string;
  success: boolean;
}

export interface MediaProcessingOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  format: 'jpeg' | 'png' | 'webp';
  stripMetadata: boolean;
}

export class ShareExtensionService {
  private shareTargets: Map<string, ShareTarget> = new Map();
  private shareHistory: ShareHistoryEntry[] = [];
  private processingQueue: SharedContent[] = [];
  private mediaOptions: MediaProcessingOptions = { maxWidth: 2048, maxHeight: 2048, quality: 0.85, format: 'jpeg', stripMetadata: false };

  constructor() {
    this.registerDefaultTargets();
  }

  private registerDefaultTargets(): void {
    const targets: ShareTarget[] = [
      { id: 'new_creative', contentTypes: ['text', 'url', 'image', 'file'], maxFileSize: 52428800, maxFiles: 10, description: 'Create Creative' },
      { id: 'quick_save', contentTypes: ['text', 'url', 'image', 'video', 'file'], maxFileSize: 104857600, maxFiles: 20, description: 'Save to quantads' },
    ];
    targets.forEach(t => this.shareTargets.set(t.id, t));
  }

  public async receiveContent(rawData: unknown, mimeType: string): Promise<SharedContent> {
    const contentType = this.detectContentType(mimeType, rawData);
    const content: SharedContent = {
      id: `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: contentType,
      data: rawData as string,
      mimeType,
      metadata: {},
      receivedAt: Date.now(),
    };
    this.processingQueue.push(content);
    return content;
  }

  public detectContentType(mimeType: string, data?: unknown): SharedContentType {
    if (mimeType.startsWith('text/plain')) {
      const text = data as string;
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) return 'url';
      return 'text';
    }
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'text/vcard') return 'contact';
    if (mimeType === 'application/geo+json') return 'location';
    return 'file';
  }

  public async prepareCompose(content: SharedContent): Promise<ComposeData> {
    const compose: ComposeData = {
      contentType: content.type,
      title: content.metadata.title || '',
      body: '',
      attachments: [],
      metadata: {},
    };

    switch (content.type) {
      case 'text':
        compose.body = content.data as string;
        break;
      case 'url':
        compose.body = content.data as string;
        compose.title = content.metadata.title || 'Shared Link';
        break;
      case 'image':
      case 'video':
      case 'file':
        compose.attachments = [content];
        compose.title = content.fileName || 'Create Creative';
        break;
    }
    return compose;
  }

  public registerShareTarget(target: ShareTarget): void {
    this.shareTargets.set(target.id, target);
  }

  public removeShareTarget(targetId: string): boolean {
    return this.shareTargets.delete(targetId);
  }

  public getShareTargets(): ShareTarget[] {
    return Array.from(this.shareTargets.values());
  }

  public canAcceptContent(targetId: string, content: SharedContent): boolean {
    const target = this.shareTargets.get(targetId);
    if (!target) return false;
    if (!target.contentTypes.includes(content.type)) return false;
    if (content.fileSize && content.fileSize > target.maxFileSize) return false;
    return true;
  }

  public getRecentShares(limit: number = 20): ShareHistoryEntry[] {
    return this.shareHistory.slice(-limit);
  }

  public addToHistory(content: SharedContent, action: string, success: boolean): void {
    this.shareHistory.push({
      id: `history_${Date.now()}`,
      content,
      processedAt: Date.now(),
      action,
      success,
    });
    if (this.shareHistory.length > 100) {
      this.shareHistory = this.shareHistory.slice(-100);
    }
  }

  public async processMedia(content: SharedContent, options?: Partial<MediaProcessingOptions>): Promise<SharedContent> {
    const opts = { ...this.mediaOptions, ...options };
    const processed: SharedContent = {
      ...content,
      id: `processed_${content.id}`,
      metadata: { ...content.metadata, processed: true, maxWidth: opts.maxWidth, maxHeight: opts.maxHeight } as unknown as SharedContentMetadata,
    };
    return processed;
  }

  public setMediaProcessingOptions(options: Partial<MediaProcessingOptions>): void {
    this.mediaOptions = { ...this.mediaOptions, ...options };
  }

  public getProcessingQueue(): SharedContent[] {
    return [...this.processingQueue];
  }

  public clearProcessingQueue(): void {
    this.processingQueue = [];
  }

  public getSupportedMimeTypes(): string[] {
    return [
      'text/plain', 'text/html', 'text/uri-list',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime',
      'application/pdf', 'application/json',
      'text/vcard', 'application/geo+json',
    ];
  }

  public clearHistory(): void {
    this.shareHistory = [];
  }
}
