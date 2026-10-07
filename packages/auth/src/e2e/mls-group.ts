// ============================================================================
// E2E - MLS Group
// TreeKEM-inspired group key management for groups up to 1000 members
// ============================================================================

import * as crypto from 'node:crypto';

export interface GroupMember {
  memberId: string;
  publicKey: crypto.KeyObject;
  privateKey?: crypto.KeyObject;
}

interface GroupState {
  groupId: string;
  epoch: number;
  members: Map<string, { publicKey: crypto.KeyObject }>;
  groupSecret: Buffer;
  groupKey: Buffer;
}

function hkdfDerive(ikm: Buffer, salt: Buffer, info: string, length: number): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));
}

function deriveGroupKey(groupSecret: Buffer, epoch: number): Buffer {
  return hkdfDerive(groupSecret, Buffer.from(`epoch-${epoch}`, 'utf8'), 'MLSGroupKey', 32);
}

export class MLSGroup {
  private state: GroupState | null = null;

  /**
   * Create a new group
   */
  create(creatorIdentity: { publicKey: crypto.KeyObject; memberId: string }): void {
    const groupSecret = crypto.randomBytes(32);
    const groupId = crypto.randomBytes(16).toString('hex');

    this.state = {
      groupId,
      epoch: 0,
      members: new Map([[creatorIdentity.memberId, { publicKey: creatorIdentity.publicKey }]]),
      groupSecret,
      groupKey: deriveGroupKey(groupSecret, 0),
    };
  }

  /**
   * Add a member to the group, advancing the epoch
   */
  addMember(memberIdentity: { publicKey: crypto.KeyObject; memberId: string }): void {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    if (this.state.members.size >= 1000) {
      throw new Error('Group size limit reached (1000 members)');
    }

    this.state.members.set(memberIdentity.memberId, { publicKey: memberIdentity.publicKey });

    // Advance epoch: derive new group secret from old secret + new member's contribution
    const memberPublicDer = memberIdentity.publicKey.export({ type: 'spki', format: 'der' });
    const newGroupSecret = hkdfDerive(
      Buffer.concat([this.state.groupSecret, Buffer.from(memberPublicDer)]),
      Buffer.from(`add-${memberIdentity.memberId}`, 'utf8'),
      'MLSTreeUpdate',
      32,
    );

    this.state.epoch++;
    this.state.groupSecret = newGroupSecret;
    this.state.groupKey = deriveGroupKey(newGroupSecret, this.state.epoch);
  }

  /**
   * Remove a member from the group, advancing the epoch (forward secrecy)
   */
  removeMember(memberId: string): void {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    if (!this.state.members.has(memberId)) {
      throw new Error('Member not found in group');
    }

    this.state.members.delete(memberId);

    // Advance epoch with entirely new randomness to ensure forward secrecy
    const freshSecret = crypto.randomBytes(32);
    const newGroupSecret = hkdfDerive(
      Buffer.concat([this.state.groupSecret, freshSecret]),
      Buffer.from(`remove-${memberId}`, 'utf8'),
      'MLSTreeUpdate',
      32,
    );

    this.state.epoch++;
    this.state.groupSecret = newGroupSecret;
    this.state.groupKey = deriveGroupKey(newGroupSecret, this.state.epoch);
  }

  /**
   * Encrypt plaintext with the current group key
   */
  encrypt(plaintext: Buffer): {
    ciphertext: Buffer;
    nonce: Buffer;
    authTag: Buffer;
    epoch: number;
  } {
    if (!this.state) {
      throw new Error('Group not initialized');
    }

    const nonce = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.state.groupKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return { ciphertext, nonce, authTag, epoch: this.state.epoch };
  }

  /**
   * Decrypt ciphertext with the current group key
   */
  decrypt(_senderId: string, ciphertext: Buffer, nonce: Buffer, authTag: Buffer): Buffer {
    if (!this.state) {
      throw new Error('Group not initialized');
    }

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.state.groupKey, nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Get the current epoch number
   */
  getEpoch(): number {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    return this.state.epoch;
  }

  /**
   * Get the current group key (for testing/verification)
   */
  getGroupKey(): Buffer {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    return Buffer.from(this.state.groupKey);
  }

  /**
   * Get the group ID
   */
  getGroupId(): string {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    return this.state.groupId;
  }

  /**
   * Get member count
   */
  getMemberCount(): number {
    if (!this.state) {
      throw new Error('Group not initialized');
    }
    return this.state.members.size;
  }
}
