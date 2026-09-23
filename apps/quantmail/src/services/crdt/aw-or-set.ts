/**
 * Add-Wins Observed-Remove Set (AW-OR-Set) CRDT
 *
 * Guarantees eventual consistency across offline browser tabs and network partitions.
 * Specifically used for email state mutations:
 * - Flags: 'READ', 'STARRED', 'ARCHIVED', 'TRASH', 'SPAM'
 * - Labels: 'LABEL:inbox', 'LABEL:work', 'LABEL:finance', etc.
 */

import { VectorClock } from './vector-clock.js';

export interface ElementTag {
  nodeId: string;
  counter: number;
  timestamp: number;
}

export interface SerializedAwOrSet {
  nodeId: string;
  clock: Record<string, number>;
  addSet: Record<string, ElementTag[]>;
  removeSet: Record<string, ElementTag[]>;
}

export class AwOrSet<T extends string = string> {
  public readonly nodeId: string;
  public readonly clock: VectorClock;
  // element -> Array of birth tags
  private addSet: Map<T, ElementTag[]> = new Map();
  // element -> Array of observed removed tags
  private removeSet: Map<T, ElementTag[]> = new Map();

  private broadcastChannel: BroadcastChannel | null = null;
  private changeListeners = new Set<(currentElements: Set<T>) => void>();

  constructor(nodeId: string, channelName?: string) {
    this.nodeId = nodeId;
    this.clock = new VectorClock(nodeId);

    if (channelName && typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel(channelName);
        this.broadcastChannel.onmessage = (event: MessageEvent<SerializedAwOrSet>) => {
          this.merge(AwOrSet.fromJSON(event.data));
          this.notifyListeners();
        };
      } catch {
        // BroadcastChannel unavailable in non-browser context
      }
    }
  }

  /**
   * Adds an element to the set with a new causal tag.
   */
  public add(element: T): this {
    this.clock.tick();
    const tag: ElementTag = {
      nodeId: this.nodeId,
      counter: this.clock.get(this.nodeId),
      timestamp: Date.now(),
    };

    const existingTags = this.addSet.get(element) || [];
    existingTags.push(tag);
    this.addSet.set(element, existingTags);

    this.broadcastState();
    this.notifyListeners();
    return this;
  }

  /**
   * Removes an element by adding all currently observed tags for this element to removeSet.
   */
  public remove(element: T): this {
    const observedTags = this.addSet.get(element);
    if (!observedTags || observedTags.length === 0) {
      return this;
    }

    this.clock.tick();
    const existingRemovals = this.removeSet.get(element) || [];
    // Copy all observed tags to remove set
    for (const tag of observedTags) {
      if (!existingRemovals.some((r) => r.nodeId === tag.nodeId && r.counter === tag.counter)) {
        existingRemovals.push(tag);
      }
    }
    this.removeSet.set(element, existingRemovals);

    this.broadcastState();
    this.notifyListeners();
    return this;
  }

  /**
   * Checks if an element is present in the set (i.e. has active tags not yet observed as removed).
   */
  public has(element: T): boolean {
    const adds = this.addSet.get(element);
    if (!adds || adds.length === 0) return false;

    const removes = this.removeSet.get(element) || [];
    // Element is present if there is at least one tag in adds not in removes
    return adds.some(
      (aTag) =>
        !removes.some((rTag) => rTag.nodeId === aTag.nodeId && rTag.counter === aTag.counter),
    );
  }

  /**
   * Returns all currently present elements as a Set.
   */
  public elements(): Set<T> {
    const result = new Set<T>();
    for (const elem of this.addSet.keys()) {
      if (this.has(elem)) {
        result.add(elem);
      }
    }
    return result;
  }

  /**
   * Merges another AW-OR-Set into this instance (Lattice Join / Supremum).
   * - Takes union of add sets
   * - Takes union of remove sets
   * - Merges vector clocks
   */
  public merge(other: AwOrSet<T>): this {
    // 1. Merge clocks
    this.clock.merge(other.clock);

    // 2. Merge Add Sets
    for (const [elem, otherTags] of other.addSet.entries()) {
      const myTags = this.addSet.get(elem) || [];
      for (const oTag of otherTags) {
        if (!myTags.some((t) => t.nodeId === oTag.nodeId && t.counter === oTag.counter)) {
          myTags.push(oTag);
        }
      }
      this.addSet.set(elem, myTags);
    }

    // 3. Merge Remove Sets
    for (const [elem, otherRemoves] of other.removeSet.entries()) {
      const myRemoves = this.removeSet.get(elem) || [];
      for (const oRem of otherRemoves) {
        if (!myRemoves.some((r) => r.nodeId === oRem.nodeId && r.counter === oRem.counter)) {
          myRemoves.push(oRem);
        }
      }
      this.removeSet.set(elem, myRemoves);
    }

    this.notifyListeners();
    return this;
  }

  public onChange(listener: (currentElements: Set<T>) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private notifyListeners(): void {
    const cur = this.elements();
    for (const listener of this.changeListeners) {
      listener(cur);
    }
  }

  private broadcastState(): void {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(this.toJSON());
      } catch {
        // Ignore broadcast errors
      }
    }
  }

  public toJSON(): SerializedAwOrSet {
    const addObj: Record<string, ElementTag[]> = {};
    for (const [k, v] of this.addSet.entries()) {
      addObj[k] = [...v];
    }

    const removeObj: Record<string, ElementTag[]> = {};
    for (const [k, v] of this.removeSet.entries()) {
      removeObj[k] = [...v];
    }

    return {
      nodeId: this.nodeId,
      clock: this.clock.toJSON(),
      addSet: addObj,
      removeSet: removeObj,
    };
  }

  public static fromJSON<U extends string = string>(
    json: SerializedAwOrSet,
    channelName?: string,
  ): AwOrSet<U> {
    const set = new AwOrSet<U>(json.nodeId, channelName);
    set.clock.merge(VectorClock.fromJSON(json.nodeId, json.clock));

    for (const [k, v] of Object.entries(json.addSet)) {
      set.addSet.set(k as U, [...v]);
    }

    for (const [k, v] of Object.entries(json.removeSet)) {
      set.removeSet.set(k as U, [...v]);
    }

    return set;
  }

  public destroy(): void {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }
    this.changeListeners.clear();
  }
}
