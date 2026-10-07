'use client';

// ============================================================================
// QuantMail — useSearchEmails Forwarder Shim (Task W13-4 / K06)
// Canonical implementation now lives in ./useMail with prefix ['inbox', 'search']
// ============================================================================

export { useSearchEmails, useLocalFts5Search, useSearchEmails as default } from './useMail';
export type { SearchEmailRequest } from '../types';
