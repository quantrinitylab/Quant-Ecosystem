// ============================================================================
// Triton HTTP Client - Interface-based Triton Inference Server client
// ============================================================================

import type {
  InferRequest,
  InferResponse,
  ModelMetadata,
  ServerHealthResponse,
  ServerMetadata,
} from './types';
import { InferResponseSchema, ModelMetadataSchema, ServerMetadataSchema } from './types';

/** Transport interface for dependency injection / mocking */
export interface TritonTransport {
  post(url: string, body: unknown): Promise<TransportResponse>;
  get(url: string): Promise<TransportResponse>;
}

/** Transport response shape */
export interface TransportResponse {
  status: number;
  data: unknown;
}

/** Configuration for the Triton client */
export interface TritonClientConfig {
  baseUrl: string;
  timeout?: number;
}

/** Error thrown by the Triton client on protocol/transport failures */
export class TritonClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly modelName?: string,
  ) {
    super(message);
    this.name = 'TritonClientError';
  }
}

/** Triton Inference Server HTTP client (v2 protocol) */
export class TritonInferenceClient {
  private readonly transport: TritonTransport;
  private readonly baseUrl: string;

  constructor(transport: TritonTransport, config: TritonClientConfig) {
    this.transport = transport;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  /** Run inference on a model */
  async infer(
    modelName: string,
    request: InferRequest,
    modelVersion?: string,
  ): Promise<InferResponse> {
    const versionPath = modelVersion ? `/versions/${modelVersion}` : '';
    const url = `${this.baseUrl}/v2/models/${modelName}${versionPath}/infer`;

    const response = await this.transport.post(url, request);

    if (response.status !== 200) {
      throw new TritonClientError(
        `Inference failed for model '${modelName}': status ${response.status}`,
        response.status,
        modelName,
      );
    }

    return InferResponseSchema.parse(response.data) as unknown as InferResponse;
  }

  /** Get model metadata (input/output shapes, versions) */
  async getModelMetadata(modelName: string, modelVersion?: string): Promise<ModelMetadata> {
    const versionPath = modelVersion ? `/versions/${modelVersion}` : '';
    const url = `${this.baseUrl}/v2/models/${modelName}${versionPath}`;

    const response = await this.transport.get(url);

    if (response.status !== 200) {
      throw new TritonClientError(
        `Failed to get metadata for model '${modelName}': status ${response.status}`,
        response.status,
        modelName,
      );
    }

    return ModelMetadataSchema.parse(response.data);
  }

  /** Check if the server is live and ready */
  async getServerHealth(): Promise<ServerHealthResponse> {
    const [liveResp, readyResp] = await Promise.all([
      this.transport.get(`${this.baseUrl}/v2/health/live`),
      this.transport.get(`${this.baseUrl}/v2/health/ready`),
    ]);

    return {
      live: liveResp.status === 200,
      ready: readyResp.status === 200,
    };
  }

  /** Check if a specific model is ready for inference */
  async isModelReady(modelName: string, modelVersion?: string): Promise<boolean> {
    const versionPath = modelVersion ? `/versions/${modelVersion}` : '';
    const url = `${this.baseUrl}/v2/models/${modelName}${versionPath}/ready`;

    const response = await this.transport.get(url);
    return response.status === 200;
  }

  /** Get server metadata (name, version, extensions) */
  async getServerMetadata(): Promise<ServerMetadata> {
    const response = await this.transport.get(`${this.baseUrl}/v2`);

    if (response.status !== 200) {
      throw new TritonClientError(
        `Failed to get server metadata: status ${response.status}`,
        response.status,
      );
    }

    return ServerMetadataSchema.parse(response.data);
  }
}
