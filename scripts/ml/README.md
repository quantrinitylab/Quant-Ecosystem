# ML Training Pipeline

Training scripts for the Quant recommendation system's machine learning models.
These scripts produce ONNX models that are loaded by `@quant/ml-runtime` for
real-time inference in both server and browser environments.

## Prerequisites

- Python 3.10+
- CUDA 11.8+ (optional, for GPU training)
- 8GB+ RAM (16GB recommended for larger datasets)

## Installation

```bash
cd scripts/ml
pip install -r requirements.txt
```

For GPU support, install PyTorch with CUDA:

```bash
pip install torch --index-url https://download.pytorch.org/whl/cu118
```

## Models

### Two-Tower Retrieval Model

The Two-Tower model is used for candidate retrieval. It learns separate embeddings
for users and items in a shared latent space, enabling fast approximate nearest
neighbor (ANN) lookup at serving time.

**Architecture:**

```
User Features                    Item Features
     |                                |
[User Tower]                    [Item Tower]
  Embedding(user_id)              Embedding(item_id)
  Embedding(user_category)        Embedding(item_category)
  Concat                          Concat
  Linear -> ReLU -> BN            Linear -> ReLU -> BN
  Linear -> ReLU -> BN            Linear -> ReLU -> BN
  Linear                          Linear
  L2 Normalize                    L2 Normalize
     |                                |
  user_emb (64d)               item_emb (64d)
     |                                |
     +--------> Dot Product <---------+
                    |
              Similarity Score
```

**Input Tensors:**

- `user_id`: int64 [batch_size] - User identifier
- `user_category`: int64 [batch_size] - User segment/category
- `item_id`: int64 [batch_size] - Item identifier
- `item_category`: int64 [batch_size] - Item category

**Output Tensors:**

- `user_embedding`: float32 [batch_size, embedding_dim] - User vector (L2 normalized)
- `item_embedding`: float32 [batch_size, embedding_dim] - Item vector (L2 normalized)

**Training:**

```bash
python train_two_tower.py \
    --data-path data/interactions.csv \
    --output-dir models/two_tower \
    --epochs 50 \
    --batch-size 256 \
    --lr 0.001 \
    --embedding-dim 64
```

**Expected data format** (CSV):

| Column        | Type | Description                        |
| ------------- | ---- | ---------------------------------- |
| user_id       | int  | User identifier (0-indexed)        |
| user_category | int  | User segment (0-indexed)           |
| item_id       | int  | Item identifier (0-indexed)        |
| item_category | int  | Item category (0-indexed)          |
| label         | int  | 1=positive interaction, 0=negative |

### MMoE Ranking Model

The Multi-gate Mixture-of-Experts (MMoE) model is used for multi-objective
content ranking. It optimizes three objectives simultaneously:

1. **Engagement** - probability the user will interact with the content
2. **Retention** - probability the content improves long-term user retention
3. **Wellbeing** - probability the content is positive for user wellbeing

**Architecture:**

```
Input Features (32d)
     |
     +---> Expert 1 (Linear -> ReLU -> BN -> Linear -> ReLU)
     +---> Expert 2
     +---> Expert 3
     +---> Expert 4
     +---> Expert 5
     +---> Expert 6
     |
     |  Gate_engagement (Softmax over experts)
     |  Gate_retention  (Softmax over experts)
     |  Gate_wellbeing  (Softmax over experts)
     |
     +---> Tower_engagement: Mixed experts -> Linear -> ReLU -> Linear -> Sigmoid
     +---> Tower_retention:  Mixed experts -> Linear -> ReLU -> Linear -> Sigmoid
     +---> Tower_wellbeing:  Mixed experts -> Linear -> ReLU -> Linear -> Sigmoid
     |
  P(engagement), P(retention), P(wellbeing)
```

**Input Tensors:**

- `features`: float32 [batch_size, num_features] - Concatenated feature vector

**Output Tensors:**

- `engagement_score`: float32 [batch_size] - Engagement probability
- `retention_score`: float32 [batch_size] - Retention probability
- `wellbeing_score`: float32 [batch_size] - Wellbeing probability

**Training:**

```bash
python train_mmoe.py \
    --data-path data/ranking.csv \
    --output-dir models/mmoe \
    --epochs 100 \
    --batch-size 512 \
    --lr 0.001 \
    --num-experts 6
```

**Expected data format** (CSV):

| Column               | Type        | Description       |
| -------------------- | ----------- | ----------------- |
| feature_0..feature_N | float       | Input features    |
| engagement_label     | float (0-1) | Engagement target |
| retention_label      | float (0-1) | Retention target  |
| wellbeing_label      | float (0-1) | Wellbeing target  |

## Exporting to ONNX

After training, models are automatically exported to ONNX. You can also
re-export or convert existing checkpoints using the export utility:

```bash
# Export Two-Tower model
python export_to_onnx.py \
    --model-path models/two_tower/best_model.pt \
    --output-path models/two_tower/model.onnx \
    --model-type two_tower \
    --opset-version 17

# Export MMoE model
python export_to_onnx.py \
    --model-path models/mmoe/best_model.pt \
    --output-path models/mmoe/model.onnx \
    --model-type mmoe \
    --opset-version 17
```

The export utility will:

1. Load the PyTorch checkpoint
2. Reconstruct the model from saved config
3. Trace the model with dummy inputs
4. Export to ONNX with dynamic batch size
5. Validate the exported model with `onnx.checker`
6. Print model info (inputs, outputs, operations, file size)
7. Run a test inference with ONNX Runtime

## Integration with @quant/ml-runtime

The exported ONNX models are consumed by the `@quant/ml-runtime` package:

1. **Model Loader** downloads versioned ONNX files from storage
2. **Server Runtime** uses `onnxruntime-node` for server-side inference
3. **Browser Runtime** uses `onnxruntime-web` (WebGPU/WASM) for on-device ranking

Place exported models in the model cache directory expected by `ModelLoader`:

```
models/
  two_tower/
    user_tower.onnx      # User embedding model
    item_tower.onnx      # Item embedding model
  mmoe/
    mmoe_model.onnx      # Multi-objective ranker
```

The `OnDeviceRanker` in `@quant/recommendations` loads the MMoE model in the
browser to rank the final top-20 candidates from 200 server-side retrievals,
enabling personalization without additional server round-trips.

## Development

### Running Tests

The Python scripts can be tested with sample data:

```bash
# Generate sample data (for development)
python -c "
import pandas as pd
import numpy as np

# Two-Tower sample data
n = 1000
pd.DataFrame({
    'user_id': np.random.randint(0, 100, n),
    'user_category': np.random.randint(0, 10, n),
    'item_id': np.random.randint(0, 500, n),
    'item_category': np.random.randint(0, 20, n),
    'label': np.random.randint(0, 2, n),
}).to_csv('data/interactions.csv', index=False)

# MMoE sample data
pd.DataFrame({
    **{f'feature_{i}': np.random.randn(n) for i in range(32)},
    'engagement_label': np.random.random(n),
    'retention_label': np.random.random(n),
    'wellbeing_label': np.random.random(n),
}).to_csv('data/ranking.csv', index=False)
"
```

### Model Versioning

Models are versioned by training run timestamp. The `ModelLoader` in
`@quant/ml-runtime` handles version resolution and cache management.
Each checkpoint includes a `config` dict with architecture parameters,
enabling reconstruction without external metadata.
