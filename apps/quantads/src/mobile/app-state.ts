// Quantads - App State Service
// Mobile app state management for advertising platform

export interface AppState {
  version: number;
  userId: string | null;
  lastActiveAt: number;
  campaignsState: Record<string, unknown>;
  analyticsState: Record<string, unknown>;
  preferences: UserPreferences;
  cache: CacheState;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: boolean;
  biometricEnabled: boolean;
  offlineMode: boolean;
}

export interface CacheState {
  metricsCache: Record<string, unknown>;
  lastCleared: number;
  sizeBytes: number;
  maxSizeBytes: number;
}

export interface StateSnapshot {
  id: string;
  state: AppState;
  timestamp: number;
  trigger: 'background' | 'manual' | 'periodic' | 'crash_recovery';
}

export interface StateMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (state: Record<string, unknown>) => Record<string, unknown>;
  description: string;
}

export type LifecycleEvent =
  | 'foreground'
  | 'background'
  | 'inactive'
  | 'terminated'
  | 'memory_warning';

export interface LifecycleHandler {
  id: string;
  event: LifecycleEvent;
  priority: number;
  handler: () => void | Promise<void>;
}

export class AppStateService {
  private currentState: AppState;
  private snapshots: StateSnapshot[] = [];
  private migrations: StateMigration[] = [];
  private lifecycleHandlers: Map<LifecycleEvent, LifecycleHandler[]> = new Map();
  private stateListeners: Array<(state: AppState) => void> = [];
  private currentLifecycle: LifecycleEvent = 'foreground';
  private stateVersion: number = 1;

  constructor() {
    this.currentState = this.getDefaultState();
    this.registerDefaultMigrations();
  }

  private getDefaultState(): AppState {
    return {
      version: this.stateVersion,
      userId: null,
      lastActiveAt: Date.now(),
      campaignsState: {},
      analyticsState: {},
      preferences: {
        theme: 'system',
        language: 'en',
        notifications: true,
        biometricEnabled: false,
        offlineMode: false,
      },
      cache: { metricsCache: {}, lastCleared: Date.now(), sizeBytes: 0, maxSizeBytes: 104857600 },
    };
  }

  private registerDefaultMigrations(): void {
    this.migrations.push(
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (state) => ({ ...state, version: 2 }),
        description: 'Add version 2 fields',
      },
      {
        fromVersion: 2,
        toVersion: 3,
        migrate: (state) => ({ ...state, version: 3 }),
        description: 'Add version 3 fields',
      },
    );
  }

  public async persistState(): Promise<boolean> {
    const snapshot: StateSnapshot = {
      id: `snapshot_${Date.now()}`,
      state: { ...this.currentState },
      timestamp: Date.now(),
      trigger: 'manual',
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > 10) {
      this.snapshots = this.snapshots.slice(-10);
    }
    return true;
  }

  public async restoreState(): Promise<AppState | null> {
    if (this.snapshots.length === 0) return null;
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) return null;
    const migrated = this.migrateState(latest.state as unknown as Record<string, unknown>);
    this.currentState = migrated as unknown as AppState;
    this.notifyListeners();
    return this.currentState;
  }

  public async onBackground(): Promise<void> {
    this.currentLifecycle = 'background';
    this.currentState.lastActiveAt = Date.now();
    await this.persistState();
    await this.executeLifecycleHandlers('background');
  }

  public async onForeground(): Promise<void> {
    this.currentLifecycle = 'foreground';
    this.currentState.lastActiveAt = Date.now();
    await this.executeLifecycleHandlers('foreground');
    this.notifyListeners();
  }

  public async onMemoryWarning(): Promise<void> {
    this.currentState.cache = {
      ...this.currentState.cache,
      metricsCache: {},
      sizeBytes: 0,
      lastCleared: Date.now(),
    };
    await this.executeLifecycleHandlers('memory_warning');
  }

  public migrateState(state: Record<string, unknown>): Record<string, unknown> {
    let current = { ...state };
    const currentVersion = (current.version as number) || 1;
    const applicableMigrations = this.migrations
      .filter((m) => m.fromVersion >= currentVersion)
      .sort((a, b) => a.fromVersion - b.fromVersion);
    for (const migration of applicableMigrations) {
      current = migration.migrate(current);
    }
    return current;
  }

  public getStateSnapshot(): StateSnapshot {
    return {
      id: `snapshot_${Date.now()}`,
      state: { ...this.currentState },
      timestamp: Date.now(),
      trigger: 'manual',
    };
  }

  public registerLifecycleHandler(
    event: LifecycleEvent,
    handler: () => void | Promise<void>,
    priority: number = 0,
  ): () => void {
    const entry: LifecycleHandler = {
      id: `handler_${Date.now()}_${Math.random()}`,
      event,
      priority,
      handler,
    };
    if (!this.lifecycleHandlers.has(event)) {
      this.lifecycleHandlers.set(event, []);
    }
    this.lifecycleHandlers.get(event)!.push(entry);
    this.lifecycleHandlers.get(event)!.sort((a, b) => b.priority - a.priority);
    return () => {
      const handlers = this.lifecycleHandlers.get(event);
      if (handlers) {
        const idx = handlers.findIndex((h) => h.id === entry.id);
        if (idx > -1) handlers.splice(idx, 1);
      }
    };
  }

  private async executeLifecycleHandlers(event: LifecycleEvent): Promise<void> {
    const handlers = this.lifecycleHandlers.get(event) || [];
    for (const entry of handlers) {
      await entry.handler();
    }
  }

  public getState(): AppState {
    return { ...this.currentState };
  }

  public updateState(partial: Partial<AppState>): void {
    this.currentState = { ...this.currentState, ...partial };
    this.notifyListeners();
  }

  public onStateChange(listener: (state: AppState) => void): () => void {
    this.stateListeners.push(listener);
    return () => {
      const idx = this.stateListeners.indexOf(listener);
      if (idx > -1) this.stateListeners.splice(idx, 1);
    };
  }

  private notifyListeners(): void {
    this.stateListeners.forEach((l) => l(this.currentState));
  }

  public getCurrentLifecycle(): LifecycleEvent {
    return this.currentLifecycle;
  }

  public addMigration(migration: StateMigration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.fromVersion - b.fromVersion);
  }

  public getSnapshots(): StateSnapshot[] {
    return [...this.snapshots];
  }

  public clearState(): void {
    this.currentState = this.getDefaultState();
    this.snapshots = [];
    this.notifyListeners();
  }
}
