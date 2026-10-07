import { z } from 'zod';

export const BoostRecordSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  objectUrl: z.string(),
  createdAt: z.string(),
});

export type BoostRecord = z.infer<typeof BoostRecordSchema>;

export class BoostService {
  private boosts: Map<string, BoostRecord> = new Map();
  private actorBoosts: Map<string, Set<string>> = new Map();
  private objectBoosts: Map<string, Set<string>> = new Map();

  boost(actorId: string, objectUrl: string): BoostRecord | null {
    // Check if already boosted
    const actorSet = this.actorBoosts.get(actorId);
    if (actorSet?.has(objectUrl)) return null;

    const id = crypto.randomUUID();
    const record: BoostRecord = {
      id,
      actorId,
      objectUrl,
      createdAt: new Date().toISOString(),
    };

    this.boosts.set(id, record);

    // Index by actor
    const byActor = this.actorBoosts.get(actorId) ?? new Set();
    byActor.add(objectUrl);
    this.actorBoosts.set(actorId, byActor);

    // Index by object
    const byObject = this.objectBoosts.get(objectUrl) ?? new Set();
    byObject.add(actorId);
    this.objectBoosts.set(objectUrl, byObject);

    return record;
  }

  unboost(actorId: string, objectUrl: string): boolean {
    const actorSet = this.actorBoosts.get(actorId);
    if (!actorSet?.has(objectUrl)) return false;

    actorSet.delete(objectUrl);

    const objectSet = this.objectBoosts.get(objectUrl);
    if (objectSet) objectSet.delete(actorId);

    // Remove from boosts map
    for (const [id, record] of this.boosts) {
      if (record.actorId === actorId && record.objectUrl === objectUrl) {
        this.boosts.delete(id);
        break;
      }
    }

    return true;
  }

  getBoostedBy(objectUrl: string): string[] {
    const boosters = this.objectBoosts.get(objectUrl);
    return boosters ? [...boosters] : [];
  }

  getBoosts(actorId: string): string[] {
    const boosted = this.actorBoosts.get(actorId);
    return boosted ? [...boosted] : [];
  }
}
