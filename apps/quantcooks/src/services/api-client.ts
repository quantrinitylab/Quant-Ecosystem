// ============================================================================
// QuantEdits - Frontend API Client
// ============================================================================
//
// Contract reconciled in P0-2 against the real backend (see the contract
// inventory + api-contract.test.ts, which pins every method below to a Next
// proxy route and a backend endpoint):
// - Project metadata methods speak the backend's server shape
//   (name/type/timestamps), not the editor's local Project model. Editor
//   state has its own full-document surface since P0-5:
//   getProjectState/saveProjectState against GET/PUT /projects/:id/state.
// - Methods whose backend capability does not exist were removed rather than
//   left as dead forwards (the old save method removed in P0-2, applyEffect,
//   removeBackground, upscaleImage, styleTransfer, autoCaption). They return
//   when their real endpoints land (G-11 effects, generation phase).
// - Wrapped backend envelopes ({ templates }, { effects }, …) are unwrapped
//   here so consumers keep receiving plain arrays.

import type { Template, Effect, LayerType, Comment, Collaborator } from '../types';
import type { EditorDocument } from '../types/editor-document';
import { apiFetchRaw } from '@quant/api-client';

const API_BASE = '/api';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    statusCode?: number;
    /** Machine-readable context from server-core's error handler. */
    details?: Record<string, unknown>;
    /**
     * Passthrough for VERSION_CONFLICT (P0-5): the server's current
     * project version, lifted out of `details` by saveProjectState so
     * callers get it typed at the error level. Never thrown — returned.
     */
    currentVersion?: number;
  };
  pagination?: { total: number; page: number; limit: number };
}

// ---------------------------------------------------------------------------
// Server shapes (exactly what the backend returns — do not "prettify" here)
// ---------------------------------------------------------------------------

export type ServerProjectType = 'video' | 'image' | 'audio';

