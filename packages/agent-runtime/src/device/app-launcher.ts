import { z } from 'zod';

export const AppRegistryEntrySchema = z.object({
  name: z.string(),
  bundleId: z.string(),
  deepLink: z.string(),
  installed: z.boolean(),
});

export type AppRegistryEntry = z.infer<typeof AppRegistryEntrySchema>;

export interface LaunchResult {
  success: boolean;
  appName: string;
  method: 'deepLink' | 'bundleId' | 'name';
  timestamp: number;
  error?: string;
}

export class AppLauncher {
  private readonly registry: Map<string, AppRegistryEntry> = new Map();
  private readonly runningApps: Set<string> = new Set();

  constructor(apps?: AppRegistryEntry[]) {
    if (apps) {
      for (const app of apps) {
        this.registry.set(app.name.toLowerCase(), app);
      }
    }
  }

  registerApp(entry: AppRegistryEntry): void {
    const parsed = AppRegistryEntrySchema.parse(entry);
    this.registry.set(parsed.name.toLowerCase(), parsed);
  }

  async launch(appName: string): Promise<LaunchResult> {
    const app = this.registry.get(appName.toLowerCase());
    if (!app) {
      return {
        success: false,
        appName,
        method: 'name',
        timestamp: Date.now(),
        error: `App not found in registry: ${appName}`,
      };
    }

    if (!app.installed) {
      return {
        success: false,
        appName,
        method: 'name',
        timestamp: Date.now(),
        error: `App not installed: ${appName}`,
      };
    }

    this.runningApps.add(appName.toLowerCase());
    return {
      success: true,
      appName,
      method: 'deepLink',
      timestamp: Date.now(),
    };
  }

  async launchByDeepLink(uri: string): Promise<LaunchResult> {
    // Find app by deep link prefix
    for (const [, app] of this.registry) {
      if (uri.startsWith(app.deepLink) || app.deepLink.startsWith(uri.split('://')[0]!)) {
        if (!app.installed) {
          return {
            success: false,
            appName: app.name,
            method: 'deepLink',
            timestamp: Date.now(),
            error: `App not installed: ${app.name}`,
          };
        }
        this.runningApps.add(app.name.toLowerCase());
        return {
          success: true,
          appName: app.name,
          method: 'deepLink',
          timestamp: Date.now(),
        };
      }
    }

    return {
      success: false,
      appName: 'unknown',
      method: 'deepLink',
      timestamp: Date.now(),
      error: `No app registered for deep link: ${uri}`,
    };
  }

  getInstalledApps(): AppRegistryEntry[] {
    return [...this.registry.values()].filter((app) => app.installed);
  }

  isAppRunning(appName: string): boolean {
    return this.runningApps.has(appName.toLowerCase());
  }

  stopApp(appName: string): void {
    this.runningApps.delete(appName.toLowerCase());
  }

  getRegisteredApps(): AppRegistryEntry[] {
    return [...this.registry.values()];
  }
}
