import { z } from 'zod';
import { FederationModeration } from '../moderation.js';

export const ActivitySchema = z.object({
  type: z.string(),
  actor: z.string(),
  object: z.union([z.string(), z.record(z.unknown())]),
  id: z.string().optional(),
});

export type Activity = z.infer<typeof ActivitySchema>;

export interface InboxResult {
  accepted: boolean;
  response?: Activity;
  error?: string;
}

export interface InboxSignatureVerifier {
  (headers: Record<string, string>, method: string, url: string, body?: string): boolean;
}

export class InboxProcessor {
  private followers: Map<string, Set<string>> = new Map();
  private likes: Map<string, string[]> = new Map();
  private content: Map<string, unknown> = new Map();
  private boosts: Map<string, string[]> = new Map();
  private tombstones: Set<string> = new Set();
  private moderation: FederationModeration;
  private signatureVerifier?: InboxSignatureVerifier;

  constructor(moderation?: FederationModeration, signatureVerifier?: InboxSignatureVerifier) {
    this.moderation = moderation ?? new FederationModeration();
    this.signatureVerifier = signatureVerifier;
  }

  process(
    activity: Activity,
    senderDomain: string,
    requestContext?: {
      headers: Record<string, string>;
      method: string;
      url: string;
      body?: string;
    },
  ): InboxResult {
    if (this.signatureVerifier && requestContext) {
      const valid = this.signatureVerifier(
        requestContext.headers,
        requestContext.method,
        requestContext.url,
        requestContext.body,
      );
      if (!valid) {
        return { accepted: false, error: 'Invalid signature' };
      }
    }

    if (!this.moderation.checkActivity(activity)) {
      return { accepted: false, error: `Blocked: ${senderDomain}` };
    }

    switch (activity.type) {
      case 'Follow':
        return this.handleFollow(activity);
      case 'Like':
        return this.handleLike(activity);
      case 'Create':
        return this.handleCreate(activity);
      case 'Announce':
        return this.handleAnnounce(activity);
      case 'Delete':
        return this.handleDelete(activity);
      default:
        return { accepted: false, error: `Unknown activity type: ${activity.type}` };
    }
  }

  getFollowers(actorId: string): Set<string> {
    return this.followers.get(actorId) ?? new Set();
  }

  getLikes(objectId: string): string[] {
    return this.likes.get(objectId) ?? [];
  }

  getContent(objectId: string): unknown {
    return this.content.get(objectId);
  }

  getBoosts(objectId: string): string[] {
    return this.boosts.get(objectId) ?? [];
  }

  isTombstone(objectId: string): boolean {
    return this.tombstones.has(objectId);
  }

  // Intentional: auto-accept all Follow requests for protocol skeleton.
  // Production use would need an approval hook (e.g., pending state + user consent).
  private handleFollow(activity: Activity): InboxResult {
    const target = typeof activity.object === 'string' ? activity.object : String(activity.object);
    const existingFollowers = this.followers.get(target) ?? new Set();
    existingFollowers.add(activity.actor);
    this.followers.set(target, existingFollowers);

    const accept: Activity = {
      type: 'Accept',
      actor: target,
      object: activity.actor,
    };

    return { accepted: true, response: accept };
  }

  private handleLike(activity: Activity): InboxResult {
    const objectId =
      typeof activity.object === 'string'
        ? activity.object
        : ((activity.object as Record<string, unknown>)['id'] as string);
    const existingLikes = this.likes.get(objectId) ?? [];
    existingLikes.push(activity.actor);
    this.likes.set(objectId, existingLikes);
    return { accepted: true };
  }

  private handleCreate(activity: Activity): InboxResult {
    const obj = activity.object;
    const objectId =
      typeof obj === 'string' ? obj : ((obj as Record<string, unknown>)['id'] as string);
    this.content.set(objectId, obj);
    return { accepted: true };
  }

  private handleAnnounce(activity: Activity): InboxResult {
    const objectId =
      typeof activity.object === 'string'
        ? activity.object
        : ((activity.object as Record<string, unknown>)['id'] as string);
    const existingBoosts = this.boosts.get(objectId) ?? [];
    existingBoosts.push(activity.actor);
    this.boosts.set(objectId, existingBoosts);
    return { accepted: true };
  }

  private handleDelete(activity: Activity): InboxResult {
    const objectId =
      typeof activity.object === 'string'
        ? activity.object
        : ((activity.object as Record<string, unknown>)['id'] as string);
    this.tombstones.add(objectId);
    this.content.delete(objectId);
    return { accepted: true };
  }
}
