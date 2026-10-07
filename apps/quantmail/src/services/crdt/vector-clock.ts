/**
 * Vector Clock Implementation for Distributed Multi-Tab & Offline State
 *
 * Tracks causal ordering across nodes/browser tabs with component-wise comparison:
 * - EQUAL: All clocks match
 * - GREATER: This clock is strictly causally after the other
 * - LESS: This clock is strictly causally before the other
 * - CONCURRENT: Clocks branched independently (requires CRDT resolution)
 */

export type ClockComparison = 'EQUAL' | 'GREATER' | 'LESS' | 'CONCURRENT';

export class VectorClock {
  public readonly nodeId: string;
  private clock: Map<string, number>;

  constructor(nodeId: string, initialClock?: Record<string, number> | Map<string, number>) {
    this.nodeId = nodeId;
    this.clock = new Map();

    if (initialClock) {
      if (initialClock instanceof Map) {
        for (const [k, v] of initialClock.entries()) {
          this.clock.set(k, v);
        }
      } else {
        for (const [k, v] of Object.entries(initialClock)) {
          this.clock.set(k, v);
        }
      }
    }

    if (!this.clock.has(this.nodeId)) {
      this.clock.set(this.nodeId, 0);
    }
  }

  /**
   * Increments the clock for this node.
   */
  public tick(): VectorClock {
    const current = this.clock.get(this.nodeId) || 0;
    this.clock.set(this.nodeId, current + 1);
    return this;
  }

  public get(nodeId: string): number {
    return this.clock.get(nodeId) || 0;
  }

  public set(nodeId: string, counter: number): void {
    this.clock.set(nodeId, counter);
  }

  /**
   * Merges another clock into this one by taking component-wise max.
   */
  public merge(other: VectorClock): VectorClock {
    const allKeys = new Set([...this.clock.keys(), ...other.clock.keys()]);
    for (const key of allKeys) {
      const thisVal = this.clock.get(key) || 0;
      const otherVal = other.clock.get(key) || 0;
      this.clock.set(key, Math.max(thisVal, otherVal));
    }
    return this;
  }

  /**
   * Compares this clock with another clock to determine causality.
   */
  public compare(other: VectorClock): ClockComparison {
    const allKeys = new Set([...this.clock.keys(), ...other.clock.keys()]);

    let hasGreater = false;
    let hasLesser = false;

    for (const key of allKeys) {
      const thisVal = this.clock.get(key) || 0;
      const otherVal = other.clock.get(key) || 0;

      if (thisVal > otherVal) {
        hasGreater = true;
      } else if (thisVal < otherVal) {
        hasLesser = true;
      }
    }

    if (hasGreater && !hasLesser) return 'GREATER';
    if (!hasGreater && hasLesser) return 'LESS';
    if (!hasGreater && !hasLesser) return 'EQUAL';
    return 'CONCURRENT';
  }

  public clone(): VectorClock {
    return new VectorClock(this.nodeId, new Map(this.clock));
  }

  public toJSON(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (const [k, v] of this.clock.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  public static fromJSON(nodeId: string, json: Record<string, number>): VectorClock {
    return new VectorClock(nodeId, json);
  }
}
