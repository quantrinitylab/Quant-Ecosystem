import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as crypto from 'node:crypto';
import { MessageService } from '../services/message.service';

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
      update: vi.fn(),
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
  // Interactive transaction runs the callback with the same mock client.
  prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(prisma));
  return prisma;
}

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

describe('MessageService - E2E Encryption', () => {
  let service: MessageService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MessageService(prisma as never);
  });

  describe('sendMessage with encryption: e2e', () => {
    it('stores encrypted content that is NOT the original plaintext', async () => {
      const recipient = generateRSAKeyPair();
      const originalContent = 'This is a secret message';

      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      let storedContent = '';
      prisma.message.create.mockImplementation(({ data }: { data: { content: string } }) => {
        storedContent = data.content;
        return Promise.resolve({
          id: 'msg-1',
          ...data,
          isEdited: false,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      prisma.conversation.update.mockResolvedValue({});

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: originalContent,
        encryption: 'e2e',
        recipientPublicKeys: [{ userId: 'user-2', publicKey: recipient.publicKeyBase64 }],
      });

      // The stored content should NOT be the original plaintext
      expect(storedContent).not.toBe(originalContent);
      expect(storedContent).not.toContain(originalContent);

      // The stored content should be a valid JSON payload
      const payload = JSON.parse(storedContent);
      expect(payload).toHaveProperty('ciphertext');
      expect(payload).toHaveProperty('nonce');
      expect(payload).toHaveProperty('authTag');
      expect(payload).toHaveProperty('encryptedKeys');
      expect(payload.encryptedKeys).toHaveLength(1);
      expect(payload.encryptedKeys[0].recipientId).toBe('user-2');
    });

    it('encryption/decryption round-trip works', async () => {
      const recipient = generateRSAKeyPair();
      const originalContent = 'Hello, this is encrypted!';

      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      let storedContent = '';
      prisma.message.create.mockImplementation(({ data }: { data: { content: string } }) => {
        storedContent = data.content;
        return Promise.resolve({
          id: 'msg-1',
          ...data,
          isEdited: false,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      prisma.conversation.update.mockResolvedValue({});

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: originalContent,
        encryption: 'e2e',
        recipientPublicKeys: [{ userId: 'user-2', publicKey: recipient.publicKeyBase64 }],
      });

      // Decrypt on recipient side
      const payload = JSON.parse(storedContent);
      const encryptedSessionKey = Buffer.from(payload.encryptedKeys[0].encryptedKey, 'base64');

      // Decrypt the session key with the recipient's private key
      const sessionKey = crypto.privateDecrypt(
        {
          key: Buffer.from(recipient.privateKeyDer),
          format: 'der',
          type: 'pkcs8',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        } as crypto.RsaPrivateKey,
        encryptedSessionKey,
      );

      // Decrypt the message with the session key
      const nonce = Buffer.from(payload.nonce, 'base64');
      const authTag = Buffer.from(payload.authTag, 'base64');
      const ciphertext = Buffer.from(payload.ciphertext, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

      expect(decrypted.toString('utf-8')).toBe(originalContent);
    });

    it('supports multiple recipients', async () => {
      const recipient1 = generateRSAKeyPair();
      const recipient2 = generateRSAKeyPair();
      const originalContent = 'Group encrypted message';

      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      let storedContent = '';
      prisma.message.create.mockImplementation(({ data }: { data: { content: string } }) => {
        storedContent = data.content;
        return Promise.resolve({
          id: 'msg-1',
          ...data,
          isEdited: false,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      prisma.conversation.update.mockResolvedValue({});

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: originalContent,
        encryption: 'e2e',
        recipientPublicKeys: [
          { userId: 'user-2', publicKey: recipient1.publicKeyBase64 },
          { userId: 'user-3', publicKey: recipient2.publicKeyBase64 },
        ],
      });

      const payload = JSON.parse(storedContent);
      expect(payload.encryptedKeys).toHaveLength(2);

      // Both recipients can decrypt
      for (const [idx, recipientKeys] of [recipient1, recipient2].entries()) {
        const encryptedSessionKey = Buffer.from(payload.encryptedKeys[idx].encryptedKey, 'base64');
        const sessionKey = crypto.privateDecrypt(
          {
            key: Buffer.from(recipientKeys.privateKeyDer),
            format: 'der',
            type: 'pkcs8',
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
          } as crypto.RsaPrivateKey,
          encryptedSessionKey,
        );

        const nonce = Buffer.from(payload.nonce, 'base64');
        const authTag = Buffer.from(payload.authTag, 'base64');
        const ciphertext = Buffer.from(payload.ciphertext, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, nonce);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        expect(decrypted.toString('utf-8')).toBe(originalContent);
      }
    });

    it('throws MISSING_RECIPIENT_KEYS when no recipientPublicKeys provided', async () => {
      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      await expect(
        service.sendMessage({
          conversationId: 'conv-1',
          senderId: 'user-1',
          content: 'Secret',
          encryption: 'e2e',
        }),
      ).rejects.toThrow('Recipient public keys required for E2E encryption');
    });

    it('sends unencrypted when encryption field is not set', async () => {
      const originalContent = 'Plain text message';

      prisma.conversationMember.findFirst.mockResolvedValue({
        id: 'member-1',
        conversationId: 'conv-1',
        userId: 'user-1',
        role: 'MEMBER',
        leftAt: null,
      });

      prisma.message.create.mockImplementation(({ data }: { data: { content: string } }) => {
        return Promise.resolve({
          id: 'msg-1',
          ...data,
          isEdited: false,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });
      prisma.conversation.update.mockResolvedValue({});

      await service.sendMessage({
        conversationId: 'conv-1',
        senderId: 'user-1',
        content: originalContent,
      });

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content: originalContent,
        }),
      });
    });
  });

  describe('encryptForRecipients', () => {
    it('produces an EncryptedPayload with correct structure', () => {
      const recipient = generateRSAKeyPair();
      const plaintext = 'Test encryption payload';

      const payload = service.encryptForRecipients(plaintext, [
        { userId: 'user-2', publicKey: recipient.publicKeyBase64 },
      ]);

      expect(payload.ciphertext).toBeDefined();
      expect(payload.nonce).toBeDefined();
      expect(payload.authTag).toBeDefined();
      expect(payload.encryptedKeys).toHaveLength(1);
      expect(payload.encryptedKeys[0].recipientId).toBe('user-2');
      expect(payload.encryptedKeys[0].encryptedKey).toBeDefined();
    });

    it('produces different ciphertext for the same plaintext (random nonce)', () => {
      const recipient = generateRSAKeyPair();
      const plaintext = 'Same message twice';

      const payload1 = service.encryptForRecipients(plaintext, [
        { userId: 'user-2', publicKey: recipient.publicKeyBase64 },
      ]);
      const payload2 = service.encryptForRecipients(plaintext, [
        { userId: 'user-2', publicKey: recipient.publicKeyBase64 },
      ]);

      expect(payload1.ciphertext).not.toBe(payload2.ciphertext);
      expect(payload1.nonce).not.toBe(payload2.nonce);
    });
  });
});
