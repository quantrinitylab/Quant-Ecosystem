// ============================================================================
// Triton Client - Type Definitions (Triton Inference Server HTTP/REST Protocol v2)
// ============================================================================

import { z } from 'zod';

/** Tensor data types supported by Triton */
export type TensorDataType =
  | 'BOOL'
  | 'UINT8'
  | 'UINT16'
  | 'UINT32'
  | 'UINT64'
  | 'INT8'
  | 'INT16'
  | 'INT32'
  | 'INT64'
  | 'FP16'
  | 'FP32'
  | 'FP64'
  | 'BYTES';

/** Tensor data for inference request/response */
export interface TensorData {
  name: string;
  shape: number[];
  datatype: TensorDataType;
  data: number[] | string[];
}

/** Parameters for inference requests */
export interface InferParameters {
  [key: string]: string | number | boolean;
}

/** Inference request body (Triton v2 protocol) */
export interface InferRequest {
  id?: string;
  inputs: TensorData[];
  outputs?: InferRequestOutput[];
  parameters?: InferParameters;
}

/** Requested output in inference request */
export interface InferRequestOutput {
  name: string;
  parameters?: InferParameters;
}

/** Inference response body (Triton v2 protocol) */
export interface InferResponse {
  id: string;
  model_name: string;
  model_version: string;
  outputs: TensorData[];
  parameters?: InferParameters;
}

/** Model metadata response */
export interface ModelMetadata {
  name: string;
  versions: string[];
  platform: string;
  inputs: TensorMetadata[];
  outputs: TensorMetadata[];
}

/** Tensor metadata (input/output spec) */
export interface TensorMetadata {
  name: string;
  datatype: TensorDataType;
  shape: number[];
}

/** Server health response */
export interface ServerHealthResponse {
  live: boolean;
  ready: boolean;
}

/** Model readiness status */
export interface ModelReadyResponse {
  ready: boolean;
}

/** Server metadata */
export interface ServerMetadata {
  name: string;
  version: string;
  extensions: string[];
}

// ---------------------------------------------------------------------------
// Zod Validation Schemas
// ---------------------------------------------------------------------------

export const TensorDataTypeSchema = z.enum([
  'BOOL',
  'UINT8',
  'UINT16',
  'UINT32',
  'UINT64',
  'INT8',
  'INT16',
  'INT32',
  'INT64',
  'FP16',
  'FP32',
  'FP64',
  'BYTES',
]);

export const TensorDataSchema = z.object({
  name: z.string(),
  shape: z.array(z.number()),
  datatype: TensorDataTypeSchema,
  data: z.array(z.union([z.number(), z.string()])),
});

export const InferRequestSchema = z.object({
  id: z.string().optional(),
  inputs: z.array(TensorDataSchema),
  outputs: z
    .array(
      z.object({
        name: z.string(),
        parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      }),
    )
    .optional(),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const InferResponseSchema = z.object({
  id: z.string(),
  model_name: z.string(),
  model_version: z.string(),
  outputs: z.array(TensorDataSchema),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

export const ModelMetadataSchema = z.object({
  name: z.string(),
  versions: z.array(z.string()),
  platform: z.string(),
  inputs: z.array(
    z.object({
      name: z.string(),
      datatype: TensorDataTypeSchema,
      shape: z.array(z.number()),
    }),
  ),
  outputs: z.array(
    z.object({
      name: z.string(),
      datatype: TensorDataTypeSchema,
      shape: z.array(z.number()),
    }),
  ),
});

export const ServerHealthResponseSchema = z.object({
  live: z.boolean(),
  ready: z.boolean(),
});

export const ServerMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  extensions: z.array(z.string()),
});
