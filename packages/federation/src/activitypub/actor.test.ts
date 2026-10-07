import { describe, it, expect } from 'vitest';
import { Actor, ActorSchema } from './actor.js';

describe('Actor', () => {
  it('creates actor with valid keypair', () => {
    const actor = new Actor('alice', 'example.com');

    expect(actor.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(actor.privateKeyPem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('serializes to valid AS2 JSON with all required fields', () => {
    const actor = new Actor('bob', 'social.example.org');
    const json = actor.toJSON();

    expect(json.id).toBe('https://social.example.org/users/bob');
    expect(json.type).toBe('Person');
    expect(json.preferredUsername).toBe('bob');
    expect(json.inbox).toBe('https://social.example.org/users/bob/inbox');
    expect(json.outbox).toBe('https://social.example.org/users/bob/outbox');
    expect(json.followers).toBe('https://social.example.org/users/bob/followers');
    expect(json.following).toBe('https://social.example.org/users/bob/following');
    expect(json['@context']).toContain('https://www.w3.org/ns/activitystreams');
  });

  it('publicKey has correct structure', () => {
    const actor = new Actor('carol', 'node.test');
    const json = actor.toJSON();

    expect(json.publicKey.id).toBe('https://node.test/users/carol#main-key');
    expect(json.publicKey.owner).toBe('https://node.test/users/carol');
    expect(json.publicKey.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');

    const result = ActorSchema.safeParse(json);
    expect(result.success).toBe(true);
  });
});
