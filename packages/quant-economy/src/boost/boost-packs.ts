import type { BoostPack } from '../types.js';

export class BoostPackRegistry {
  private packs = new Map<string, BoostPack>();

  constructor() {
    this.registerDefaults();
  }

  private registerDefaults(): void {
    const defaults: BoostPack[] = [
      { id: 'basic', name: 'Basic', multiplier: 2, costCoins: 100 },
      { id: 'standard', name: 'Standard', multiplier: 5, costCoins: 250 },
      { id: 'premium', name: 'Premium', multiplier: 10, costCoins: 500 },
    ];
    for (const pack of defaults) {
      this.packs.set(pack.id, pack);
    }
  }

  getPack(id: string): BoostPack | undefined {
    return this.packs.get(id);
  }

  getAllPacks(): BoostPack[] {
    return [...this.packs.values()];
  }

  createCustomPack(name: string, multiplier: number, costCoins: number): BoostPack {
    const pack: BoostPack = {
      id: crypto.randomUUID(),
      name,
      multiplier,
      costCoins,
    };
    this.packs.set(pack.id, pack);
    return pack;
  }
}
