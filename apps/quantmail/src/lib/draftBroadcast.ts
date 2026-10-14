/**
 * Cross-tab server-draft adoption for composers (BroadcastChannel).
 *
 * Finding qm-draft-conflict-tabs: two tabs replying to the same thread each
 * minted their own server draft, so Drafts filled with divergent duplicates.
 * The version guard fixes concurrent EDITS of one draft; this module stops two
 * drafts being minted for one reply in the first place — Gmail-style "one
 * draft, synced" for tabs on the same device.
 *
 * Protocol:
 * - A composer that creates a server draft for a reply context announces
 *   `{ key, draftId, version }` on the channel.
 * - A composer for the SAME key that has not created/adopted a draft yet
 *   adopts the announced id+version, so its autosave PUTs to the same draft
 *   instead of POSTing a second one.
 * - Announcements from the same tab (same origin id) are ignored.
 * - Fresh composes (no reply context) never share a key: two blank compose
 *   windows are legitimately different drafts and must not adopt each other.
 *
 * Framework-free: the channel constructor is injected so tests can pass a
 * stub; in the browser it defaults to window.BroadcastChannel and degrades
 * to a no-op where BroadcastChannel is unavailable (SSR, locked-down
 * browsers).
 */

export const DRAFT_BROADCAST_CHANNEL = 'qm.serverDraft.v1';

/**
 * Channel messages. `adopt` shares a newly created draft id with sibling
 * tabs; `retire` tells siblings a draft id is dead (sent or discarded), so
 * they drop it proactively instead of discovering it via a 404 on the next
 * autosave and then silently minting a duplicate.
 */
export type DraftChannelMessage =
  | {
      type: 'adopt';
      /** Reply context key, e.g. `reply:<emailId>`. Never a fresh-compose key. */
      key: string;
      draftId: string;
      version?: number;
      /** Random per-tab id so a tab ignores its own messages. */
      origin: string;
      /** Epoch ms — lets a late subscriber prefer the newest message. */
      ts: number;
    }
  | {
      type: 'retire';
      key: string;
      draftId: string;
      reason: 'sent' | 'discarded';
      origin: string;
      ts: number;
    };

export interface DraftBroadcastChannelLike {
  postMessage(message: DraftChannelMessage): void;
  addEventListener(type: 'message', listener: (event: { data: DraftChannelMessage }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: DraftChannelMessage }) => void): void;
  close(): void;
}

export type DraftBroadcastFactory = (name: string) => DraftBroadcastChannelLike | null;

/** Default factory: the real BroadcastChannel, or null when unavailable. */
export function defaultDraftBroadcastFactory(name: string): DraftBroadcastChannelLike | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    return new BroadcastChannel(name) as unknown as DraftBroadcastChannelLike;
  } catch {
    return null;
  }
}

function randomOrigin(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `tab_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export interface DraftAdoption {
  draftId: string;
  version?: number;
}

export interface DraftRetirement {
  draftId: string;
  reason: 'sent' | 'discarded';
}

/**
 * One tab's endpoint of the draft-adoption channel. Call `announce` after
 * creating a server draft; subscribe with `onAdoption` to adopt drafts other
 * tabs created for the same key. Call `retire` after sending/discarding a
 * draft; subscribe with `onRetirement` to drop dead ids proactively.
 */
export class DraftBroadcast {
  private channel: DraftBroadcastChannelLike | null;
  private readonly origin: string;
  private listeners = new Set<(event: { data: DraftChannelMessage }) => void>();
  private seen = new Set<string>();

  constructor(factory: DraftBroadcastFactory = defaultDraftBroadcastFactory) {
    this.channel = factory(DRAFT_BROADCAST_CHANNEL);
    this.origin = randomOrigin();
  }

  private post(message: DraftChannelMessage): void {
    if (!this.channel) return;
    try {
      this.channel.postMessage(message);
    } catch {
      /* broadcast is best-effort; the save already succeeded */
    }
  }

  /** Announce a newly created server draft to sibling tabs. */
  announce(key: string, draftId: string, version?: number): void {
    if (!key || !draftId) return;
    const dedupeKey = `adopt:${key}:${draftId}`;
    if (this.seen.has(dedupeKey)) return;
    this.seen.add(dedupeKey);
    this.post({ type: 'adopt', key, draftId, version, origin: this.origin, ts: Date.now() });
  }

  /** Announce that a draft id is dead (sent or discarded) to sibling tabs. */
  retire(key: string, draftId: string, reason: 'sent' | 'discarded'): void {
    if (!key || !draftId) return;
    const dedupeKey = `retire:${key}:${draftId}:${reason}`;
    if (this.seen.has(dedupeKey)) return;
    this.seen.add(dedupeKey);
    this.post({ type: 'retire', key, draftId, reason, origin: this.origin, ts: Date.now() });
  }

  private subscribe(
    key: string,
    type: 'adopt' | 'retire',
    cb: (msg: DraftChannelMessage) => void,
  ): () => void {
    if (!this.channel || !key) return () => {};
    const listener = (event: { data: DraftChannelMessage }) => {
      const msg = event?.data;
      if (!msg || msg.type !== type || msg.origin === this.origin || msg.key !== key) return;
      const dedupeKey = `${msg.type}:${msg.key}:${msg.draftId}:${msg.ts}`;
      if (this.seen.has(dedupeKey)) return;
      this.seen.add(dedupeKey);
      cb(msg);
    };
    this.listeners.add(listener);
    try {
      this.channel.addEventListener('message', listener);
    } catch {
      this.listeners.delete(listener);
      return () => {};
    }
    return () => {
      this.listeners.delete(listener);
      try {
        this.channel?.removeEventListener('message', listener);
      } catch {
        /* ignore */
      }
    };
  }

  /**
   * Subscribe to adoptions for `key`. The callback fires only for other tabs'
   * adopt messages matching the key. Returns an unsubscribe function.
   */
  onAdoption(key: string, cb: (adoption: DraftAdoption) => void): () => void {
    return this.subscribe(key, 'adopt', (msg) => {
      if (msg.type !== 'adopt') return;
      cb({ draftId: msg.draftId, version: msg.version });
    });
  }

  /**
   * Subscribe to retirements for `key`. Fires when a sibling tab sent or
   * discarded the draft — drop the id locally and tell the user honestly.
   */
  onRetirement(key: string, cb: (retirement: DraftRetirement) => void): () => void {
    return this.subscribe(key, 'retire', (msg) => {
      if (msg.type !== 'retire') return;
      cb({ draftId: msg.draftId, reason: msg.reason });
    });
  }

  dispose(): void {
    try {
      for (const l of this.listeners) this.channel?.removeEventListener('message', l);
      this.channel?.close();
    } catch {
      /* ignore */
    }
    this.listeners.clear();
    this.channel = null;
  }
}

/**
 * The share key for a composer instance. Only reply contexts share — a
 * `replyToId` (or thread-scoped id) means "the same reply", so sibling tabs
 * adopt one server draft. Fresh composes get null: two blank windows are
 * different drafts and must never adopt each other.
 */
export function draftShareKey(replyToId?: string | null): string | null {
  if (!replyToId || !replyToId.trim()) return null;
  return `reply:${replyToId.trim()}`;
}
