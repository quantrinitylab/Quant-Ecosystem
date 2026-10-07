// ============================================================================
// On-Device Ranker Model Spec - Architecture and export documentation
// ============================================================================

import { MAX_MODEL_SIZE_BYTES, MAX_INFERENCE_LATENCY_MS } from './on-device-ranker';

export interface ModelSpec {
  inputShape: [null, number];
  outputShape: [null, number];
  hiddenLayers: number[];
  activation: string;
  outputActivation: string;
  targetSizeBytes: number;
  targetLatencyMs: number;
}

export class OnDeviceModelSpec {
  getModelSpec(): ModelSpec {
    return {
      inputShape: [null, 16],
      outputShape: [null, 1],
      hiddenLayers: [32],
      activation: 'relu',
      outputActivation: 'sigmoid',
      targetSizeBytes: MAX_MODEL_SIZE_BYTES,
      targetLatencyMs: MAX_INFERENCE_LATENCY_MS,
    };
  }

  validateModelSize(sizeBytes: number): boolean {
    return sizeBytes <= MAX_MODEL_SIZE_BYTES;
  }

  estimateModelSize(): number {
    // Model parameters:
    // Input layer -> Hidden layer: 16 * 32 weights + 32 biases = 544
    // Hidden layer -> Output layer: 32 * 1 weights + 1 bias = 33
    // Total: 577 parameters * 4 bytes (float32) = 2308 bytes (~2.3KB)
    const inputToHidden = 16 * 32 + 32;
    const hiddenToOutput = 32 * 1 + 1;
    const totalParams = inputToHidden + hiddenToOutput;
    return totalParams * 4; // float32 = 4 bytes per parameter
  }

  static getOnnxExportInstructions(): string {
    return [
      'PyTorch to ONNX Export Instructions:',
      '',
      '1. Define the model in PyTorch:',
      '   class OnDeviceRanker(nn.Module):',
      '       def __init__(self):',
      '           super().__init__()',
      '           self.hidden = nn.Linear(16, 32)',
      '           self.relu = nn.ReLU()',
      '           self.output = nn.Linear(32, 1)',
      '           self.sigmoid = nn.Sigmoid()',
      '       def forward(self, x):',
      '           x = self.relu(self.hidden(x))',
      '           return self.sigmoid(self.output(x))',
      '',
      '2. Export to ONNX:',
      '   model = OnDeviceRanker()',
      '   dummy_input = torch.randn(1, 16)',
      '   torch.onnx.export(model, dummy_input, "ranker.onnx",',
      '       input_names=["input"],',
      '       output_names=["score"],',
      '       dynamic_axes={"input": {0: "batch"}, "score": {0: "batch"}})',
      '',
      '3. Verify model size is under 5MB.',
      '4. Test inference latency is under 50ms at p95.',
    ].join('\n');
  }
}
