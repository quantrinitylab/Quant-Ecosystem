import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ServerAsset } from '../services/api-client';

export function useAssets(category?: string, search?: string, projectId?: string) {
  return useQuery({
    queryKey: ['assets', category, search, projectId],
    queryFn: async () => {
      const response = await apiClient.listAssets(category, search, projectId);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to load assets');
      }
      return response.data ?? [];
    },
  });
}

/**
 * The real upload flow (P0-3), three steps:
 *  1. requestUploadUrl — backend creates the PENDING asset row and returns
 *     a signed PUT URL (content-length is signed, so the PUT must be
 *     exactly file.size bytes with exactly the file's Content-Type).
 *  2. PUT the file bytes directly to object storage. Content-Length is a
 *     forbidden header in browsers — the browser sets it from the body, so
 *     it is stripped from requiredHeaders here (per @quant/storage's docs).
 *  3. completeUpload — backend verifies the landed bytes via HeadObject
 *     and marks the asset READY.
 */
export function useAssetUpload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      file,
    }: {
      projectId: string;
      file: File;
    }): Promise<ServerAsset> => {
      const urlResponse = await apiClient.requestUploadUrl({
        projectId,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });
      if (!urlResponse.success || !urlResponse.data) {
        throw new Error(urlResponse.error?.message || 'Failed to get upload URL');
      }

      const { uploadUrl, assetId, requiredHeaders } = urlResponse.data;
      const headers: Record<string, string> = { ...requiredHeaders };
      delete headers['Content-Length'];

      const putResponse = await fetch(uploadUrl, { method: 'PUT', headers, body: file });
      if (!putResponse.ok) {
        throw new Error(`Upload failed (${putResponse.status})`);
      }

      const completeResponse = await apiClient.completeUpload(assetId);
      if (!completeResponse.success || !completeResponse.data) {
        throw new Error(completeResponse.error?.message || 'Failed to complete upload');
      }
      return completeResponse.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export default useAssets;
