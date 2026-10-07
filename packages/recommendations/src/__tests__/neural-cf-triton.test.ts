// ============================================================================
// Tests for NeuralCF Triton backend integration
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { NeuralCF } from '../core/neural-cf';
import type { TritonInferenceClient, InferResponse } from '@quant/triton-client';

function createMockTritonClient(): TritonInferenceClient {
  return {
    infer: vi.fn().mockResolvedValue({
      id: 'test-req',
      model_name: 'ncf_model',
      model_version: '1',
      outputs: [{ name: 'score', shape: [1, 1], datatype: 'FP32', data: [0.87] }],
    } satisfies InferResponse),
    getModelMetadata: vi.fn().mockResolvedValue({
      name: 'ncf_model',
      versions: ['1'],
      platform: 'pytorch_libtorch',
      inputs: [
        { name: 'user_id', datatype: 'INT64', shape: [1, 1] },
        { name: 'item_id', datatype: 'INT64', shape: [1, 1] },
      ],
      outputs: [{ name: 'score', datatype: 'FP32', shape: [1, 1] }],
    }),
    getServerHealth: vi.fn().mockResolvedValue({ live: true, ready: true }),
    isModelReady: vi.fn().mockResolvedValue({ ready: true }),
  } as unknown as TritonInferenceClient;
}

describe('NeuralCF with Triton backend', () => {
  it('should call Triton for single prediction', async () => {
    const client = createMockTritonClient();
    const ncf = new NeuralCF(client, {
      modelName: 'ncf_model',
      embeddingSize: 64,
    });

    const score = await ncf.predict('user-123', 'item-456');

    expect(score).toBe(0.87);
    expect(client.infer).toHaveBeenCalledWith(
      'ncf_model',
      expect.objectContaining({
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'user_id' }),
          expect.objectContaining({ name: 'item_id' }),
        ]),
        outputs: [{ name: 'score' }],
      }),
      undefined,
    );
  });

  it('should call Triton for batch recommendations', async () => {
    const client = createMockTritonClient();
    (client.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'batch-req',
      model_name: 'ncf_model',
      model_version: '1',
      outputs: [{ name: 'scores', shape: [3, 1], datatype: 'FP32', data: [0.9, 0.7, 0.5] }],
    });

    const ncf = new NeuralCF(client, {
      modelName: 'ncf_model',
      embeddingSize: 64,
    });

    const recs = await ncf.recommend('user-1', ['item-a', 'item-b', 'item-c'], 2);

    expect(recs).toHaveLength(2);
    expect(recs[0]!.score).toBe(0.9);
    expect(recs[0]!.itemId).toBe('item-a');
    expect(client.infer).toHaveBeenCalledWith(
      'ncf_model',
      expect.objectContaining({
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'user_ids' }),
          expect.objectContaining({ name: 'item_ids' }),
        ]),
      }),
      undefined,
    );
  });

  it('should get user embedding from Triton', async () => {
    const client = createMockTritonClient();
    (client.infer as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'emb-req',
      model_name: 'ncf_model',
      model_version: '1',
      outputs: [
        { name: 'user_embedding', shape: [1, 4], datatype: 'FP32', data: [0.1, 0.2, 0.3, 0.4] },
      ],
    });

    const ncf = new NeuralCF(client, {
      modelName: 'ncf_model',
      embeddingSize: 4,
    });

    const embedding = await ncf.getUserEmbedding('user-1');

    expect(embedding).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it('should return null on embedding fetch error', async () => {
    const client = createMockTritonClient();
    (client.infer as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Triton unavailable'));

    const ncf = new NeuralCF(client, {
      modelName: 'ncf_model',
      embeddingSize: 64,
    });

    const embedding = await ncf.getUserEmbedding('user-1');
    expect(embedding).toBeNull();
  });

  it('should use fallback when client is null', async () => {
    const ncf = new NeuralCF(null, {
      modelName: 'ncf_model',
      embeddingSize: 32,
      fallbackMode: true,
      fallbackConfig: {
        embeddingSize: 32,
        hiddenLayers: [64, 32],
        learningRate: 0.001,
        epochs: 1,
        batchSize: 32,
        dropout: 0.1,
        activationFn: 'relu',
      },
    });

    await ncf.initializeFallback(['u1', 'u2'], ['i1', 'i2']);
    const score = await ncf.predict('u1', 'i1');

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('should return 0.5 when no client and no fallback', async () => {
    const ncf = new NeuralCF(null, {
      modelName: 'ncf_model',
      embeddingSize: 32,
    });

    const score = await ncf.predict('user-1', 'item-1');
    expect(score).toBe(0.5);
  });

  it('should pass model version to Triton', async () => {
    const client = createMockTritonClient();
    const ncf = new NeuralCF(client, {
      modelName: 'ncf_model',
      modelVersion: '2',
      embeddingSize: 64,
    });

    await ncf.predict('user-1', 'item-1');

    expect(client.infer).toHaveBeenCalledWith('ncf_model', expect.any(Object), '2');
  });
});
