// ============================================================================
// QuantAI - Frontend API Client
// ============================================================================

import type { Conversation, ConversationMessage, Device, DeviceCommand, Automation, AIModel, TrainingJob, EcosystemApp, AnalyticsData, Plugin, AssistantPersonality } from '../types';

const API_BASE = '/api';
interface ApiResponse<T> { success: boolean; data?: T; error?: { code: string; message: string } }

class QuantAIApiClient {
  private token: string = '';
  setToken(token: string): void { this.token = token; }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }

  // Assistant
  async chat(message: string, conversationId?: string, attachments?: any[]): Promise<ApiResponse<{ conversation: Conversation; response: ConversationMessage }>> { return this.request('POST', '/assistant/chat', { message, conversationId, attachments }); }
  async listConversations(): Promise<ApiResponse<Conversation[]>> { return this.request('GET', '/assistant/conversations'); }
  async deleteConversation(id: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/assistant/conversations/${id}`); }
  async updatePersonality(personality: Partial<AssistantPersonality>): Promise<ApiResponse<any>> { return this.request('PUT', '/assistant/personality', personality); }

  // Devices
  async registerDevice(data: any): Promise<ApiResponse<Device>> { return this.request('POST', '/devices', data); }
  async listDevices(): Promise<ApiResponse<Device[]>> { return this.request('GET', '/devices'); }
  async sendCommand(deviceId: string, type: string, params: any): Promise<ApiResponse<DeviceCommand>> { return this.request('POST', `/devices/${deviceId}/command`, { type, params }); }
  async readScreen(deviceId: string): Promise<ApiResponse<any>> { return this.request('GET', `/devices/${deviceId}/screen`); }

  // Automation
  async createAutomation(data: any): Promise<ApiResponse<Automation>> { return this.request('POST', '/automations', data); }
  async listAutomations(): Promise<ApiResponse<Automation[]>> { return this.request('GET', '/automations'); }
  async toggleAutomation(id: string): Promise<ApiResponse<any>> { return this.request('POST', `/automations/${id}/toggle`); }
  async executeAutomation(id: string): Promise<ApiResponse<any>> { return this.request('POST', `/automations/${id}/execute`); }
  async deleteAutomation(id: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/automations/${id}`); }

  // Models
  async listModels(): Promise<ApiResponse<AIModel[]>> { return this.request('GET', '/models'); }
  async compareModels(ids: string[]): Promise<ApiResponse<any>> { return this.request('POST', '/models/compare', { modelIds: ids }); }

  // Training
  async startTraining(data: any): Promise<ApiResponse<TrainingJob>> { return this.request('POST', '/training', data); }
  async listTrainingJobs(): Promise<ApiResponse<TrainingJob[]>> { return this.request('GET', '/training'); }
  async cancelTraining(id: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/training/${id}`); }

  // Ecosystem
  async listEcosystemApps(): Promise<ApiResponse<EcosystemApp[]>> { return this.request('GET', '/ecosystem/apps'); }
  async toggleAppAI(appId: string): Promise<ApiResponse<EcosystemApp>> { return this.request('POST', `/ecosystem/apps/${appId}/toggle-ai`); }
  async updateAppConfig(appId: string, config: any): Promise<ApiResponse<EcosystemApp>> { return this.request('PUT', `/ecosystem/apps/${appId}/config`, config); }

  // Analytics
  async getAnalytics(): Promise<ApiResponse<AnalyticsData>> { return this.request('GET', '/analytics'); }

  // Plugins
  async listPlugins(): Promise<ApiResponse<Plugin[]>> { return this.request('GET', '/plugins'); }
  async installPlugin(id: string): Promise<ApiResponse<void>> { return this.request('POST', `/plugins/${id}/install`); }
  async uninstallPlugin(id: string): Promise<ApiResponse<void>> { return this.request('DELETE', `/plugins/${id}/uninstall`); }
}

export const apiClient = new QuantAIApiClient();
export default apiClient;
