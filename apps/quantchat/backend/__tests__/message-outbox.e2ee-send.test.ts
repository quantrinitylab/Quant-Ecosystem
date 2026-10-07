// ============================================================================
// Unit tests — MessageService E2EE send validation + transactional outbox
// Spec: quantchat-launch-readiness, Task 11.4
// Design: Component 3 ("OutboxService"), Algorithm 2 ("Send message with
//         transactional outbox"), Correctness Property 3 ("Delivery atomicity").
// Requirements: 7.5 (persist encrypted content), 7.6 (reject E2EE send missing
//   recipient keys, persist nothing), 16.2 (never persist plaintext for E2EE).
//
// These drive the REAL MessageService + real PrismaOutboxService against the
// in-memory fake Prisma whose `$transaction` commits all-or-nothing, so the
// "persists NOTHING on rejection" and "exactly one outbox row on success"
// assertions are verified against the committed store, not a spy.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { MessageService } from '../services/message.service';
import { createFakeMessagePrisma, asPrismaClient } from './fake-message-prisma';

function generateRSAKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return {
    publicKeyBase64: Buffer.from(publicKey).toString('base64'),
    privateKeyDer: privateKey,
  };
}

describe('MessageService — E2EE send validation (Task 11.4)', () => {
  const conversationId = 'conv-e2ee';
  const senderId = 'sender-1';
  const recipientId = 'recipient-1';
  const memberIds = [senderId, recipientId];

  it('rejects an E2EE send missing recipient public keys with MISSING_RECIPIENT_KEYS and persists NOTHING', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));

    await expect(
      service.sendMessage({
        conversationId,
        senderId,
        content: 'top secret',
        encryption: 'e2e',
        // recipientPublicKeys intentionally omitted
      }),
    ).rejects.toMatchObject({ code: 'MISSING_RECIPIENT_KEYS' });

    // Req 7.6 / 16.2: no Message and no MessageOutbox row were written.
    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('rejects an E2EE send with an empty recipientPublicKeys array and persists NOTHING', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));

    await expect(
      service.sendMessage({
        conversationId,
        senderId,
        content: 'top secret',
        encryption: 'e2e',
        recipientPublicKeys: [],
      }),
    ).rejects.toMatchObject({ code: 'MISSING_RECIPIENT_KEYS' });

    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('stores encrypted content (NOT plaintext) and creates exactly one outbox row on a valid E2EE send', async () => {
    const recipient = generateRSAKeyPair();
    const plaintext = 'This is a confidential message';

    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));

    const message = await service.sendMessage({
      conversationId,
      senderId,
      content: plaintext,
      encryption: 'e2e',
      recipientPublicKeys: [{ userId: recipientId, publicKey: recipient.publicKeyBase64 }],
    });

    // Exactly one message committed, and its content is NOT the plaintext (Req 7.5, 16.2).
    expect(prisma.__state.messages).toHaveLength(1);
    const stored = prisma.__state.messages[0]!;
    expect(stored.content).not.toBe(plaintext);
    expect(stored.content).not.toContain(plaintext);

    // The stored content is a valid E2EE envelope (ciphertext, not cleartext).
    const payload = JSON.parse(stored.content) as {
      ciphertext: string;
      nonce: string;
      authTag: string;
      encryptedKeys: Array<{ recipientId: string; encryptedKey: string }>;
    };
    expect(payload).toHaveProperty('ciphertext');
    expect(payload).toHaveProperty('nonce');
    expect(payload).toHaveProperty('authTag');
    expect(payload.encryptedKeys).toHaveLength(1);
    expect(payload.encryptedKeys[0]!.recipientId).toBe(recipientId);

    // The ciphertext genuinely decrypts back to the original plaintext.
    const sessionKey = crypto.privateDecrypt(
      {
        key: Buffer.from(recipient.privateKeyDer),
        format: 'der',
        type: 'pkcs8',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      } as crypto.RsaPrivateKey,
      Buffer.from(payload.encryptedKeys[0]!.encryptedKey, 'base64'),
    );
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      sessionKey,
      Buffer.from(payload.nonce, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, 'base64')),
      decipher.final(),
    ]);
    expect(decrypted.toString('utf-8')).toBe(plaintext);

    // Exactly one matching outbox row, carrying recipients = members minus sender (Req 7.1, 7.4).
    expect(prisma.__state.outbox).toHaveLength(1);
    const outboxRow = prisma.__state.outbox[0]!;
    expect(outboxRow.messageId).toBe(message.id);
    expect(outboxRow.conversationId).toBe(conversationId);
    expect(outboxRow.recipientIds).toEqual([recipientId]);
  });

  it('persists encrypted content for every recipient and a single outbox row in a group E2EE send', async () => {
    const r1 = generateRSAKeyPair();
    const r2 = generateRSAKeyPair();
    const groupMembers = [senderId, 'recipient-a', 'recipient-b'];
    const plaintext = 'group secret';

    const prisma = createFakeMessagePrisma([{ conversationId, memberIds: groupMembers }]);
    const service = new MessageService(asPrismaClient(prisma));

    await service.sendMessage({
      conversationId,
      senderId,
      content: plaintext,
      encryption: 'e2e',
      recipientPublicKeys: [
        { userId: 'recipient-a', publicKey: r1.publicKeyBase64 },
        { userId: 'recipient-b', publicKey: r2.publicKeyBase64 },
      ],
    });

    expect(prisma.__state.messages).toHaveLength(1);
    const payload = JSON.parse(prisma.__state.messages[0]!.content) as {
      encryptedKeys: Array<{ recipientId: string }>;
    };
    expect(payload.encryptedKeys).toHaveLength(2);

    expect(prisma.__state.outbox).toHaveLength(1);
    expect([...prisma.__state.outbox[0]!.recipientIds].sort()).toEqual(
      ['recipient-a', 'recipient-b'].sort(),
    );
  });
});
