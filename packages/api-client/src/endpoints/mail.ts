// ============================================================================
// API Client SDK - QuantMail Endpoints
// ============================================================================

import { createQueryHook } from '../hooks/useQuery';
import { createMutationHook } from '../hooks/useMutation';
import type { HttpClient } from '../core/http-client';

/** Email type */
export interface Email {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** Send email params */
export interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
}

/** Search emails params */
export interface SearchEmailsParams {
  query: string;
  folder?: string;
}

/** Create mail endpoint hooks */
export function createMailHooks(client: HttpClient) {
  const useInbox = createQueryHook<Record<string, string>, Email[]>(client, '/api/mail/inbox', {
    staleTime: 15000,
  });

  const useSendEmail = createMutationHook<SendEmailParams, Email>(client, '/api/mail/send');

  const useSearchEmails = createQueryHook<SearchEmailsParams & Record<string, string>, Email[]>(
    client,
    '/api/mail/search',
  );

  return { useInbox, useSendEmail, useSearchEmails };
}
