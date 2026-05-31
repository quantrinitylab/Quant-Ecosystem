import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface DocSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  owner: string;
  sharedWith: string[];
  isStarred: boolean;
}

export function useDocuments(options?: { filter?: string; search?: string }) {
  return useQuery<DocSummary[]>({
    queryKey: ['documents', options?.filter, options?.search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.filter) params.set('filter', options.filter);
      if (options?.search) params.set('search', options.search);
      const query = params.toString();
      const url = `/api/docs${query ? `?${query}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { title?: string }) => {
      const response = await fetch('/api/docs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error('Failed to create document');
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/docs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete document');
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useRenameDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const response = await fetch(`/api/docs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) {
        throw new Error('Failed to rename document');
      }
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}