export interface ServerProject {
  id: string;
  userId: string;
  name: string;
  type: ServerProjectType;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/**
 * Full editor state (P0-5): GET /projects/:id/state. `timeline` is the
 * editor's canonical document (src/types/editor-document.ts), stored
 * verbatim backend-side; `duration` at the top level is the document
 * duration with the backend's synthesis rule already applied.
 */
export interface ServerProjectState {
  id: string;
  name: string;
  type: ServerProjectType;
  width: number;
  height: number;
  fps: number;
  duration: number;
  version: number;
  updatedAt: string;
  timeline: EditorDocument;
}

export interface SaveProjectStateInput {
  /** The version the document is based on (optimistic-concurrency gate). */
  version: number;
  timeline: EditorDocument;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ServerLayer {
  id: string;
  projectId: string;
  name: string;
  type: LayerType;
  order: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  startTime: number;
  endTime: number;
  content: unknown;
  transform: unknown;
  effects: unknown;
  keyframes: unknown;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateLayerData {
  name?: string;
  type?: LayerType;
  order?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: string;
  startTime?: number;
  endTime?: number;
  content?: unknown;
  transform?: unknown;
  effects?: unknown;
  keyframes?: unknown;
  parentId?: string | null;
}

export interface ServerAsset {
  id: string;
  projectId: string;
  filename: string;
  type: string;
  size: number;
  uploadedAt: string;
  /** Fresh signed download URL; null while the upload is PENDING. */
  url: string | null;
  uploadStatus: 'PENDING' | 'READY';
  /** Raw object-storage key (internal consumers; never a signed URL). */
  storageKey: string | null;
}

export interface UploadUrlResult {
  uploadUrl: string;
  assetId: string;
  key: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
  maxBytes: number;
}

export type ServerExportFormat = 'mp4' | 'webm' | 'mov' | 'gif' | 'png' | 'jpg';
export type ServerExportResolution = '720p' | '1080p' | '4k' | 'original';
export type ServerExportQuality = 'low' | 'medium' | 'high' | 'lossless';

export interface ServerExportJob {
  id: string;
  projectId: string;
  format: string;
  resolution: string;
  quality: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** Coarse truthful progress (P0-4): 0 QUEUED → 10 → 70 → 100 COMPLETED. */
  progress: number;
  /** Fresh signed URL on COMPLETED responses; null otherwise. */
  outputUrl: string | null;
  /** Failure reason on FAILED jobs; null otherwise. */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type ServerCraftRenderFormat = 'h264' | 'hevc' | 'av1' | 'prores' | 'webm';
export type ServerCraftRenderResolution = 'full' | 'half' | 'third' | 'quarter';
export type ServerCraftRenderQuality = 'best' | 'draft';

export interface ServerCraftRenderJob {
  id: string;
  projectId: string;
  /** CP-1 job kind — constant for this surface. */
  kind: 'CRAFT_RENDER';
  /** Companion id. */
  provider: string;
  comp: string | null;
  format: string;
  resolution: string | null;
  quality: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** The companion binary's real frames-done percent while PROCESSING
   *  (clamped to [10, 99]); 0 QUEUED, 100 COMPLETED. */
  progress: number;
  stage: string | null;
  /** Whole credits recorded for the job. 0 until CP-2 wires the ledger —
   *  `metering` states that on every response; nothing is charged today. */
  creditCost: number;
  metering: 'not_wired';
  /** The rendered output as a real asset row (COMPLETED only). */
  outputAssetId: string | null;
  /** Fresh signed URL on COMPLETED responses; null otherwise. */
  outputUrl: string | null;
  /** Failure reason on FAILED jobs; null otherwise. */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type ServerPhotoOutputFormat = 'png' | 'jpg' | 'webp' | 'psd';

export interface ServerPhotoEditOperation {
  id: string;
  params?: Record<string, unknown>;
}

export interface ServerPhotoEditJob {
  id: string;
  /** Derived from the source asset — outputs land in this project. */
  projectId: string;
  /** CP-1 job kind — constant for this surface. */
  kind: 'PHOTO_EDIT';
  /** Companion id. */
  provider: string;
  sourceAssetId: string;
  outputFormat: string;
  /** The allowlist-validated operations the job runs, in order. */
  operations: ServerPhotoEditOperation[];
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  /** Coarse truthful progress (C-3B): 0 QUEUED → 10 → 70 → 100 COMPLETED.
   *  The one-shot CLI emits no progress stream, so no finer number exists. */
  progress: number;
  stage: string | null;
  /** Whole credits recorded for the job. 0 until CP-2 wires the ledger —
   *  `metering` states that on every response; nothing is charged today. */
  creditCost: number;
  metering: 'not_wired';
  /** The edited output as a real asset row (COMPLETED only). */
  outputAssetId: string | null;
  /** Fresh signed URL on COMPLETED responses; null otherwise. */
  outputUrl: string | null;
  /** Failure reason on FAILED jobs; null otherwise. */
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// CP-1 control plane (backend: backend/tools/*). One registry backs the
// REST surface, the QuantAI bridge and the MCP gateway; these types are
// the REST projections of it.
export interface ServerToolSummary {
  name: string;
  group: string;
  mode: 'sync' | 'async';
  tier: 'A' | 'B';
  permissionTier: 0 | 1 | 2 | 3;
  availability: 'available' | 'not_configured';
  notConfiguredReason?: string;
}

export interface ServerToolDetail extends ServerToolSummary {
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  pricing: Record<string, unknown>;
  notConfiguredCode?: string;
  example: unknown;
}

export interface ServerToolQuote {
  tool: string;
  quoteId: string | null;
  credits?: number;
  perSecondCredits?: number;
  estimatedSeconds?: number;
  expiresAt: string | null;
  paramsHash: string;
  metering?: 'not_wired';
  notConfiguredReason?: string;
}

export interface ServerJob {
  id: string;
  userId: string;
  projectId: string | null;
  kind: string;
  toolName: string;
  provider: string | null;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  stage: string | null;
  creditCost: number;
  metering: 'not_wired';
  /** Credits returned on failure (settle-at-0): the reserved amount when
   *  the job FAILED with a reservation, else 0. Always 0 in CP-1, where
   *  no reservation port is wired. */
  refunded: number;
  outputs: { assetId: string; kind: string; url: string | null }[];
  result: Record<string, unknown> | null;
  error: string | null;
  errorCode?: string;
  createdAt: string;
  completedAt: string | null;
}

// Category vocabularies differ between the UI types and the backend zod
// enums. Translate at this boundary; a UI category with no backend
// counterpart is omitted (sending it would 400), never mistranslated.
const TEMPLATE_CATEGORY_TO_BACKEND: Record<string, string> = {
  'social-media': 'social',
  video: 'youtube',
  ad: 'marketing',
  poster: 'post',
  story: 'story',
};

const EFFECT_CATEGORY_TO_BACKEND: Record<string, string> = {
  filter: 'filters',
  transition: 'transitions',
  'text-effect': 'text',
};

class QuantEditsApiClient {
  private token: string = '';

  setToken(token: string): void {
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const res = await apiFetchRaw(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    // An unparseable body must never throw out of the client. When the
    // backend is unreachable the Next proxy handler itself fails and
    // answers with an EMPTY body, and a bare res.json() rejected with a
    // raw SyntaxError ('Unexpected end of JSON input') that escaped to
    // every caller — it crashed /assets into its error boundary. Mirror
    // @quant/api-client's apiFetch: map the failure to a RETURNED
    // INVALID_RESPONSE envelope. Valid JSON paths are untouched.
    const text = await res.text();
    if (!text) {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Response body was empty',
          statusCode: res.status,
        },
      };
    }
    try {
      return JSON.parse(text) as ApiResponse<T>;
    } catch {
      return {
        success: false,
        error: {
          code: 'INVALID_RESPONSE',
          message: 'Response was not valid JSON',
          statusCode: res.status,
        },
      };
    }
  }

  // Projects (backend: name/type only — the strict update schema rejects
  // any other key, so the payload types below are deliberately narrow)
  async createProject(data: {
    name: string;
    type: ServerProjectType;
  }): Promise<ApiResponse<ServerProject>> {
    return this.request('POST', '/projects', data);
  }
  async listProjects(
    type?: ServerProjectType,
    page?: number,
    pageSize?: number,
  ): Promise<ApiResponse<PaginatedResult<ServerProject>>> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (page) params.set('page', String(page));
    if (pageSize) params.set('pageSize', String(pageSize));
    return this.request('GET', `/projects?${params}`);
  }
  async getProject(id: string): Promise<ApiResponse<ServerProject>> {
    return this.request('GET', `/projects/${id}`);
  }
  async updateProject(
    id: string,
    data: { name?: string; type?: ServerProjectType },
  ): Promise<ApiResponse<ServerProject>> {
    return this.request('PUT', `/projects/${id}`, data);
  }
  async deleteProject(id: string): Promise<ApiResponse<ServerProject>> {
    return this.request('DELETE', `/projects/${id}`);
  }
  // Editor state (P0-5): the full-document save. This is the endpoint the
  // CP-1 tools quantcooks.update_project / quantcooks.set_timeline will
  // eventually call — full document + version is the shape a tool can use.
  async getProjectState(id: string): Promise<ApiResponse<ServerProjectState>> {
    return this.request('GET', `/projects/${id}/state`);
  }
  async saveProjectState(
    id: string,
    data: SaveProjectStateInput,
  ): Promise<ApiResponse<ServerProjectState>> {
    const res = await this.request<ServerProjectState>('PUT', `/projects/${id}/state`, data);
    // request() returns the parsed envelope without throwing, so a 409
    // VERSION_CONFLICT reaches the caller as data: surface the server's
    // currentVersion (sent inside error.details by server-core) at the
    // error level, typed.
    const conflictVersion = res.error?.details?.['currentVersion'];
    if (res.error && typeof conflictVersion === 'number') {
      return { ...res, error: { ...res.error, currentVersion: conflictVersion } };
    }
    return res;
  }

  // Layers
  async listLayers(projectId: string): Promise<ApiResponse<ServerLayer[]>> {
    return this.request('GET', `/projects/${projectId}/layers`);
  }
  async addLayer(
    projectId: string,
    data: { name: string; type: LayerType; content?: unknown },
  ): Promise<ApiResponse<ServerLayer>> {
    return this.request('POST', `/projects/${projectId}/layers`, data);
  }
  async updateLayer(
    projectId: string,
    layerId: string,
    data: UpdateLayerData,
  ): Promise<ApiResponse<ServerLayer>> {
    return this.request('PUT', `/projects/${projectId}/layers/${layerId}`, data);
  }
  async deleteLayer(projectId: string, layerId: string): Promise<ApiResponse<ServerLayer>> {
    return this.request('DELETE', `/projects/${projectId}/layers/${layerId}`);
  }
  async duplicateLayer(projectId: string, layerId: string): Promise<ApiResponse<ServerLayer>> {
    return this.request('POST', `/projects/${projectId}/layers/${layerId}/duplicate`);
  }
  async reorderLayers(
    projectId: string,
    layerIds: string[],
  ): Promise<ApiResponse<ServerLayer[]>> {
    return this.request('PUT', `/projects/${projectId}/layers/reorder`, { layerIds });
  }

  // Templates (backend wraps payloads: data: { templates } / { template } /
  // { draft } — unwrapped here)
  async listTemplates(category?: string, search?: string): Promise<ApiResponse<Template[]>> {
    const params = new URLSearchParams();
    const backendCategory = category ? TEMPLATE_CATEGORY_TO_BACKEND[category] : undefined;
    if (backendCategory) params.set('category', backendCategory);
    if (search) params.set('search', search);
    const res = await this.request<{ templates: Template[] }>('GET', `/templates?${params}`);
    return { success: res.success, error: res.error, data: res.data?.templates };
  }
  async getTemplate(id: string): Promise<ApiResponse<Template>> {
    const res = await this.request<{ template: Template }>('GET', `/templates/${id}`);
    return { success: res.success, error: res.error, data: res.data?.template };
  }
  async applyTemplate(id: string, name?: string): Promise<ApiResponse<any>> {
    return this.request('POST', `/templates/${id}/apply`, name ? { name } : {});
  }

  // Effects (catalogue is read-only until generation-time application, G-11)
  async listEffects(category?: string): Promise<ApiResponse<Effect[]>> {
    const backendCategory = category ? EFFECT_CATEGORY_TO_BACKEND[category] : undefined;
    const params = new URLSearchParams();
    if (backendCategory) params.set('category', backendCategory);
    const res = await this.request<{ effects: Effect[] }>('GET', `/effects?${params}`);
    return { success: res.success, error: res.error, data: res.data?.effects };
  }

  // Assets. Upload is three steps (P0-3): requestUploadUrl creates the
  // PENDING asset row and returns a signed PUT URL; the client PUTs the
  // bytes directly to object storage; completeUpload verifies the landed
  // bytes and marks the asset READY. registerAsset remains the
  // metadata-only create for records without a byte upload.
  async listAssets(
    category?: string,
    search?: string,
    projectId?: string,
  ): Promise<ApiResponse<ServerAsset[]>> {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (search) params.set('search', search);
    if (projectId) params.set('projectId', projectId);
    return this.request('GET', `/assets?${params}`);
  }
  async requestUploadUrl(data: {
    projectId: string;
    filename: string;
    contentType: string;
    size: number;
  }): Promise<ApiResponse<UploadUrlResult>> {
    return this.request('POST', '/assets/upload', data);
  }
  async completeUpload(assetId: string): Promise<ApiResponse<ServerAsset>> {
    return this.request('POST', `/assets/${assetId}/complete`);
  }
  async registerAsset(data: {
    projectId: string;
    filename: string;
    type: string;
    size: number;
  }): Promise<ApiResponse<ServerAsset>> {
    return this.request('POST', '/assets', data);
  }
  async deleteAsset(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/assets/${id}`);
  }

  // Export (plural /exports — the contract the export UI already uses)
  async startExport(
    projectId: string,
    config: {
      format: ServerExportFormat;
      resolution: ServerExportResolution;
      quality: ServerExportQuality;
    },
  ): Promise<ApiResponse<ServerExportJob>> {
    return this.request('POST', '/exports', { projectId, ...config });
  }
  async getExportJob(jobId: string): Promise<ApiResponse<ServerExportJob>> {
    return this.request('GET', `/exports/${jobId}/status`);
  }
  async cancelExport(jobId: string): Promise<ApiResponse<ServerExportJob>> {
    return this.request('POST', `/exports/${jobId}/cancel`);
  }

  // Craft renders (C-2, EffectCraft companion; CP-1 job kind CRAFT_RENDER).
  // Create refuses 503 CRAFT_NOT_CONFIGURED when the companion binary is not
  // configured on the backend — the error passes through untouched.
  async createCraftRender(data: {
    projectId: string;
    ecproj: Record<string, unknown>;
    comp?: string;
    format?: ServerCraftRenderFormat;
    resolution?: ServerCraftRenderResolution;
    quality?: ServerCraftRenderQuality;
    startSec?: number;
    endSec?: number;
  }): Promise<ApiResponse<ServerCraftRenderJob>> {
    return this.request('POST', '/craft/effects/render', data);
  }
  async getCraftRender(jobId: string): Promise<ApiResponse<ServerCraftRenderJob>> {
    return this.request('GET', `/craft/effects/renders/${jobId}`);
  }
  async listCraftRenders(projectId?: string): Promise<ApiResponse<ServerCraftRenderJob[]>> {
    const params = projectId ? `projectId=${encodeURIComponent(projectId)}` : '';
    return this.request('GET', `/craft/effects/renders?${params}`);
  }

  // Photo edits (C-3B, PhotoCraft companion; CP-1 job kind PHOTO_EDIT).
  // Create refuses 503 PHOTO_NOT_CONFIGURED when the companion binary is
  // not configured on the backend, and 400 INVALID_OPERATIONS for an
  // operation outside the verified allowlist — errors pass through.
  async createPhotoEdit(data: {
    sourceAssetId: string;
    operations: ServerPhotoEditOperation[];
    outputFormat?: ServerPhotoOutputFormat;
  }): Promise<ApiResponse<ServerPhotoEditJob>> {
    return this.request('POST', '/photo/edits', data);
  }
  async getPhotoEdit(jobId: string): Promise<ApiResponse<ServerPhotoEditJob>> {
    return this.request('GET', `/photo/edits/${jobId}`);
  }
  async listPhotoEdits(projectId?: string): Promise<ApiResponse<ServerPhotoEditJob[]>> {
    const params = projectId ? `projectId=${encodeURIComponent(projectId)}` : '';
    return this.request('GET', `/photo/edits?${params}`);
  }

  // AI (only the two capabilities the backend actually implements, plus the
  // auto-edit pipeline at its real location — /auto-edit, not /ai)
  async suggestTitles(data: {
    description: string;
    platform?: 'youtube' | 'tiktok' | 'instagram' | 'general';
    count?: number;
  }): Promise<ApiResponse<{ titles: string[] }>> {
    return this.request('POST', '/ai/suggest', data);
  }
  async autoEdit(data: {
    sourceRef?: string;
    templateId?: string;
    caption?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('POST', '/auto-edit/run', data);
  }

  // Brand Kits
  async listBrandKits(): Promise<ApiResponse<any[]>> {
    return this.request('GET', '/brand-kits');
  }
  async getBrandKit(id: string): Promise<ApiResponse<any>> {
    return this.request('GET', `/brand-kits/${id}`);
  }
  async createBrandKit(data: { name: string }): Promise<ApiResponse<any>> {
    return this.request('POST', '/brand-kits', data);
  }
  async updateBrandKit(
    id: string,
    data: {
      name?: string;
      isDefault?: boolean;
      colors?: Record<string, string>;
      fonts?: { heading?: string; body?: string; accent?: string };
      logos?: { id: string; url: string; variant: string }[];
    },
  ): Promise<ApiResponse<any>> {
    return this.request('PUT', `/brand-kits/${id}`, data);
  }
  async deleteBrandKit(id: string): Promise<ApiResponse<void>> {
    return this.request('DELETE', `/brand-kits/${id}`);
  }
  async applyBrandKit(
    id: string,
    elements: unknown[],
  ): Promise<ApiResponse<{ applied: number; skipped: number }>> {
    return this.request('POST', `/brand-kits/${id}/apply`, { elements });
  }
  async checkBrandConsistency(id: string, elements: unknown[]): Promise<ApiResponse<any[]>> {
    return this.request('POST', `/brand-kits/${id}/check-consistency`, { elements });
  }

  // Collaboration
  async inviteCollaborator(
    projectId: string,
    userId: string,
    role: string,
  ): Promise<ApiResponse<Collaborator>> {
    return this.request('POST', `/collaboration/${projectId}/invite`, { userId, role });
  }
  async getCollaborators(projectId: string): Promise<ApiResponse<Collaborator[]>> {
    return this.request('GET', `/collaboration/${projectId}/members`);
  }
  async addComment(
    projectId: string,
    content: string,
    layerId?: string,
    position?: { x: number; y: number },
  ): Promise<ApiResponse<Comment>> {
    return this.request('POST', `/collaboration/${projectId}/comments`, {
      content,
      layerId,
      position,
    });
  }
  async getComments(projectId: string): Promise<ApiResponse<Comment[]>> {
    return this.request('GET', `/collaboration/${projectId}/comments`);
  }

  // Tools (CP-1 control plane)
  async listTools(): Promise<ApiResponse<{ tools: ServerToolSummary[] }>> {
    return this.request('GET', '/tools');
  }
  async getTool(name: string): Promise<ApiResponse<ServerToolDetail>> {
    return this.request('GET', `/tools/${name}`);
  }
  async quoteTool(
    name: string,
    params: Record<string, unknown>,
  ): Promise<ApiResponse<ServerToolQuote>> {
    return this.request('POST', `/tools/${name}/quote`, params);
  }
  async invokeTool(
    name: string,
    data: { params: Record<string, unknown>; quoteId?: string; idempotencyKey?: string },
  ): Promise<ApiResponse<Record<string, unknown>>> {
    return this.request('POST', `/tools/${name}/invoke`, data);
  }

  // Jobs (CP-1 unified job reads)
  async listJobs(filters?: {
    projectId?: string;
    kind?: string;
    status?: string;
  }): Promise<ApiResponse<{ jobs: ServerJob[] }>> {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.kind) params.set('kind', filters.kind);
    if (filters?.status) params.set('status', filters.status);
    return this.request('GET', `/jobs?${params}`);
  }
  async getJob(id: string): Promise<ApiResponse<{ job: ServerJob }>> {
    return this.request('GET', `/jobs/${id}`);
  }
  async cancelJob(id: string): Promise<ApiResponse<{ job: ServerJob }>> {
    return this.request('POST', `/jobs/${id}/cancel`);
  }
}

export const apiClient = new QuantEditsApiClient();
export default apiClient;
