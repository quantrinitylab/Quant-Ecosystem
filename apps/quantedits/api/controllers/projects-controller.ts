// ============================================================================
// QuantEdits - Projects Controller
// Business logic for project management
// ============================================================================

import { editorService } from '../services/editor-service';
import type { Project, Layer, LayerType } from '../../src/types';

export class ProjectsController {
  createProject(userId: string, title: string, type: Project['type'], width: number, height: number, fps?: number, duration?: number): Project {
    return editorService.createProject(userId, { title, type, width, height, fps, duration });
  }

  getProject(projectId: string): Project | null {
    return editorService.getProject(projectId);
  }

  updateProject(projectId: string, updates: Partial<Project>): Project | null {
    return editorService.updateProject(projectId, updates);
  }

  deleteProject(projectId: string): boolean {
    return editorService.deleteProject(projectId);
  }

  listProjects(userId: string, type?: string, page?: number, limit?: number) {
    return editorService.listProjects(userId, { type, page, limit });
  }

  addLayer(projectId: string, name: string, type: LayerType, content: Layer['content']): Layer | null {
    return editorService.addLayer(projectId, { name, type, content });
  }

  removeLayer(projectId: string, layerId: string): boolean {
    return editorService.removeLayer(projectId, layerId);
  }

  updateLayer(projectId: string, layerId: string, updates: Partial<Layer>): Layer | null {
    return editorService.updateLayer(projectId, layerId, updates);
  }

  duplicateLayer(projectId: string, layerId: string): Layer | null {
    return editorService.duplicateLayer(projectId, layerId);
  }

  reorderLayers(projectId: string, layerIds: string[]): boolean {
    return editorService.reorderLayers(projectId, layerIds);
  }

  autoSave(projectId: string) {
    return editorService.autoSave(projectId);
  }
}

export const projectsController = new ProjectsController();
