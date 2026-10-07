import { z } from 'zod';
import { generateKeyPairSync } from 'node:crypto';

export const ActorSchema = z.object({
  '@context': z.array(z.string()),
  id: z.string().url(),
  type: z.literal('Person'),
  preferredUsername: z.string(),
  inbox: z.string().url(),
  outbox: z.string().url(),
  followers: z.string().url(),
  following: z.string().url(),
  publicKey: z.object({
    id: z.string(),
    owner: z.string().url(),
    publicKeyPem: z.string(),
  }),
});

export type ActorDocument = z.infer<typeof ActorSchema>;

export class Actor {
  readonly username: string;
  readonly domain: string;
  readonly publicKeyPem: string;
  readonly privateKeyPem: string;

  constructor(username: string, domain: string) {
    this.username = username;
    this.domain = domain;

    const { publicKey, privateKey } = generateKeyPairSync('ed25519', {
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this.publicKeyPem = publicKey;
    this.privateKeyPem = privateKey;
  }

  get id(): string {
    return `https://${this.domain}/users/${this.username}`;
  }

  toJSON(): ActorDocument {
    return {
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://w3id.org/security/v1'],
      id: this.id,
      type: 'Person',
      preferredUsername: this.username,
      inbox: `${this.id}/inbox`,
      outbox: `${this.id}/outbox`,
      followers: `${this.id}/followers`,
      following: `${this.id}/following`,
      publicKey: {
        id: `${this.id}#main-key`,
        owner: this.id,
        publicKeyPem: this.publicKeyPem,
      },
    };
  }
}
