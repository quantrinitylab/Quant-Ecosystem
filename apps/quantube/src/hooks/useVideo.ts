import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api-client';
import { resolveWatchVideo } from '../data/public-videos';

export function useVideo(id: string) {
  return useQuery({
    queryKey: ['video', id],
    queryFn: async () => {
      try {
        const response = await apiClient.getVideo(id);
        if (response.success) {
          return (response.data as any)?.video ?? response.data;
        }
      } catch {
        // fall through to the sample-catalog fallback below
      }
      // P0-1: the backend catalog is empty, so /api/videos/:id 404s for every
      // sample id. Resolve known sample ids against the shared client catalog
      // (real playable videoUrls) instead of rendering a dead player.
      const sample = resolveWatchVideo(id);
      if (sample) return sample;
      throw new Error('Failed to load video');
    },
    enabled: !!id,
  });
}

export default useVideo;
