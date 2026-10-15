// QC-F-022: this file previously tested MessageService's SERVER-SIDE
// "E2E" encryption (server received plaintext, generated the session
// key, and RSA-wrapped it per recipient). That was not end-to-end
// encryption — the server saw every plaintext and session key. The
// behaviour is now honest fail-closed rejection; these tests pin that,
// plus the unchanged ordinary (non-E2EE) send path and the client-
// ciphertext-as-content path (server treats it as opaque text).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import {
  MessageService,
  E2EE_REQUIRES_CLIENT_SIDE_CODE,
} from '../services/message.service';

function realPublicKeyBase64(): string {
  const { publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  return Buffer.from(publicKey).toString('base64');
}

function createMockPrisma() {
  const prisma = {
    message: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      // QC-F-359 fixture migration: blocked-send gate reads (type from
      // the row; block list from user preferences — null = readable
      // empty list, 'clear' both directions). No assertion changes.
      findUnique: vi.fn().mockResolvedValue({ id: 'conv-1', type: 'DIRECT' }),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue({ preferences: null }),
    },
    conversationMember: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    messageOutbox: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

// Runtime callers (plain JS / HTTP) can still pass the removed fields;
// the typed SendMessageInput no longer offers them, hence the cast.
function asInput(value: Record<string, unknown>) {
  return value as never;
}

describe('MessageService - QC-F-022 server-side "e2e" removed', () => {
  let service: MessageService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MessageService(prisma as never);
    prisma.conversationMember.findFirst.mockResolvedValue({
      id: 'member-1',
      conversationId: 'conv-1',
      userId: 'user-1',
      role: 'MEMBER',
      leftAt: null,
    });
    prisma.message.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({
        id: 'msg-1',
        ...(data as Record<string, unknown>),
        isEdited: false,
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    prisma.conversation.update.mockResolvedValue({});
  });

  it('rejects encryption:e2e with recipient keys and persists NOTHING', async () => {
    await expect(
      service.sendMessage(
        asInput({
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'This is a secret message',
          encryption: 'e2e',
          recipientPublicKeys: [{ userId: 'user-2', publicKey: realPublicKeyBase64() }],
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE, statusCode: 400 });
    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects encryption:e2e even when no recipient keys are supplied', async () => {
    await expect(
      service.sendMessage(
        asInput({
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Secret',
          encryption: 'e2e',
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('rejects a bare recipientPublicKeys request (no encryption flag)', async () => {
    await expect(
      service.sendMessage(
        asInput({
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Secret',
          recipientPublicKeys: [{ userId: 'user-2', publicKey: realPublicKeyBase64() }],
        }),
      ),
    ).rejects.toMatchObject({ code: E2EE_REQUIRES_CLIENT_SIDE_CODE });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('no longer exposes any server-side encryption helper', () => {
    expect(
      (service as unknown as { encryptForRecipients?: unknown }).encryptForRecipients,
    ).toBeUndefined();
  });

  it('sends ordinary (non-E2EE) content unchanged when no e2e fields are set', async () => {
    const originalContent = 'Plain text message';
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: originalContent,
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: originalContent }),
    });
  });

  it('stores client-side ciphertext as opaque content verbatim (server never decrypts)', async () => {
    const ciphertext = '{"ciphertext":"b3BhcXVl","nonce":"bg==","authTag":"dA=="}';
    await service.sendMessage({
      conversationId: 'conv-1',
      senderId: 'user-1',
      content: ciphertext,
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ content: ciphertext }),
    });
  });
});
