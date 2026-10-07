export type {
  E2EEConfig,
  EncryptionAlgorithm,
  KeyPair,
  EncryptedPayload,
  KeyRotationPolicy,
  DeviceKey,
  PreKeyBundle,
  SessionState,
  RatchetState,
} from './types.js';

export { E2EEManager, createE2EEManager } from './e2ee.js';

export { KeyExchange, createKeyExchange } from './key-exchange.js';

// Real cryptographic primitives + KMS key-vault (Phase 1 de-simulation, Req 2.3-2.5)
export { PgpCrypto } from './pgp-crypto.js';
export type { PgpKeyMaterial } from './pgp-crypto.js';

export {
  InMemoryKeyVault,
  SecretVaultKeyVault,
  KEY_REF_PREFIX,
  isKeyRef,
} from './key-vault.js';
export type { KeyVault, KeyRef, KeyVaultMetadata, SecretVaultPort } from './key-vault.js';
