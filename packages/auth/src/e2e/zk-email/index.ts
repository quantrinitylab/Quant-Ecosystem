// ============================================================================
// ZK Email - Barrel Export
// ============================================================================

export { ZKEmailKeyPairService } from './keypair';
export type { GeneratedKeyPair } from './keypair';

export { EncryptedEmailStorage } from './encrypted-storage';
export type { EncryptedEmail, EmailContent } from './encrypted-storage';

export { ClientSearchIndex } from './client-search';
export type { IndexableEmail, IndexEntry, EncryptedIndex, SearchResult } from './client-search';

export { KeyDiscoveryService, zBase32Encode } from './key-discovery';
export type { PublishedKey } from './key-discovery';
