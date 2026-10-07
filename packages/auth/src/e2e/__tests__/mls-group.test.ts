import { describe, it, expect } from 'vitest';
import * as crypto from 'node:crypto';
import { MLSGroup } from '../mls-group';

describe('MLSGroup', () => {
  function createMember() {
    const keyPair = crypto.generateKeyPairSync('x25519');
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      memberId: crypto.randomBytes(16).toString('hex'),
    };
  }

  describe('create', () => {
    it('should create a group with epoch 0', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      expect(group.getEpoch()).toBe(0);
      expect(group.getMemberCount()).toBe(1);
      expect(group.getGroupId()).toBeDefined();
    });
  });

  describe('addMember', () => {
    it('should add a member and advance the epoch', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const member = createMember();
      group.addMember(member);

      expect(group.getEpoch()).toBe(1);
      expect(group.getMemberCount()).toBe(2);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a message', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const plaintext = Buffer.from('Hello group!');
      const { ciphertext, nonce, authTag } = group.encrypt(plaintext);

      const decrypted = group.decrypt(creator.memberId, ciphertext, nonce, authTag);
      expect(decrypted.toString()).toBe('Hello group!');
    });

    it('should produce ciphertext different from plaintext', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const plaintext = Buffer.from('secret group message');
      const { ciphertext } = group.encrypt(plaintext);
      expect(ciphertext.includes(plaintext)).toBe(false);
    });
  });

  describe('removeMember - forward secrecy', () => {
    it('should change group key after removing a member', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const member = createMember();
      group.addMember(member);

      const keyBeforeRemoval = group.getGroupKey();
      group.removeMember(member.memberId);

      const keyAfterRemoval = group.getGroupKey();
      expect(keyBeforeRemoval.equals(keyAfterRemoval)).toBe(false);
    });

    it('should advance epoch on removal', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const member = createMember();
      group.addMember(member);
      expect(group.getEpoch()).toBe(1);

      group.removeMember(member.memberId);
      expect(group.getEpoch()).toBe(2);
    });

    it('old key cannot decrypt messages after removal (forward secrecy)', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);

      const member = createMember();
      group.addMember(member);

      // Save old group key
      const oldKey = group.getGroupKey();

      // Remove the member
      group.removeMember(member.memberId);

      // Encrypt with new key
      const plaintext = Buffer.from('post-removal message');
      const { ciphertext, nonce, authTag } = group.encrypt(plaintext);

      // Try to decrypt with old key - should fail
      expect(() => {
        const decipher = crypto.createDecipheriv('aes-256-gcm', oldKey, nonce);
        decipher.setAuthTag(authTag);
        Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      }).toThrow();
    });
  });

  describe('epoch advancement', () => {
    it('should advance epoch for each add/remove operation', () => {
      const creator = createMember();
      const group = new MLSGroup();
      group.create(creator);
      expect(group.getEpoch()).toBe(0);

      const m1 = createMember();
      group.addMember(m1);
      expect(group.getEpoch()).toBe(1);

      const m2 = createMember();
      group.addMember(m2);
      expect(group.getEpoch()).toBe(2);

      group.removeMember(m1.memberId);
      expect(group.getEpoch()).toBe(3);
    });
  });
});
