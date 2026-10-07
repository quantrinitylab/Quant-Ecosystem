import { Agent } from '../core/agent.js';
import { logger } from '@quant/common';
import { HttpClient, createQuantDriveClient } from '../clients/http-client.js';

export class QuantDriveAgent extends Agent {
  private httpClient: HttpClient;

  constructor(httpClient?: HttpClient) {
    super({
      id: 'quantdrive-agent',
      name: 'QuantDrive Agent',
      personality: 'Organized, secure, efficient file management assistant',
      capabilities: [
        'upload_file',
        'organize_files',
        'search_files',
        'share_files',
        'version_control',
        'ai_tagging',
      ],
    });

    this.httpClient = httpClient ?? createQuantDriveClient();
    this.registerDriveTools();
  }

  private registerDriveTools() {
    this.addTool({
      name: 'quantdrive_upload',
      description: 'Upload a file to QuantDrive',
      parameters: {
        filename: 'string',
        content: 'string',
        folder: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantDriveAgent] Uploading file:', params);

        const response = await this.httpClient.post('/api/files/upload', {
          filename: params.filename,
          content: params.content,
          folder: params.folder || '/',
        });

        if (!response.ok) {
          logger.warn('[QuantDriveAgent] Failed to upload file:', response.error);
          return { success: false, error: response.error };
        }

        return {
          success: true,
          fileId: response.data?.id || response.data?.fileId,
          url: response.data?.url,
          size: response.data?.size,
        };
      },
    });

    this.addTool({
      name: 'quantdrive_organize',
      description: 'Organize files using AI',
      parameters: {
        folderId: 'string',
        strategy: 'string',
      },
      execute: async (params: any) => {
        logger.log('[QuantDriveAgent] Organizing files:', params);

        const response = await this.httpClient.post('/api/files/organize', {
          folderId: params.folderId,
          strategy: params.strategy || 'auto',
        });

        if (!response.ok) {
          logger.warn('[QuantDriveAgent] Failed to organize files:', response.error);
          return { organized: false, error: response.error };
        }

        return {
          organized: true,
          foldersCreated: response.data?.foldersCreated ?? 0,
          filesMoved: response.data?.filesMoved ?? 0,
        };
      },
    });
  }
}
