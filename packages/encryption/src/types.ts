export interface E2EEConfig {
  enabled: boolean;
  defaultOn: boolean;
  algorithm: EncryptionAlgorithm;
  keyRotationPolicy: KeyRotationPolicy;
  zeroKnowledge: boolean;
  encryptAtRest: boolean;
  encryptInTransit: boolean;
}

export type EncryptionAlgorithm = 'aes-256-gcm' | 'chacha20-poly1305' | 'xchacha20-poly1305';

export interface KeyPair {
  publicKey: string;
  privateKey: string;
  algorithm: EncryptionAlgorithm;
  createdAt: Date;
  expiresAt: Date | null;
  fingerprint: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
  tag: string;
  algorithm: EncryptionAlgorithm;
  senderFingerprint: string;
  recipientFingerprint: string;
  timestamp: Date;
  version: number;
}

export interface KeyRotationPolicy {
  enabled: boolean;
  intervalDays: number;
  maxKeyAge: number;
  autoRotate: boolean;
  notifyBeforeExpiry: boolean;
  notifyDays: number;
}

export interface DeviceKey {
  deviceId: string;
  deviceName: string;
  keyPair: KeyPair;
  trusted: boolean;
  lastActive: Date;
  registeredAt: Date;
}

export interface PreKeyBundle {
  identityKey: string;
  signedPreKey: string;
  signedPreKeySignature: string;
  oneTimePreKey?: string;
  registrationId: number;
}

export interface SessionState {
  sessionId: string;
  remoteIdentityKey: string;
  localIdentityKey: string;
  established: boolean;
  establishedAt: Date | null;
  messageCount: number;
  ratchetState: RatchetState;
}

export interface RatchetState {
  rootKey: string;
  sendingChainKey: string;
  receivingChainKey: string;
  sendCounter: number;
  receiveCounter: number;
  previousSendCounter: number;
}
