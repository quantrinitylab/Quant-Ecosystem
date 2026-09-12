import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { createContactsPageQuery, type ContactsPageOptions } from '../lib/contacts-pagination';

/** Paginated list for the contacts screen; legacy array and directory hooks stay unchanged. */
export function useContactsPage(options?: ContactsPageOptions) {
  return useQuery(createContactsPageQuery((request) => apiClient.getContacts(request), options));
}
