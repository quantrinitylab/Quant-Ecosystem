import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OnnxServerRuntime } from '../onnx-server';
import type { OnnxBackend, OnnxSession, OnnxTensor } from '../onnx-server';

function createMockSession(overrides?: Partial<OnnxSession>): OnnxSession {
  return {
    run: vi.fn(async (feeds: Record<string, OnnxTensor>) => {
      const output: Record<string, OnnxTensor> = {
        predictions: {
          data: new Float32Array([0.8, 0.2]),
          dims: [1, 2],
          type: 'float32',
        },
      };
      return output;
    }),
    dispose: vi.fn(),
    inputNames: ['input_features'],
    outputNames: ['predictions'],
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

describe('OnnxServerRuntime', () => {
  let runtime: OnnxServerRuntime;
  let backend: OnnxBackend;
  let session: OnnxSession;

  beforeEach(() => {
    session = createMockSession();
    backend = createMockBackend(session);
    runtime = new OnnxServerRuntime(backend);
  });

  describe('loadModel', () => {
    it('loads a model from file path', async () => {
      await runtime.loadModel('/models/recommender.onnx');
      expect(backend.createSession).toHaveBeenCalledWith(
        '/models/recommender.onnx',
        expect.objectContaining({
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
        }),
      );
      expect(runtime.isModelLoaded()).toBe(true);
      expect(runtime.getModelName()).toBe('recommender.onnx');
    });

    it('disposes previous session when loading new model', async () => {
      await runtime.loadModel('/models/model1.onnx');
      await runtime.loadModel('/models/model2.onnx');
      expect(session.dispose).toHaveBeenCalledTimes(1);
    });

    it('loads model from buffer', async () => {
      const buffer = new ArrayBuffer(100);
      await runtime.loadModelFromBuffer(buffer);
      expect(backend.createSessionFromBuffer).toHaveBeenCalled();
      expect(runtime.isModelLoaded()).toBe(true);
    });

    it('uses custom execution providers', async () => {
      const gpuRuntime = new OnnxServerRuntime(backend, {
        executionProviders: ['cuda', 'cpu'],
      });
      await gpuRuntime.loadModel('/models/model.onnx');
      expect(backend.createSession).toHaveBeenCalledWith(
        '/models/model.onnx',
        expect.objectContaining({
          executionProviders: ['cuda', 'cpu'],
        }),
      );
    });
  });

  describe('run', () => {
    it('runs inference and returns typed outputs', async () => {
      await runtime.loadModel('/models/model.onnx');
      const inputs = { input_features: new Float32Array([1.0, 2.0, 3.0]) };
      const result = await runtime.run(inputs);

      expect(result.outputs.predictions).toBeInstanceOf(Float32Array);
      expect(result.outputs.predictions[0]).toBeCloseTo(0.8);
      expect(result.outputs.predictions[1]).toBeCloseTo(0.2);
      expect(result.modelName).toBe('model.onnx');
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('throws if no model is loaded', async () => {
      await expect(runtime.run({ input: new Float32Array([1.0]) })).rejects.toThrow(
        'No model loaded',
      );
    });

    it('constructs proper tensor feeds from inputs', async () => {
      await runtime.loadModel('/models/model.onnx');
      const inputData = new Float32Array([1.0, 2.0, 3.0]);
      await runtime.run({ features: inputData });

      expect(session.run).toHaveBeenCalledWith({
        features: {
          data: inputData,
          dims: [1, 3],
          type: 'float32',
        },
      });
    });
  });

  describe('warmUp', () => {
    it('runs warm-up inference passes', async () => {
      await runtime.loadModel('/models/model.onnx');
      await runtime.warmUp();
      // Default 3 warm-up runs
      expect(session.run).toHaveBeenCalledTimes(3);
      expect(runtime.isReady()).toBe(true);
    });

    it('throws if no model is loaded', async () => {
      await expect(runtime.warmUp()).rejects.toThrow('No model loaded');
    });

    it('uses custom warm-up count', async () => {
      const customRuntime = new OnnxServerRuntime(backend, { warmUpRuns: 5 });
      await customRuntime.loadModel('/models/model.onnx');
      await customRuntime.warmUp();
      expect(session.run).toHaveBeenCalledTimes(5);
    });
  });

  describe('dispose', () => {
    it('disposes session and resets state', async () => {
      await runtime.loadModel('/models/model.onnx');
      runtime.dispose();
      expect(session.dispose).toHaveBeenCalled();
      expect(runtime.isModelLoaded()).toBe(false);
      expect(runtime.getModelName()).toBe('');
    });

    it('is safe to call without a loaded model', () => {
      expect(() => runtime.dispose()).not.toThrow();
    });
  });

  describe('getInputNames / getOutputNames', () => {
    it('returns input and output names from session', async () => {
      await runtime.loadModel('/models/model.onnx');
      expect(runtime.getInputNames()).toEqual(['input_features']);
      expect(runtime.getOutputNames()).toEqual(['predictions']);
    });

    it('throws if no model is loaded', () => {
      expect(() => runtime.getInputNames()).toThrow('No model loaded');
      expect(() => runtime.getOutputNames()).toThrow('No model loaded');
    });
  });
});
