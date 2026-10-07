// ============================================================================
// E2E Encryption - Barrel Export
// ============================================================================

export { IdentityKeyService } from './identity-key';
export type { IdentityKeyPair, SerializedIdentityKeyPair } from './identity-key';

export { PreKeyBundleService } from './prekey-bundle';
export type { SignedPreKey, OneTimePreKey, PreKeyBundle } from './prekey-bundle';

export { DeviceKeyService } from './device-keys';
export type { DeviceKeyPair, DeviceLink } from './device-keys';

export { computeSafetyNumber } from './safety-numbers';

export { SignalSession } from './signal-session';
export type { MessageHeader, EncryptedMessage, InitiatorMessage } from './signal-session';

export { MLSGroup } from './mls-group';
export type { GroupMember } from './mls-group';

export { SealedSenderService } from './sealed-sender';
export type { SealedMessage, UnsealedMessage } from './sealed-sender';

export { EncryptedBackupService } from './encrypted-backup';
export type { EncryptedBackup } from './encrypted-backup';

export { DeviceLinkingService } from './device-linking';
export type { LinkingCode, LinkingSession } from './device-linking';

export * from './zk-email';
