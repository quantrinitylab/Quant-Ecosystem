import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnnxBrowserRuntime } from '../onnx-browser';
import type { BrowserCapabilities } from '../onnx-browser';
import type { OnnxBackend, OnnxSession, OnnxTensor } from '../onnx-server';

function createMockSession(overrides?: Partial<OnnxSession>): OnnxSession {
  return {
    run: vi.fn(async () => ({
      scores: {
        data: new Float32Array([0.9, 0.1]),
        dims: [1, 2],
        type: 'float32' as const,
      },
    })),
    dispose: vi.fn(),
    inputNames: ['user_embedding'],
    outputNames: ['scores'],
    ...overrides,
  };
}

function createMockBackend(session?: OnnxSession): OnnxBackend {
  const mockSession = session ?? createMockSession();
  return {
    createSession: vi.fn(async () => mockSession),
    createSessionFromBuffer: vi.fn(async () => mockSession),
  };
}

describe('OnnxBrowserRuntime', () => {
  let runtime: OnnxBrowserRuntime;
  let backend: OnnxBackend;
  let session: OnnxSession;

  beforeEach(() => {
    session = createMockSession();
    backend = createMockBackend(session);
    runtime = new OnnxBrowserRuntime(backend, undefined, {
      webgpu: true,
      wasm: true,
      wasmSimd: true,
      wasmThreads: true,
    });
  });

  describe('capability detection', () => {
    it('detects available capabilities', () => {
      const caps = runtime.detectCapabilities();
      expect(caps.webgpu).toBe(true);
      expect(caps.wasm).toBe(true);
      expect(caps.wasmSimd).toBe(true);
    });

    it('defaults wasm to true', () => {
      const rt = new OnnxBrowserRuntime(backend);
      const caps = rt.detectCapabilities();
      expect(caps.wasm).toBe(true);
      expect(caps.webgpu).toBe(false);
    });
  });

  describe('provider selection', () => {
    it('selects WebGPU when available', () => {
      const provider = runtime.selectProvider();
      expect(provider).toBe('webgpu');
    });

    it('falls back to WASM when WebGPU is unavailable', () => {
      const rt = new OnnxBrowserRuntime(backend, undefined, {
        webgpu: false,
        wasm: true,
      });
      expect(rt.selectProvider()).toBe('wasm');
    });

    it('falls back to CPU as last resort', () => {
      const rt = new OnnxBrowserRuntime(backend, undefined, {
        webgpu: false,
        wasm: false,
        webgl: false,
      });
      expect(rt.selectProvider()).toBe('cpu');
    });

    it('respects custom provider order', () => {
      const rt = new OnnxBrowserRuntime(
        backend,
        { preferredProviders: ['wasm', 'webgpu', 'cpu'] },
        { webgpu: true, wasm: true },
      );
      expect(rt.selectProvider()).toBe('wasm');
    });
  });

  describe('loadModel', () => {
    it('loads model from URL', async () => {
      await runtime.loadModel('https://cdn.example.com/model.onnx');
      expect(backend.createSession).toHaveBeenCalledWith(
        'https://cdn.example.com/model.onnx',
        expect.objectContaining({
          executionProviders: ['webgpu'],
          graphOptimizationLevel: 'all',
        }),
      );
      expect(runtime.isModelLoaded()).toBe(true);
      expect(runtime.getActiveProvider()).toBe('webgpu');
    });

    it('loads model from buffer', async () => {
      const buffer = new ArrayBuffer(50);
      await runtime.loadModelFromBuffer(buffer);
      expect(backend.createSessionFromBuffer).toHaveBeenCalled();
      expect(runtime.isModelLoaded()).toBe(true);
    });

    it('disposes previous session when loading new model', async () => {
      await runtime.loadModel('model1.onnx');
      await runtime.loadModel('model2.onnx');
      expect(session.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('run', () => {
    it('runs inference and returns result with provider info', async () => {
      await runtime.loadModel('model.onnx');
      const inputs = { user_embedding: new Float32Array([1.0, 2.0, 3.0]) };
      const result = await runtime.run(inputs);

      expect(result.outputs.scores).toBeInstanceOf(Float32Array);
      expect(result.provider).toBe('webgpu');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.modelName).toBe('model.onnx');
    });

    it('throws if no model is loaded', async () => {
      await expect(runtime.run({ input: new Float32Array([1.0]) })).rejects.toThrow(
        'No model loaded',
      );
    });
  });

  describe('warmUp', () => {
    it('performs warm-up runs', async () => {
      await runtime.loadModel('model.onnx');
      await runtime.warmUp();
      // Default 2 warm-up runs + they call run internally
      expect(session.run).toHaveBeenCalledTimes(2);
      expect(runtime.isReady()).toBe(true);
    });

    it('throws if no model is loaded', async () => {
      await expect(runtime.warmUp()).rejects.toThrow('No model loaded');
    });
  });

  describe('dispose', () => {
    it('cleans up runtime state', async () => {
      await runtime.loadModel('model.onnx');
      runtime.dispose();
      expect(session.dispose).toHaveBeenCalled();
      expect(runtime.isModelLoaded()).toBe(false);
      expect(runtime.isReady()).toBe(false);
      expect(runtime.getModelName()).toBe('');
    });
  });
});
