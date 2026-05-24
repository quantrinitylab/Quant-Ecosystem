// ============================================================================
// QuantEdits - Frontend API Client
// ============================================================================

import type { Project, Layer, Template, Effect, Asset, ExportConfig, ExportJob, AIEditRequest, AIEditResult, Comment, Collaborator } from '../types';

const API_BASE = '/api';

interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string }; pagination?: { total: number; page: number; limit: number } }

class QuantEditsApiClient {
  private token: string = '';

  setToken(token: string): void { this.token = token; }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }

  // Projects
  async createProject(data: { title: string; type: string; width: number; height: number; fps?: number; duration?: number }): Promise<ApiResponse<Project>> {
    return this.request('POST', '/projects', data);
  }
  async listProjects(type?: string, page?: number): Promise<ApiResponse<Project[]>> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (page) params.set('page', String(page));
    return this.request('GET', `/projects?${params}`);
  }
  async getProject(id: string): Promise<ApiResponse<Project>> { return this.request('GET', `/projects/${id}`); }
  async updateProject(id: string, data: Partial<Project>): Promise<ApiResponse<Project>> { return this.request('PUT', `/projects/${id}`, data); }
  async deleteProject(id: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/projects/${id}`); }
  async autoSave(id: string): Promise<ApiResponse<{ version: number; savedAt: string }>> { return this.request('POST', `/projects/${id}/autosave`); }

  // Layers
  async addLayer(projectId: string, data: { name: string; type: string; content: any }): Promise<ApiResponse<Layer>> {
    return this.request('POST', `/projects/${projectId}/layers`, data);
  }
  async updateLayer(projectId: string, layerId: string, data: Partial<Layer>): Promise<ApiResponse<Layer>> {
    return this.request('PUT', `/projects/${projectId}/layers/${layerId}`, data);
  }
  async deleteLayer(projectId: string, layerId: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/projects/${projectId}/layers/${layerId}`);
  }
  async duplicateLayer(projectId: string, layerId: string): Promise<ApiResponse<Layer>> {
    return this.request('POST', `/projects/${projectId}/layers/${layerId}/duplicate`);
  }

  // Templates
  async listTemplates(category?: string, search?: string): Promise<ApiResponse<Template[]>> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    return this.request('GET', `/templates?${params}`);
  }
  async getTemplate(id: string): Promise<ApiResponse<Template>> { return this.request('GET', `/templates/${id}`); }
  async applyTemplate(id: string, variables: Record<string, string>): Promise<ApiResponse<any>> {
    return this.request('POST', `/templates/${id}/apply`, { variables });
  }

  // Effects
  async listEffects(category?: string): Promise<ApiResponse<Effect[]>> {
    const params = category ? `?category=${category}` : '';
    return this.request('GET', `/effects${params}`);
  }
  async applyEffect(effectId: string, params: Record<string, unknown>, intensity?: number): Promise<ApiResponse<any>> {
    return this.request('POST', `/effects/${effectId}/apply`, { params, intensity });
  }

  // Assets
  async listAssets(category?: string, search?: string): Promise<ApiResponse<Asset[]>> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    return this.request('GET', `/assets?${params}`);
  }
  async uploadAsset(data: { name: string; category: string; format: string; size: number; tags?: string[] }): Promise<ApiResponse<Asset>> {
    return this.request('POST', '/assets/upload', data);
  }

  // Export
  async startExport(projectId: string, config: ExportConfig): Promise<ApiResponse<ExportJob>> {
    return this.request('POST', '/export', { projectId, ...config });
  }
  async getExportJob(jobId: string): Promise<ApiResponse<ExportJob>> { return this.request('GET', `/export/${jobId}`); }
  async cancelExport(jobId: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/export/${jobId}`); }

  // AI
  async removeBackground(imageUrl: string): Promise<ApiResponse<AIEditResult>> { return this.request('POST', '/ai/background-removal', { imageUrl }); }
  async upscaleImage(imageUrl: string, scale: number): Promise<ApiResponse<AIEditResult>> { return this.request('POST', '/ai/upscale', { imageUrl, scale }); }
  async styleTransfer(imageUrl: string, style: string): Promise<ApiResponse<AIEditResult>> { return this.request('POST', '/ai/style-transfer', { imageUrl, style }); }
  async autoCaption(videoUrl: string, language?: string): Promise<ApiResponse<AIEditResult>> { return this.request('POST', '/ai/auto-caption', { videoUrl, language }); }
  async autoEdit(projectId: string, prompt: string): Promise<ApiResponse<AIEditResult>> { return this.request('POST', '/ai/auto-edit', { projectId, prompt }); }

  // Collaboration
  async inviteCollaborator(projectId: string, userId: string, role: string): Promise<ApiResponse<Collaborator>> {
    return this.request('POST', `/collaboration/${projectId}/invite`, { userId, role });
  }
  async getCollaborators(projectId: string): Promise<ApiResponse<Collaborator[]>> { return this.request('GET', `/collaboration/${projectId}/members`); }
  async addComment(projectId: string, content: string, layerId?: string, position?: { x: number; y: number }): Promise<ApiResponse<Comment>> {
    return this.request('POST', `/collaboration/${projectId}/comments`, { content, layerId, position });
  }
  async getComments(projectId: string): Promise<ApiResponse<Comment[]>> { return this.request('GET', `/collaboration/${projectId}/comments`); }
}

export const apiClient = new QuantEditsApiClient();
export default apiClient;
