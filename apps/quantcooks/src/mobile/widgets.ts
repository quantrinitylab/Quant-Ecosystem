// Quantedits - Widget Service
// Mobile home screen widgets for document editing platform

export interface WidgetDefinition {
  id: string;
  name: string;
  description: string;
  sizes: WidgetSize[];
  refreshInterval: RefreshInterval;
  configurable: boolean;
  previewImageUrl: string;
}

export type WidgetSize = 'small' | 'medium' | 'large' | 'extra_large';

export type RefreshInterval = '5min' | '15min' | '30min' | '1hr' | '4hr' | '12hr' | 'manual';

export interface WidgetData {
  widgetId: string;
  lastUpdated: number;
  data: Record<string, unknown>;
  displayItems: WidgetDisplayItem[];
  error?: string;
}

export interface WidgetDisplayItem {
  id: string;
  type: 'text' | 'number' | 'progress' | 'image' | 'list_item' | 'chart';
  label: string;
  value: string | number;
  icon?: string;
  color?: string;
  action?: string;
}

export interface WidgetConfiguration {
  widgetId: string;
  size: WidgetSize;
  settings: Record<string, unknown>;
  theme: 'light' | 'dark' | 'system';
  position: number;
}

export interface WidgetInteraction {
  widgetId: string;
  itemId: string;
  action: string;
  timestamp: number;
}

export interface WidgetRefreshSchedule {
  widgetId: string;
  interval: RefreshInterval;
  lastRefresh: number;
  nextRefresh: number;
  forceRefresh: boolean;
}

export class WidgetService {
  private widgets: Map<string, WidgetDefinition> = new Map();
  private widgetData: Map<string, WidgetData> = new Map();
  private configurations: Map<string, WidgetConfiguration> = new Map();
  private schedules: Map<string, WidgetRefreshSchedule> = new Map();
  private interactionHandlers: Map<string, (interaction: WidgetInteraction) => void> = new Map();

  constructor() {
    this.registerDefaultWidgets();
  }

  private registerDefaultWidgets(): void {
    const defaults: WidgetDefinition[] = [
      { id: 'recent_docs', name: 'Recent_docs', description: 'Shows recently edited documents', sizes: ['small', 'medium'], refreshInterval: '15min', configurable: true, previewImageUrl: '/widgets/recent_docs_preview.png' },
      { id: 'pending_reviews', name: 'Pending_reviews', description: 'Shows documents awaiting review', sizes: ['medium', 'large'], refreshInterval: '30min', configurable: true, previewImageUrl: '/widgets/pending_reviews_preview.png' },
      { id: 'quick_actions', name: 'Quick Actions', description: 'Quick access to common actions', sizes: ['small', 'medium'], refreshInterval: 'manual', configurable: true, previewImageUrl: '/widgets/quick_actions_preview.png' },
      { id: 'activity_feed', name: 'Activity Feed', description: 'Recent activity updates', sizes: ['medium', 'large', 'extra_large'], refreshInterval: '5min', configurable: true, previewImageUrl: '/widgets/activity_preview.png' },
      { id: 'stats_overview', name: 'Stats Overview', description: 'Key metrics at a glance', sizes: ['small', 'medium', 'large'], refreshInterval: '15min', configurable: false, previewImageUrl: '/widgets/stats_preview.png' },
    ];
    defaults.forEach(w => this.widgets.set(w.id, w));
  }

  public registerWidget(definition: WidgetDefinition): void {
    this.widgets.set(definition.id, definition);
    this.scheduleRefresh(definition.id, definition.refreshInterval);
  }

  public unregisterWidget(widgetId: string): void {
    this.widgets.delete(widgetId);
    this.widgetData.delete(widgetId);
    this.configurations.delete(widgetId);
    this.schedules.delete(widgetId);
  }

  public async refreshWidget(widgetId: string): Promise<WidgetData | null> {
    const widget = this.widgets.get(widgetId);
    if (!widget) return null;
    const data = await this.fetchWidgetData(widgetId);
    this.widgetData.set(widgetId, data);
    const schedule = this.schedules.get(widgetId);
    if (schedule) {
      schedule.lastRefresh = Date.now();
      schedule.nextRefresh = Date.now() + this.intervalToMs(widget.refreshInterval);
    }
    return data;
  }

  private async fetchWidgetData(widgetId: string): Promise<WidgetData> {
    return {
      widgetId,
      lastUpdated: Date.now(),
      data: {},
      displayItems: [],
    };
  }

  public configureWidget(widgetId: string, configuration: Partial<WidgetConfiguration>): WidgetConfiguration {
    const existing = this.configurations.get(widgetId) || { widgetId, size: 'medium', settings: {}, theme: 'system' as const, position: 0 };
    const updated = { ...existing, ...configuration, widgetId };
    this.configurations.set(widgetId, updated);
    return updated;
  }

  public getWidgetData(widgetId: string): WidgetData | null {
    return this.widgetData.get(widgetId) || null;
  }

  public getWidgetConfiguration(widgetId: string): WidgetConfiguration | null {
    return this.configurations.get(widgetId) || null;
  }

  public handleInteraction(interaction: WidgetInteraction): void {
    const handler = this.interactionHandlers.get(interaction.widgetId);
    if (handler) handler(interaction);
  }

  public onWidgetInteraction(widgetId: string, handler: (interaction: WidgetInteraction) => void): () => void {
    this.interactionHandlers.set(widgetId, handler);
    return () => this.interactionHandlers.delete(widgetId);
  }

  public scheduleRefresh(widgetId: string, interval: RefreshInterval): void {
    this.schedules.set(widgetId, {
      widgetId,
      interval,
      lastRefresh: 0,
      nextRefresh: Date.now() + this.intervalToMs(interval),
      forceRefresh: false,
    });
  }

  public forceRefresh(widgetId: string): void {
    const schedule = this.schedules.get(widgetId);
    if (schedule) schedule.forceRefresh = true;
  }

  private intervalToMs(interval: RefreshInterval): number {
    const map: Record<RefreshInterval, number> = {
      '5min': 300000,
      '15min': 900000,
      '30min': 1800000,
      '1hr': 3600000,
      '4hr': 14400000,
      '12hr': 43200000,
      'manual': Infinity,
    };
    return map[interval];
  }

  public getWidgetsNeedingRefresh(): string[] {
    const now = Date.now();
    return Array.from(this.schedules.entries())
      .filter(([_, schedule]) => schedule.forceRefresh || now >= schedule.nextRefresh)
      .map(([id]) => id);
  }

  public getAvailableWidgets(): WidgetDefinition[] {
    return Array.from(this.widgets.values());
  }

  public getActiveWidgets(): Array<{ definition: WidgetDefinition; configuration: WidgetConfiguration }> {
    return Array.from(this.configurations.entries())
      .map(([id, config]) => ({ definition: this.widgets.get(id)!, configuration: config }))
      .filter(entry => entry.definition);
  }

  public compressDataForWidget(data: Record<string, unknown>, maxSizeBytes: number): Record<string, unknown> {
    const serialized = JSON.stringify(data);
    if (serialized.length <= maxSizeBytes) return data;
    const keys = Object.keys(data).slice(0, Math.floor(maxSizeBytes / 100));
    const compressed: Record<string, unknown> = {};
    keys.forEach(key => { compressed[key] = data[key]; });
    return compressed;
  }
}
