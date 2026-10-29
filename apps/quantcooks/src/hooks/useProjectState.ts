// ============================================================================
// QuantEdits - useProjectState (P0-5)
//
// React-query wrapper over GET /projects/:id/state — the editor's load
// path. staleTime is Infinity and window-focus refetch is OFF by design:
// a background refetch must never clobber in-progress edits. The editor
// refetches explicitly only on a conflict Reload (via the save hook's
// onReloadRequest wiring).
// ============================================================================

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';

export function useProjectState(id: string | undefined) {
  return useQuery({
    queryKey: ['project-state', id],
    queryFn: async () => {
      const response = await apiClient.getProjectState(id as string);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to load project state');
      }
      return response.data;
    },
    enabled: !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export default useProjectState;
