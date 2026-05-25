import { createAppError } from '@quant/server-core';

export type ExportStatus = 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface ExportJob {
  id: string;
  projectId: string;
  format: string;
  resolution: string;
  quality: string;
  status: ExportStatus;
  outputUrl: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

export interface QueueExportInput {
  projectId: string;
  format: string;
  resolution: string;
  quality: string;
}

export class ExportService {
  private exports: ExportJob[] = [];
  private idCounter = 0;

  async queueExport(input: QueueExportInput): Promise<ExportJob> {
    this.idCounter++;
    const exportJob: ExportJob = {
      id: `export-${this.idCounter}`,
      projectId: input.projectId,
      format: input.format,
      resolution: input.resolution,
      quality: input.quality,
      status: 'QUEUED',
      outputUrl: null,
      createdAt: new Date(),
      completedAt: null,
    };

    this.exports.push(exportJob);
    return exportJob;
  }

  async getExportStatus(exportId: string): Promise<ExportJob> {
    const exportJob = this.exports.find((e) => e.id === exportId);

    if (!exportJob) {
      throw createAppError('Export job not found', 404, 'EXPORT_NOT_FOUND');
    }

    return exportJob;
  }

  async listExports(projectId: string): Promise<ExportJob[]> {
    return this.exports
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async cancelExport(exportId: string): Promise<ExportJob> {
    const exportJob = this.exports.find((e) => e.id === exportId);

    if (!exportJob) {
      throw createAppError('Export job not found', 404, 'EXPORT_NOT_FOUND');
    }

    if (exportJob.status !== 'QUEUED') {
      throw createAppError('Only queued exports can be cancelled', 400, 'CANNOT_CANCEL_EXPORT');
    }

    exportJob.status = 'FAILED';
    return exportJob;
  }
}
