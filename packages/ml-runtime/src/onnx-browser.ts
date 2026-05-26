// ============================================================================
// ONNX Browser Runtime - Browser-side inference with WebGPU/WASM
// ============================================================================

import { z } from 'zod';
import type { OnnxBackend, OnnxSession, OnnxTensor, SessionOptions } from './onnx-server';

export type BrowserExecutionProvider = 'webgpu' | 'wasm' | 'cpu' | 'webgl';

export const BrowserRuntimeConfigSchema = z.object({
  preferredProviders: z
    .array(z.enum(['webgpu', 'wasm', 'cpu', 'webgl']))
    .default(['webgpu', 'wasm', 'cpu']),
  wasmNumThreads: z.number().int().positive().default(4),
  wasmSimd: z.boolean().default(true),
  enableGraphCapture: z.boolean().default(false),
  cachePath: z.string().optional(),
  warmUpRuns: z.number().int().min(0).default(2),
});

export type BrowserRuntimeConfig = z.infer<typeof BrowserRuntimeConfigSchema>;

export interface BrowserCapabilities {
  webgpu: boolean;
  wasm: boolean;
  wasmSimd: boolean;
  wasmThreads: boolean;
  webgl: boolean;
}

export interface BrowserInferenceResult {
  outputs: Record<string, Float32Array>;
  latencyMs: number;
  provider: BrowserExecutionProvider;
  modelName: string;
}

export class OnnxBrowserRuntime {
  private session: OnnxSession | null = null;
  private modelName: string = '';
  private activeProvider: BrowserExecutionProvider = 'cpu';
  private isWarmedUp: boolean = false;
  private readonly config: BrowserRuntimeConfig;
  private readonly backend: OnnxBackend;
  private capabilities: BrowserCapabilities;

  constructor(
    backend: OnnxBackend,
    config?: Partial<BrowserRuntimeConfig>,
    capabilities?: Partial<BrowserCapabilities>,
  ) {
    this.config = BrowserRuntimeConfigSchema.parse(config ?? {});
    this.backend = backend;
    this.capabilities = {
      webgpu: capabilities?.webgpu ?? false,
      wasm: capabilities?.wasm ?? true,
      wasmSimd: capabilities?.wasmSimd ?? true,
      wasmThreads: capabilities?.wasmThreads ?? true,
      webgl: capabilities?.webgl ?? false,
    };
  }

  detectCapabilities(): BrowserCapabilities {
    return { ...this.capabilities };
  }

  selectProvider(): BrowserExecutionProvider {
    for (const provider of this.config.preferredProviders) {
      if (this.isProviderAvailable(provider)) {
        return provider;
      }
    }
    return 'cpu';
  }

  private isProviderAvailable(provider: BrowserExecutionProvider): boolean {
    switch (provider) {
      case 'webgpu':
        return this.capabilities.webgpu;
      case 'wasm':
        return this.capabilities.wasm;
      case 'webgl':
        return this.capabilities.webgl;
      case 'cpu':
        return true;
      default:
        return false;
    }
  }

  async loadModel(modelUrl: string): Promise<void> {
    if (this.session) {
      this.session.dispose();
    }

    this.activeProvider = this.selectProvider();

    const options: SessionOptions = {
      executionProviders: [this.activeProvider],
      graphOptimizationLevel: 'all',
    };

    this.session = await this.backend.createSession(modelUrl, options);
    this.modelName = modelUrl.split('/').pop() ?? modelUrl;
    this.isWarmedUp = false;
  }

  async loadModelFromBuffer(buffer: ArrayBuffer): Promise<void> {
    if (this.session) {
      this.session.dispose();
    }

    this.activeProvider = this.selectProvider();

    const options: SessionOptions = {
      executionProviders: [this.activeProvider],
      graphOptimizationLevel: 'all',
    };

    this.session = await this.backend.createSessionFromBuffer(buffer, options);
    this.modelName = 'buffer-model';
    this.isWarmedUp = false;
  }

  async run(inputs: Record<string, Float32Array>): Promise<BrowserInferenceResult> {
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
      provider: this.activeProvider,
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
      dummyInputs[name] = new Float32Array(32).fill(0);
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

  getActiveProvider(): BrowserExecutionProvider {
    return this.activeProvider;
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
}
