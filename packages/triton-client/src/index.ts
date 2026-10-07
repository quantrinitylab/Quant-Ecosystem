// ============================================================================
// Triton Client Package - Barrel Export
// ============================================================================

export { TritonInferenceClient, TritonClientError } from './triton-http-client';
export type { TritonTransport, TransportResponse, TritonClientConfig } from './triton-http-client';

export { ModelRegistry } from './triton-model-registry';
export type { RegisteredModel, RegisterModelOptions } from './triton-model-registry';

export type {
  TensorDataType,
  TensorData,
  InferParameters,
  InferRequest,
  InferRequestOutput,
  InferResponse,
  ModelMetadata,
  TensorMetadata,
  ServerHealthResponse,
  ModelReadyResponse,
  ServerMetadata,
} from './types';

export {
  TensorDataTypeSchema,
  TensorDataSchema,
  InferRequestSchema,
  InferResponseSchema,
  ModelMetadataSchema,
  ServerHealthResponseSchema,
  ServerMetadataSchema,
} from './types';
