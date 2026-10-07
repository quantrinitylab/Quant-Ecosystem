import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { OutboxPublisher } from './outbox.js';
import { DeliveryQueue } from './delivery-queue.js';
import { verifySignature } from './http-signatures.js';

function generateEd25519Keys() {
  return generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

describe('OutboxPublisher', () => {
  it('publish signs activity', () => {
    const { privateKey } = generateEd25519Keys();
    const queue = new DeliveryQueue();
    const publisher = new OutboxPublisher(
      privateKey,
      'https://local.example/users/alice#main-key',
      queue,
    );

    publisher.publish(
      {
        type: 'Create',
        actor: 'https://local.example/users/alice',
        object: 'https://local.example/notes/1',
        id: 'act-1',
      },
      ['https://remote.example/users/bob/inbox'],
    );

    const jobs = queue.getPendingJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toContain('Create');
    expect(jobs[0]!.signedHeaders).toBeDefined();
    expect(jobs[0]!.signedHeaders!['signature']).toBeDefined();
  });

  it('publish enqueues delivery jobs for each recipient', () => {
    const { privateKey } = generateEd25519Keys();
    const queue = new DeliveryQueue();
    const publisher = new OutboxPublisher(
      privateKey,
      'https://local.example/users/alice#main-key',
      queue,
    );

    publisher.publish(
      {
        type: 'Create',
        actor: 'https://local.example/users/alice',
        object: 'https://local.example/notes/2',
        id: 'act-2',
      },
      [
        'https://remote1.example/inbox',
        'https://remote2.example/inbox',
        'https://remote3.example/inbox',
      ],
    );

    const jobs = queue.getPendingJobs();
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.recipientInbox).toBe('https://remote1.example/inbox');
    expect(jobs[1]!.recipientInbox).toBe('https://remote2.example/inbox');
    expect(jobs[2]!.recipientInbox).toBe('https://remote3.example/inbox');
  });

  it('publish signs separately per recipient URL', () => {
    const { privateKey, publicKey } = generateEd25519Keys();
    const queue = new DeliveryQueue();
    const publisher = new OutboxPublisher(
      privateKey,
      'https://local.example/users/alice#main-key',
      queue,
    );

    publisher.publish(
      {
        type: 'Create',
        actor: 'https://local.example/users/alice',
        object: 'https://local.example/notes/3',
        id: 'act-3',
      },
      ['https://remote1.example/inbox', 'https://remote2.example/users/bob/inbox'],
    );

    const jobs = queue.getPendingJobs();
    expect(jobs).toHaveLength(2);

    // Each job has its own signed headers
    const sig1 = jobs[0]!.signedHeaders!['signature']!;
    const sig2 = jobs[1]!.signedHeaders!['signature']!;
    expect(sig1).not.toBe(sig2);

    // Verify signatures are valid for their respective recipient URLs
    const valid1 = verifySignature(
      publicKey,
      'POST',
      jobs[0]!.recipientInbox,
      jobs[0]!.signedHeaders!,
      jobs[0]!.payload,
    );
    expect(valid1).toBe(true);

    const valid2 = verifySignature(
      publicKey,
      'POST',
      jobs[1]!.recipientInbox,
      jobs[1]!.signedHeaders!,
      jobs[1]!.payload,
    );
    expect(valid2).toBe(true);

    // Cross-verify: signature for recipient 1 should NOT verify against recipient 2's URL
    const crossValid = verifySignature(
      publicKey,
      'POST',
      jobs[1]!.recipientInbox,
      jobs[0]!.signedHeaders!,
      jobs[0]!.payload,
    );
    expect(crossValid).toBe(false);
  });

  it('getActivities returns ordered collection', () => {
    const { privateKey } = generateEd25519Keys();
    const publisher = new OutboxPublisher(privateKey, 'https://local.example/users/alice#main-key');

    publisher.publish(
      {
        type: 'Create',
        actor: 'https://local.example/users/alice',
        object: 'https://local.example/notes/1',
        id: 'act-first',
      },
      ['https://remote.example/inbox'],
    );
    publisher.publish(
      {
        type: 'Create',
        actor: 'https://local.example/users/alice',
        object: 'https://local.example/notes/2',
        id: 'act-second',
      },
      ['https://remote.example/inbox'],
    );

    const activities = publisher.getActivities();
    expect(activities).toHaveLength(2);
    expect(activities[0]!.id).toBe('act-second');
    expect(activities[1]!.id).toBe('act-first');
  });
});
