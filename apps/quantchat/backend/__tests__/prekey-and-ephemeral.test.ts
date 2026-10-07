import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrekeyService } from '../services/prekey.service';
import { MessageService } from '../services/message.service';

describe('QuantChat Prekey Registry & Ephemeral Snap Hard Purge (W36-02 & W36-05 / CH-8)', () => {
  describe('PrekeyService (Task W36-02)', () => {
    it('publishes and fetches prekey bundles with one-time key popping', async () => {
      process.env['KEY_STORAGE'] = 'prisma';
      const mockPrisma = {
        preKeyBundle: {
          findUnique: vi.fn(),
          upsert: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        oneTimePreKey: {
          findFirst: vi.fn(),
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn(),
          createMany: vi.fn(),
          count: vi.fn(),
        },
        $queryRaw: vi.fn().mockResolvedValue([{ publicKey: 'ot-key-abc' }]),
      };

      const identityKey = 'id-key-123';
      const signedPreKey = 'signed-key-456';
      const validSig = crypto.createHmac('sha256', identityKey).update(signedPreKey).digest('hex');

      // Mock storage/bundle retrieval & claiming behavior
      const storedBundle = {
        id: 'b1',
        userId: 'user-bob',
        identityKey,
        signedPreKey,
        signedPreKeySignature: validSig,
        registrationId: 42,
      };

      mockPrisma.preKeyBundle.findUnique.mockResolvedValue(storedBundle);
      mockPrisma.oneTimePreKey.findFirst.mockResolvedValue({
        id: 'ot-1',
        userId: 'user-bob',
        bundleId: 'b1',
        publicKey: 'ot-key-abc',
        claimed: false,
      });
      mockPrisma.oneTimePreKey.update.mockResolvedValue({});

      const service = new PrekeyService(mockPrisma as never);

      // Test publishing
      mockPrisma.preKeyBundle.upsert.mockResolvedValue(storedBundle);
      mockPrisma.oneTimePreKey.createMany.mockResolvedValue({ count: 2 });

      await expect(
        service.publishPrekeyBundle('user-bob', {
          identityKey,
          signedPrekey: {
            key: signedPreKey,
            signature: validSig,
          },
          oneTimePrekeys: ['ot-key-abc', 'ot-key-def'],
        }),
      ).resolves.not.toThrow();

      // Test fetching bundle & popping 1 one-time prekey
      const fetched = await service.fetchPrekeyBundle('user-bob');
      expect(fetched).toMatchObject({
        identityKey,
        signedPrekey: {
          key: signedPreKey,
          signature: validSig,
        },
        oneTimePrekey: 'ot-key-abc',
        registrationId: 42,
      });
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('Ephemeral Snap Hard Purge Engine (Task W36-05 / CH-8)', () => {
    it('consumes view-once snap on first view, triggers S3 deletion, and returns 410 on subsequent fetch', async () => {
      const mockStorage = {
        delete: vi.fn().mockResolvedValue(undefined),
        getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-snap'),
      };

      const mockPrisma = {
        message: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        conversationMember: {
          findFirst: vi
            .fn()
            .mockResolvedValue({ id: 'm-1', conversationId: 'c-1', userId: 'user-alice' }),
        },
        snapView: {
          findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'sv-1' }),
          create: vi.fn().mockResolvedValue({ id: 'sv-1' }),
        },
      };

      const messageRecord = {
        id: 'msg-snap-1',
        conversationId: 'c-1',
        senderId: 'user-bob',
        type: 'IMAGE',
        mediaUrl: 's3://quantchat-attachments/snaps/photo123.jpg',
        metadata: { viewOnce: true, duration: 10 },
      };

      mockPrisma.message.findUnique.mockResolvedValue(messageRecord);
      mockPrisma.message.update.mockResolvedValue({});

      const messageService = new MessageService(
        mockPrisma as never,
        undefined,
        undefined,
        mockStorage as never,
      );

      // First view (consumeSnap)
      const result = await messageService.consumeSnap('msg-snap-1', 'user-alice');
      expect(result).toEqual({
        mediaUrl: 'https://s3.example.com/presigned-snap',
        duration: 10,
      });

      // Verify S3 delete was called with correct storage key
      expect(mockStorage.delete).toHaveBeenCalledWith('snaps/photo123.jpg');

      // Verify message was updated with consumedAt, consumedBy, and mediaUrl cleared
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-snap-1' },
        data: expect.objectContaining({
          mediaUrl: null,
          metadata: expect.objectContaining({
            consumedBy: 'user-alice',
          }),
        }),
      });

      // Subsequent fetch / view attempts must fail closed with 410 GONE (SNAP_CONSUMED)
      await expect(messageService.consumeSnap('msg-snap-1', 'user-alice')).rejects.toMatchObject({
        statusCode: 410,
        code: 'SNAP_CONSUMED',
      });
    });
  });
});
