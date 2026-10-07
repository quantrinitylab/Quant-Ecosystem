import { Actor } from './actor.js';
import { InboxProcessor, ActivitySchema, InboxSignatureVerifier } from './inbox.js';
import { OutboxPublisher } from './outbox.js';
import { FederationModeration } from '../moderation.js';

export interface RouteResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

export interface RequestMetadata {
  headers: Record<string, string>;
  method: string;
  url: string;
  body?: string;
}

export class FederationServer {
  private actors: Map<string, Actor> = new Map();
  private inboxProcessor: InboxProcessor;
  private outboxPublishers: Map<string, OutboxPublisher> = new Map();
  private followerSets: Map<string, Set<string>> = new Map();
  private followingSets: Map<string, Set<string>> = new Map();

  constructor(moderation?: FederationModeration, signatureVerifier?: InboxSignatureVerifier) {
    this.inboxProcessor = new InboxProcessor(moderation, signatureVerifier);
  }

  registerActor(actor: Actor): void {
    this.actors.set(actor.username, actor);
    this.outboxPublishers.set(
      actor.username,
      new OutboxPublisher(actor.privateKeyPem, `${actor.id}#main-key`),
    );
  }

  handle(
    method: string,
    path: string,
    body?: unknown,
    requestMeta?: RequestMetadata,
  ): RouteResponse {
    const actorMatch = /^\/users\/([^/]+)$/.exec(path);
    const inboxMatch = /^\/users\/([^/]+)\/inbox$/.exec(path);
    const outboxMatch = /^\/users\/([^/]+)\/outbox$/.exec(path);
    const followersMatch = /^\/users\/([^/]+)\/followers$/.exec(path);
    const followingMatch = /^\/users\/([^/]+)\/following$/.exec(path);

    if (method === 'GET' && actorMatch) {
      return this.handleGetActor(actorMatch[1]!);
    }

    if (method === 'POST' && inboxMatch) {
      return this.handlePostInbox(inboxMatch[1]!, body, requestMeta);
    }

    if (method === 'GET' && outboxMatch) {
      return this.handleGetOutbox(outboxMatch[1]!);
    }

    if (method === 'GET' && followersMatch) {
      return this.handleGetFollowers(followersMatch[1]!);
    }

    if (method === 'GET' && followingMatch) {
      return this.handleGetFollowing(followingMatch[1]!);
    }

    return {
      status: 404,
      body: { error: 'Not Found' },
      headers: { 'content-type': 'application/json' },
    };
  }

  private handleGetActor(username: string): RouteResponse {
    const actor = this.actors.get(username);
    if (!actor) {
      return {
        status: 404,
        body: { error: 'Actor not found' },
        headers: { 'content-type': 'application/json' },
      };
    }

    return {
      status: 200,
      body: actor.toJSON(),
      headers: { 'content-type': 'application/activity+json' },
    };
  }

  private handlePostInbox(
    username: string,
    body: unknown,
    requestMeta?: RequestMetadata,
  ): RouteResponse {
    const parsed = ActivitySchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        body: { error: 'Invalid activity' },
        headers: { 'content-type': 'application/json' },
      };
    }

    const actorUrl = parsed.data.actor;
    const senderDomain = new URL(actorUrl).hostname;

    const requestContext = requestMeta
      ? {
          headers: requestMeta.headers,
          method: requestMeta.method,
          url: requestMeta.url,
          body: requestMeta.body,
        }
      : undefined;

    const result = this.inboxProcessor.process(parsed.data, senderDomain, requestContext);

    if (!result.accepted) {
      return {
        status: 403,
        body: { error: result.error },
        headers: { 'content-type': 'application/json' },
      };
    }

    const followers = this.inboxProcessor.getFollowers(
      `https://${this.actors.get(username)?.domain ?? 'localhost'}/users/${username}`,
    );
    this.followerSets.set(username, followers);

    return {
      status: 202,
      body: result.response ?? { status: 'accepted' },
      headers: { 'content-type': 'application/activity+json' },
    };
  }

  private handleGetOutbox(username: string): RouteResponse {
    const publisher = this.outboxPublishers.get(username);
    if (!publisher) {
      return {
        status: 404,
        body: { error: 'Actor not found' },
        headers: { 'content-type': 'application/json' },
      };
    }

    const activities = publisher.getActivities();
    return {
      status: 200,
      body: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        totalItems: activities.length,
        orderedItems: activities,
      },
      headers: { 'content-type': 'application/activity+json' },
    };
  }

  private handleGetFollowers(username: string): RouteResponse {
    const followers =
      this.followerSets.get(username) ??
      this.inboxProcessor.getFollowers(`https://localhost/users/${username}`);
    const items = [...followers];

    return {
      status: 200,
      body: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        totalItems: items.length,
        orderedItems: items,
      },
      headers: { 'content-type': 'application/activity+json' },
    };
  }

  private handleGetFollowing(username: string): RouteResponse {
    const following = this.followingSets.get(username) ?? new Set<string>();
    const items = [...following];

    return {
      status: 200,
      body: {
        '@context': 'https://www.w3.org/ns/activitystreams',
        type: 'OrderedCollection',
        totalItems: items.length,
        orderedItems: items,
      },
      headers: { 'content-type': 'application/activity+json' },
    };
  }
}
