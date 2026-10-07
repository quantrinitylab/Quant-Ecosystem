import { describe, it, expect, vi } from 'vitest';
import { TritonInferenceClient, TritonClientError } from '../triton-http-client';
import type { TritonTransport, TransportResponse } from '../triton-http-client';
import type { InferRequest } from '../types';

function createMockTransport(overrides?: Partial<TritonTransport>): TritonTransport {
  return {
    post: vi.fn<(url: string, body: unknown) => Promise<TransportResponse>>().mockResolvedValue({
      status: 200,
      data: {},
    }),
    get: vi.fn<(url: string) => Promise<TransportResponse>>().mockResolvedValue({
      status: 200,
      data: {},
    }),
    ...overrides,
  };
}

describe('TritonInferenceClient', () => {
  const baseUrl = 'http://triton:8000';

  describe('infer', () => {
    it('should send inference request to correct URL', async () => {
      const mockResponse = {
        id: 'req-1',
        model_name: 'neural-cf',
        model_version: '1',
        outputs: [{ name: 'score', shape: [1, 1], datatype: 'FP32' as const, data: [0.85] }],
      };

      const transport = createMockTransport({
        post: vi.fn().mockResolvedValue({ status: 200, data: mockResponse }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const request: InferRequest = {
        id: 'req-1',
        inputs: [
          { name: 'user_id', shape: [1], datatype: 'INT64', data: [42] },
          { name: 'item_id', shape: [1], datatype: 'INT64', data: [99] },
        ],
      };

      const result = await client.infer('neural-cf', request);

      expect(transport.post).toHaveBeenCalledWith(
        'http://triton:8000/v2/models/neural-cf/infer',
        request,
      );
      expect(result.model_name).toBe('neural-cf');
      expect(result.outputs[0]!.data).toEqual([0.85]);
    });

    it('should include model version in URL when specified', async () => {
      const mockResponse = {
        id: 'req-2',
        model_name: 'neural-cf',
        model_version: '2',
        outputs: [{ name: 'score', shape: [1, 1], datatype: 'FP32' as const, data: [0.9] }],
      };

      const transport = createMockTransport({
        post: vi.fn().mockResolvedValue({ status: 200, data: mockResponse }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const request: InferRequest = {
        inputs: [{ name: 'input', shape: [1], datatype: 'FP32', data: [1.0] }],
      };

      await client.infer('neural-cf', request, '2');

      expect(transport.post).toHaveBeenCalledWith(
        'http://triton:8000/v2/models/neural-cf/versions/2/infer',
        request,
      );
    });

    it('should throw TritonClientError on non-200 status', async () => {
      const transport = createMockTransport({
        post: vi.fn().mockResolvedValue({ status: 503, data: { error: 'model not loaded' } }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const request: InferRequest = {
        inputs: [{ name: 'input', shape: [1], datatype: 'FP32', data: [1.0] }],
      };

      await expect(client.infer('missing-model', request)).rejects.toThrow(TritonClientError);
      await expect(client.infer('missing-model', request)).rejects.toMatchObject({
        statusCode: 503,
        modelName: 'missing-model',
      });
    });

    it('should handle batch inference with multiple inputs', async () => {
      const mockResponse = {
        id: 'batch-1',
        model_name: 'neural-cf',
        model_version: '1',
        outputs: [
          { name: 'scores', shape: [4, 1], datatype: 'FP32' as const, data: [0.8, 0.6, 0.9, 0.3] },
        ],
      };

      const transport = createMockTransport({
        post: vi.fn().mockResolvedValue({ status: 200, data: mockResponse }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const request: InferRequest = {
        id: 'batch-1',
        inputs: [
          { name: 'user_ids', shape: [4], datatype: 'INT64', data: [1, 1, 1, 1] },
          { name: 'item_ids', shape: [4], datatype: 'INT64', data: [10, 20, 30, 40] },
        ],
      };

      const result = await client.infer('neural-cf', request);
      expect(result.outputs[0]!.data).toHaveLength(4);
      expect(result.id).toBe('batch-1');
    });
  });

  describe('getModelMetadata', () => {
    it('should fetch model metadata from correct endpoint', async () => {
      const metadata = {
        name: 'neural-cf',
        versions: ['1', '2'],
        platform: 'onnxruntime_onnx',
        inputs: [
          { name: 'user_id', datatype: 'INT64' as const, shape: [-1, 1] },
          { name: 'item_id', datatype: 'INT64' as const, shape: [-1, 1] },
        ],
        outputs: [{ name: 'score', datatype: 'FP32' as const, shape: [-1, 1] }],
      };

      const transport = createMockTransport({
        get: vi.fn().mockResolvedValue({ status: 200, data: metadata }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const result = await client.getModelMetadata('neural-cf');

      expect(transport.get).toHaveBeenCalledWith('http://triton:8000/v2/models/neural-cf');
      expect(result.name).toBe('neural-cf');
      expect(result.inputs).toHaveLength(2);
      expect(result.outputs).toHaveLength(1);
    });
  });

  describe('getServerHealth', () => {
    it('should return live and ready status from health endpoints', async () => {
      const transport = createMockTransport({
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/live')) return Promise.resolve({ status: 200, data: {} });
          if (url.includes('/ready')) return Promise.resolve({ status: 200, data: {} });
          return Promise.resolve({ status: 404, data: {} });
        }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const health = await client.getServerHealth();

      expect(health.live).toBe(true);
      expect(health.ready).toBe(true);
    });

    it('should report not ready when server returns non-200', async () => {
      const transport = createMockTransport({
        get: vi.fn().mockImplementation((url: string) => {
          if (url.includes('/live')) return Promise.resolve({ status: 200, data: {} });
          if (url.includes('/ready')) return Promise.resolve({ status: 503, data: {} });
          return Promise.resolve({ status: 404, data: {} });
        }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const health = await client.getServerHealth();

      expect(health.live).toBe(true);
      expect(health.ready).toBe(false);
    });
  });

  describe('isModelReady', () => {
    it('should check model readiness at correct endpoint', async () => {
      const transport = createMockTransport({
        get: vi.fn().mockResolvedValue({ status: 200, data: {} }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const ready = await client.isModelReady('neural-cf');

      expect(transport.get).toHaveBeenCalledWith('http://triton:8000/v2/models/neural-cf/ready');
      expect(ready).toBe(true);
    });
  });

  describe('getServerMetadata', () => {
    it('should fetch server metadata', async () => {
      const metadata = {
        name: 'triton',
        version: '2.42.0',
        extensions: ['classification', 'sequence', 'model_repository'],
      };

      const transport = createMockTransport({
        get: vi.fn().mockResolvedValue({ status: 200, data: metadata }),
      });
      const client = new TritonInferenceClient(transport, { baseUrl });

      const result = await client.getServerMetadata();

      expect(transport.get).toHaveBeenCalledWith('http://triton:8000/v2');
      expect(result.name).toBe('triton');
      expect(result.version).toBe('2.42.0');
    });
  });
});
