import type { FeatureFlag } from './types';

export interface FlagStore {
  getAll(): FeatureFlag[];
  get(name: string): FeatureFlag | undefined;
  save(flag: FeatureFlag): FeatureFlag;
  delete(id: string): void;
}

export class InMemoryFlagStore implements FlagStore {
  private flags = new Map<string, FeatureFlag>();

  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  get(name: string): FeatureFlag | undefined {
    for (const flag of this.flags.values()) {
      if (flag.name === name) return flag;
    }
    return undefined;
  }

  save(flag: FeatureFlag): FeatureFlag {
    this.flags.set(flag.id, flag);
    return flag;
  }

  delete(id: string): void {
    this.flags.delete(id);
  }
}
