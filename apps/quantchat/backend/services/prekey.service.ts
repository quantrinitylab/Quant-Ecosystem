import type { PrismaClient } from '@prisma/client';
import { EncryptionService, type KeyStorage } from './encryption.service';
import { createKeyStorage } from './key-storage-factory';

export interface PrekeyBundleInput {
  identityKey: string;
  signedPrekey: {
    key: string;
    signature: string;
  };
  oneTimePrekeys: string[];
}

export class PrekeyService {
  private encryptionService: EncryptionService;

  constructor(prisma: PrismaClient, storage?: KeyStorage) {
    this.encryptionService = new EncryptionService(storage ?? createKeyStorage(prisma));
  }

  async publishPrekeyBundle(userId: string, bundleInput: PrekeyBundleInput): Promise<void> {
    await this.encryptionService.uploadPreKeyBundle(
      userId,
      {
        identityKey: bundleInput.identityKey,
        signedPreKey: bundleInput.signedPrekey.key,
        signedPreKeySignature: bundleInput.signedPrekey.signature,
        registrationId: 1,
      },
      bundleInput.oneTimePrekeys,
    );
  }

  async fetchPrekeyBundle(targetUserId: string) {
    const bundle = await this.encryptionService.claimPreKeyBundle(targetUserId);
    return {
      identityKey: bundle.identityKey,
      signedPrekey: {
        key: bundle.signedPreKey,
        signature: bundle.signedPreKeySignature,
      },
      ...(bundle.oneTimePreKey ? { oneTimePrekey: bundle.oneTimePreKey } : {}),
      registrationId: bundle.registrationId,
    };
  }
}
