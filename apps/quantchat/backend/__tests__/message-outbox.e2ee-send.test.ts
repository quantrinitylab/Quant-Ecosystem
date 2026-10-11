// ============================================================================
// QC-F-022 — MessageService server-side "E2EE" requests: fail-closed,
// persist NOTHING. (Previously: Task 11.4 tests asserted the server would
// encrypt plaintext itself and persist the result — that server-side
// encryption was the defect: the server saw every "E2E" plaintext and
// session key. Real E2EE is client-side only, via the /e2ee relay.)
//
// These drive the REAL MessageService + real PrismaOutboxService against
// the in-memory fake Prisma whose `$transaction` commits all-or-nothing,
// so "persists NOTHING on rejection" is verified against the committed
// store, not a spy. A control case proves an ordinary send still commits
// exactly one message + one outbox row.
// ============================================================================

import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import {
  MessageService,
  E2EE_REQUIRES_CLIENT_SIDE_CODE,
} from '../services/message.service';
import { createFakeMessagePrisma, asPrismaClient } from './fake-message-prisma';

function asInput(value: Record<string, unknown>) {
  return value as never;
}

function realPublicKeyBase64(): string {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return Buffer.from(publicKey).toString('base64');
}

describe('MessageService — QC-F-022 server-side e2e rejection (outbox)', () => {
  const conversationId = 'conv-e2ee';
  const senderId = 'sender-1';
  const recipientId = 'recipient-1';
  const memberIds = [senderId, recipientId];

  it('rejects an e2e send missing recipient keys and persists NOTHING', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));
    await expect(
      service.sendMessage(
        asInput({ conversationId, senderId, content: 'top secret', encryption: 'e2e' }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('rejects an e2e send with an empty recipientPublicKeys array and persists NOTHING', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));
    await expect(
      service.sendMessage(
        asInput({
          conversationId,
          senderId,
          content: 'top secret',
          encryption: 'e2e',
          recipientPublicKeys: [],
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('rejects an e2e send WITH recipient keys — the server never encrypts — and persists NOTHING', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));
    await expect(
      service.sendMessage(
        asInput({
          conversationId,
          senderId,
          content: 'This is a confidential message',
          encryption: 'e2e',
          recipientPublicKeys: [{ userId: recipientId, publicKey: realPublicKeyBase64() }],
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('rejects a group e2e send with multiple recipient keys and persists NOTHING', async () => {
    const groupMembers = [senderId, 'recipient-a', 'recipient-b'];
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds: groupMembers }]);
    const service = new MessageService(asPrismaClient(prisma));
    await expect(
      service.sendMessage(
        asInput({
          conversationId,
          senderId,
          content: 'group secret',
          encryption: 'e2e',
          recipientPublicKeys: [
            { userId: 'recipient-a', publicKey: realPublicKeyBase64() },
            { userId: 'recipient-b', publicKey: realPublicKeyBase64() },
          ],
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.__state.messages).toHaveLength(0);
    expect(prisma.__state.outbox).toHaveLength(0);
  });

  it('control: an ordinary send still commits exactly one message + one outbox row', async () => {
    const prisma = createFakeMessagePrisma([{ conversationId, memberIds }]);
    const service = new MessageService(asPrismaClient(prisma));
    const message = await service.sendMessage({
      conversationId,
      senderId,
      content: 'hello',
    });
    expect(prisma.__state.messages).toHaveLength(1);
    expect(prisma.__state.messages[0]!.content).toBe('hello');
    expect(prisma.__state.outbox).toHaveLength(1);
    expect(prisma.__state.outbox[0]!.messageId).toBe(message.id);
    expect(prisma.__state.outbox[0]!.recipientIds).toEqual([recipientId]);
  });
});
