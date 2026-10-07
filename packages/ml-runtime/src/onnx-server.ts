// ============================================================================
// ONNX Server Runtime - Server-side inference with onnxruntime-node
// ============================================================================

import { z } from 'zod';

// ONNX Runtime backend interface for dependency injection
export interface OnnxBackend {
  createSession(modelPath: string, options?: SessionOptions): Promise<OnnxSession>;
  createSessionFromBuffer(buffer: ArrayBuffer, options?: SessionOptions): Promise<OnnxSession>;
}

export interface OnnxSession {
  run(feeds: Record<string, OnnxTensor>): Promise<Record<string, OnnxTensor>>;
  dispose(): void;
  inputNames: string[];
  outputNames: string[];
}

export interface OnnxTensor {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: number[];
  type: TensorType;
}

export type TensorType = 'float32' | 'int32' | 'int64' | 'uint8' | 'bool' | 'string';

export interface SessionOptions {
  executionProviders?: ExecutionProvider[];
  graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  enableCpuMemArena?: boolean;
  enableMemPattern?: boolean;
  interOpNumThreads?: number;
  intraOpNumThreads?: number;
}

export type ExecutionProvider = 'cpu' | 'cuda' | 'tensorrt' | 'coreml' | 'directml';

export const ServerRuntimeConfigSchema = z.object({
  executionProviders: z
    .array(z.enum(['cpu', 'cuda', 'tensorrt', 'coreml', 'directml']))
    .default(['cpu']),
  graphOptimizationLevel: z.enum(['disabled', 'basic', 'extended', 'all']).default('all'),
  interOpNumThreads: z.number().int().positive().default(4),
  intraOpNumThreads: z.number().int().positive().default(4),
  enableCpuMemArena: z.boolean().default(true),
  enableMemPattern: z.boolean().default(true),
  warmUpRuns: z.number().int().min(0).default(3),
});

export type ServerRuntimeConfig = z.infer<typeof ServerRuntimeConfigSchema>;

export interface InferenceResult {
  outputs: Record<string, Float32Array>;
  latencyMs: number;
  modelName: string;
}

export class OnnxServerRuntime {
  private session: OnnxSession | null = null;
  private modelName: string = '';
  private isWarmedUp: boolean = false;
  private readonly config: ServerRuntimeConfig;
  private readonly backend: OnnxBackend;

  constructor(backend: OnnxBackend, config?: Partial<ServerRuntimeConfig>) {
    this.config = ServerRuntimeConfigSchema.parse(config ?? {});
    this.backend = backend;
  }

  async loadModel(modelPath: string): Promise<void> {
    if (this.session) {
      this.session.dispose();
    }

    const options: SessionOptions = {
      executionProviders: this.config.executionProviders,
      graphOptimizationLevel: this.config.graphOptimizationLevel,
      enableCpuMemArena: this.config.enableCpuMemArena,
      enableMemPattern: this.config.enableMemPattern,
      interOpNumThreads: this.config.interOpNumThreads,
      intraOpNumThreads: this.config.intraOpNumThreads,
    };

    this.session = await this.backend.createSession(modelPath, options);
    this.modelName = modelPath.split('/').pop() ?? modelPath;
    this.isWarmedUp = false;
  }

  async loadModelFromBuffer(buffer: ArrayBuffer): Promise<void> {
    if (this.session) {
      this.session.dispose();
    }

    const options: SessionOptions = {
      executionProviders: this.config.executionProviders,
      graphOptimizationLevel: this.config.graphOptimizationLevel,
      enableCpuMemArena: this.config.enableCpuMemArena,
      enableMemPattern: this.config.enableMemPattern,
      interOpNumThreads: this.config.interOpNumThreads,
      intraOpNumThreads: this.config.intraOpNumThreads,
    };

    this.session = await this.backend.createSessionFromBuffer(buffer, options);
    this.modelName = 'buffer-model';
    this.isWarmedUp = false;
  }

  async run(inputs: Record<string, Float32Array>): Promise<InferenceResult> {
    if (!this.session) {
      throw new Error('No model loaded. Call loadModel() first.');
    }

    const feeds: Record<string, OnnxTensor> = {};
    for (const [name, data] of Object.entries(inputs)) {
      feeds[name] = {
        data,
        dims: [1, data.length],
        type: 'float32',
      };
    }

    const start = performance.now();
    const rawOutputs = await this.session.run(feeds);
    const latencyMs = performance.now() - start;

    const outputs: Record<string, Float32Array> = {};
    for (const [name, tensor] of Object.entries(rawOutputs)) {
      outputs[name] =
        tensor.data instanceof Float32Array
          ? tensor.data
          : new Float32Array(tensor.data as ArrayLike<number>);
    }

    return {
      outputs,
      latencyMs,
      modelName: this.modelName,
    };
  }

  async warmUp(): Promise<void> {
    if (!this.session) {
      throw new Error('No model loaded. Call loadModel() first.');
    }

    const inputNames = this.session.inputNames;
    const dummyInputs: Record<string, Float32Array> = {};

    for (const name of inputNames) {
      dummyInputs[name] = new Float32Array(64).fill(0);
    }

    for (let i = 0; i < this.config.warmUpRuns; i++) {
      await this.run(dummyInputs);
    }

    this.isWarmedUp = true;
  }

  dispose(): void {
    if (this.session) {
      this.session.dispose();
      this.session = null;
    }
    this.isWarmedUp = false;
    this.modelName = '';
  }

  getModelName(): string {
    return this.modelName;
  }

  isModelLoaded(): boolean {
    return this.session !== null;
  }

  isReady(): boolean {
    return this.session !== null && this.isWarmedUp;
  }

  getInputNames(): string[] {
    if (!this.session) {
      throw new Error('No model loaded. Call loadModel() first.');
    }
    return this.session.inputNames;
  }

  getOutputNames(): string[] {
    if (!this.session) {
      throw new Error('No model loaded. Call loadModel() first.');
    }
    return this.session.outputNames;
  }
}
