// ============================================================================
// QuantEdits - Export Controller
// Business logic for rendering and export operations
// ============================================================================

import { renderService } from '../services/render-service';
import { publishService } from '../services/publish-service';
import { editorService } from '../services/editor-service';
import type { ExportConfig, ExportJob, PublishTarget } from '../../src/types';

export class ExportController {
  async startExport(projectId: string, userId: string, config: ExportConfig): Promise<ExportJob | null> {
    const project = editorService.getProject(projectId);
    if (!project) return null;
    return renderService.startExport(project, config, userId);
  }

  getJob(jobId: string): ExportJob | null {
    return renderService.getJob(jobId);
  }

  listJobs(userId: string): ExportJob[] {
    return renderService.listJobs(userId);
  }

  cancelJob(jobId: string): boolean {
    return renderService.cancelJob(jobId);
  }

  async publishExport(jobId: string, userId: string, targets: PublishTarget[]) {
    const job = renderService.getJob(jobId);
    if (!job || job.status !== 'completed' || !job.outputUrl) return null;
    return publishService.publishToTargets(job.projectId, userId, job.outputUrl, targets);
  }

  getAvailableTargets() {
    return publishService.getAvailableTargets();
  }

  estimateRenderTime(projectId: string, config: ExportConfig): number | null {
    const project = editorService.getProject(projectId);
    if (!project) return null;
    return renderService.estimateRenderTime(project, config);
  }
}

export const exportController = new ExportController();
