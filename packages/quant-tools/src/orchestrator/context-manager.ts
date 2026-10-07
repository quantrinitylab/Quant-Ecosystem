import type { ToolExecutionContext } from '../types.js';

export interface AppContext {
  currentApp: string;
  currentItem?: { id: string; type: string; title?: string };
  recentItems: Array<{ id: string; type: string; title: string; app: string; timestamp: number }>;
  metadata: Record<string, string>;
}

export interface ResolvedReference {
  resolved: boolean;
  value: string;
  source: string;
}

export class ContextManager {
  private context: AppContext;

  constructor(initialContext?: Partial<AppContext>) {
    this.context = {
      currentApp: initialContext?.currentApp ?? 'quantai',
      currentItem: initialContext?.currentItem,
      recentItems: initialContext?.recentItems ?? [],
      metadata: initialContext?.metadata ?? {},
    };
  }

  getContext(): AppContext {
    return { ...this.context };
  }

  setCurrentApp(appId: string): void {
    this.context.currentApp = appId;
  }

  setCurrentItem(item: { id: string; type: string; title?: string }): void {
    this.context.currentItem = item;
    this.addRecentItem({
      id: item.id,
      type: item.type,
      title: item.title ?? item.id,
      app: this.context.currentApp,
      timestamp: Date.now(),
    });
  }

  addRecentItem(item: AppContext['recentItems'][number]): void {
    this.context.recentItems = [
      item,
      ...this.context.recentItems.filter((r) => r.id !== item.id),
    ].slice(0, 20);
  }

  setMetadata(key: string, value: string): void {
    this.context.metadata[key] = value;
  }

  resolveReference(input: string): ResolvedReference {
    const lower = input.toLowerCase();

    // Resolve "this email", "current email", "this document", etc.
    if (lower.includes('this ') || lower.includes('current ')) {
      if (this.context.currentItem) {
        return {
          resolved: true,
          value: this.context.currentItem.id,
          source: `${this.context.currentApp}:${this.context.currentItem.type}`,
        };
      }
    }

    // Resolve "last <type>" references
    const lastMatch = lower.match(/last\s+(email|document|file|message|event|meeting)/);
    if (lastMatch) {
      const type = lastMatch[1]!;
      const recent = this.context.recentItems.find((r) => r.type.toLowerCase().includes(type));
      if (recent) {
        return {
          resolved: true,
          value: recent.id,
          source: `${recent.app}:${recent.type}`,
        };
      }
    }

    return { resolved: false, value: '', source: '' };
  }

  buildExecutionContext(userId: string, sessionId: string): ToolExecutionContext {
    return {
      userId,
      sessionId,
      permissions: 1,
      dryRun: false,
      metadata: {
        ...this.context.metadata,
        currentApp: this.context.currentApp,
        ...(this.context.currentItem ? { currentItemId: this.context.currentItem.id } : {}),
      },
    };
  }

  injectContextIntoParams(params: Record<string, unknown>, input: string): Record<string, unknown> {
    const resolved = this.resolveReference(input);
    if (resolved.resolved) {
      return {
        ...params,
        _contextItemId: resolved.value,
        _contextSource: resolved.source,
      };
    }
    return params;
  }
}
