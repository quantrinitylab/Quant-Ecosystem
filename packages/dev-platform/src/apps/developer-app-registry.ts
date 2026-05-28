import type { DeveloperApp } from '../types.js';

export class DeveloperAppRegistry {
  private apps = new Map<string, DeveloperApp>();

  register(
    name: string,
    description: string,
    ownerId: string,
    redirectUris: string[],
  ): DeveloperApp {
    const app: DeveloperApp = {
      id: crypto.randomUUID(),
      name,
      description,
      redirectUris,
      status: 'under_review',
      ownerId,
      createdAt: Date.now(),
    };
    this.apps.set(app.id, app);
    return app;
  }

  getApp(id: string): DeveloperApp | null {
    return this.apps.get(id) ?? null;
  }

  activate(id: string): boolean {
    const app = this.apps.get(id);
    if (!app) return false;
    app.status = 'active';
    return true;
  }

  suspend(id: string): boolean {
    const app = this.apps.get(id);
    if (!app) return false;
    app.status = 'suspended';
    return true;
  }

  transferOwnership(id: string, newOwnerId: string): boolean {
    const app = this.apps.get(id);
    if (!app || app.status === 'suspended') return false;
    app.ownerId = newOwnerId;
    return true;
  }

  getAppsByOwner(ownerId: string): DeveloperApp[] {
    return [...this.apps.values()].filter((a) => a.ownerId === ownerId);
  }

  getActiveApps(): DeveloperApp[] {
    return [...this.apps.values()].filter((a) => a.status === 'active');
  }
}
