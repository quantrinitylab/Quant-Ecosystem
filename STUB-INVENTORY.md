# STUB-INVENTORY.md

Auto-generated audit of all `@simulated` annotations across the Quant-Ecosystem codebase.

**Generated:** 2026-06-13
**Total stubs:** 27
**Classification breakdown:** NAIVE: 26, FAKE: 1

---

## Priority Legend

| Priority | Definition |
|----------|-----------|
| **P0**   | Blocks flagship demo (agent execution, model routing, mail AI) |
| **P1**   | Degrades flagship experience |
| **P2**   | Not on flagship path |

Flagship path = QuantMail + QuantChat + QuantAI + agentic execution.

---

## P0 — Blocks Flagship Demo

### packages/ml-runtime

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/ml-runtime/src/model-loader.ts` | NAIVE | Defines ONNX loading interfaces but JS fallback has no real ONNX runtime bindings | Bind to onnxruntime-node native addon |

### packages/ml-pipeline

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/ml-pipeline/src/core/inference-engine.ts` | NAIVE | JS-based inference without real runtime | Use ONNX Runtime or TensorRT |
| `packages/ml-pipeline/src/core/model-registry.ts` | NAIVE | In-memory model versioning | Use MLflow or SageMaker Model Registry |

---

## P1 — Degrades Flagship Experience

### packages/ml-pipeline

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/ml-pipeline/src/core/spam-classifier.ts` | NAIVE | Naive Bayes in pure JS | Use trained ML model via inference service |
| `packages/ml-pipeline/src/core/sentiment-analyzer.ts` | NAIVE | Lexicon-based scoring | Use transformer model (e.g. DistilBERT) via ONNX |
| `packages/ml-pipeline/src/core/text-embeddings.ts` | NAIVE | TF-IDF or random projections | Use sentence-transformers or OpenAI embeddings API |
| `packages/ml-pipeline/src/core/embedding-store.ts` | NAIVE | In-memory vector storage | Use Pinecone, Qdrant, or pgvector |
| `packages/ml-pipeline/src/core/ner-engine.ts` | NAIVE | Regex/dictionary-based NER | Use spaCy, Hugging Face NER, or ONNX model |

### packages/moderation

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/moderation/src/services/bot-detection.ts` | NAIVE | Heuristic scoring with fixed thresholds, no ML model | Train ML classifier on labeled bot/human dataset |
| `packages/moderation/src/services/csam-matcher.ts` | FAKE (CSAMGuardLegacy only) | Returns hardcoded `{matched: false}` with no real CSAM detection | Integrate PhotoDNA or Thorn Safer API |

### packages/search

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/search/src/core/inverted-index.ts` | NAIVE | In-memory BM25 with JS tokenizer and stop-word list | Use Meilisearch, Elasticsearch, or Typesense |

---

## P2 — Not on Flagship Path

### apps/quantmeet

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `apps/quantmeet/backend/services/recording.service.ts` | NAIVE | In-memory state tracking only, no real media capture or transcoding | Use LiveKit Egress or mediasoup recording |
| `apps/quantmeet/backend/services/breakout.service.ts` | NAIVE | In-memory Map-based room management | Persist rooms in database, integrate with LiveKit room API |
| `apps/quantmeet/backend/services/sfu.service.ts` | NAIVE | Generates random ICE candidates and simulated transport, no real WebRTC SFU | Integrate mediasoup or LiveKit SFU |

### packages/ml-pipeline

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/ml-pipeline/src/core/time-series-forecaster.ts` | NAIVE | Moving average/exponential smoothing only | Use Prophet, ARIMA, or neural forecasting |
| `packages/ml-pipeline/src/core/image-features.ts` | NAIVE | Basic pixel stats, no CNN feature extraction | Use CLIP or ResNet via ONNX |
| `packages/ml-pipeline/src/core/anomaly-detector.ts` | NAIVE | Pure JS isolation forest/z-score | Use Python ML pipeline or ONNX model |
| `packages/ml-pipeline/src/core/training-pipeline.ts` | NAIVE | Simulated training loop in JS | Use PyTorch/TensorFlow with proper training infrastructure |
| `packages/ml-pipeline/src/core/feature-store.ts` | NAIVE | In-memory feature cache | Use Feast or Tecton feature store |
| `packages/ml-pipeline/src/core/model-monitor.ts` | NAIVE | Basic drift stats in JS | Use Evidently AI or SageMaker Model Monitor |
| `packages/ml-pipeline/src/core/automl-pipeline.ts` | NAIVE | Simulated AutoML pipeline in JS | Use SageMaker AutoPilot or similar |

### packages/moderation

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/moderation/src/services/perceptual-hash.ts` | NAIVE | Pure JS DCT-based pHash from raw buffer bytes | Use sharp + blockhash or dedicated pHash library |

### packages/recommendations

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/recommendations/src/retrieval/two-tower.ts` | NAIVE | Pure JS forward pass with randomly initialized weights | Train two-tower model in PyTorch, serve via ONNX/Triton |
| `packages/recommendations/src/ranking/mmoe.ts` | NAIVE | Multi-gate MoE in pure JS with untrained expert functions | Train MMoE model on engagement/retention data |
| `packages/recommendations/src/core/neural-cf.ts` | NAIVE | Falls back to pure JS NCF with random weights when Triton unavailable | Deploy trained NCF model on Triton Inference Server |

### packages/federation

| File | Classification | What it fakes | Production path |
|------|---------------|---------------|-----------------|
| `packages/federation/src/matrix/room-mapper.ts` | NAIVE | In-memory Map-based room mapping, no persistent storage | Persist mappings in database, sync with Matrix homeserver |
| `packages/federation/src/matrix/bridge-bot.ts` | NAIVE | In-memory message forwarding array, no Matrix SDK integration | Use matrix-js-sdk or matrix-bot-sdk |

---

## Summary by Package

| Package/App | Count | P0 | P1 | P2 |
|-------------|-------|----|----|-----|
| `apps/quantmeet` | 3 | 0 | 0 | 3 |
| `packages/ml-runtime` | 1 | 1 | 0 | 0 |
| `packages/ml-pipeline` | 14 | 2 | 5 | 7 |
| `packages/moderation` | 3 | 0 | 2 | 1 |
| `packages/search` | 1 | 0 | 1 | 0 |
| `packages/recommendations` | 3 | 0 | 0 | 3 |
| `packages/federation` | 2 | 0 | 0 | 2 |
| **Total** | **27** | **3** | **8** | **16** |

---

## Classification Types Found

| Type | Count | Meaning |
|------|-------|---------|
| NAIVE | 26 | Working but simplified implementation (in-memory, pure JS, heuristic-based) |
| FAKE  | 1  | Returns hardcoded/stub values, no real logic (CSAMGuardLegacy only) |

---

## CEO Update — 2026-06-14 (verified by reading source, not trusting labels)

**P0 tier COMPLETE** (pushed to origin/main, commits `11bbca21`/`d909dbd3`/`8adaa1bc`):
- `ml-runtime/model-loader.ts` — real `onnxruntime-node` session loading via `ModelLoader` (loadSession/runInference). No longer `@simulated`.
- `ml-pipeline/inference-engine.ts` — real ONNX inference. No longer `@simulated`.
- `ml-pipeline/model-registry.ts` — persistent model registry with storage backend. No longer `@simulated`.
- Gate: ml-runtime tsc 0 / 92 tests; ml-pipeline tsc 0 / 198 tests. Green.

**Several P1 "stubs" are MISLABELED — a real production path already exists alongside them. Do NOT rebuild these (would duplicate working code):**
- **Embeddings:** `ml-pipeline/src/embedding-service.ts` is REAL and production-grade — `EmbeddingBackend` interface + `OpenAIEmbeddingBackend` (real `/v1/embeddings` HTTP) + `TritonEmbeddingBackend` + language-routing `EmbeddingService` (17 tests). `text-embeddings.ts` (skip-gram, flagged `@simulated NAIVE`) is a SEPARATE lightweight in-process featurizer, NOT the production embedding path. No action needed.
- **CSAM:** `moderation/src/services/csam-matcher.ts` — `CSAMMatchService` is REAL: pluggable `CSAMHashProvider`, <500ms timeout, fail-closed (timeout/no-provider => block upload), report generation + paging webhook. Only `CSAMGuardLegacy` carries the FAKE label, and it is DELIBERATELY fail-closed (throws unless `UGC_MEDIA_ENABLED=true` + real provider). Correct design. No action without a real PhotoDNA/Thorn partnership (external, cannot be stubbed safely).

**Remaining genuinely-naive P1 stubs (spam-classifier, sentiment-analyzer, ner-engine, inverted-index BM25) FUNCTION with real algorithms** — they are not broken, just not SOTA. Their "production paths" (Elasticsearch/Meilisearch, DistilBERT, spaCy) require external services. Replacing them degrades nothing today; do so only when that external infra is provisioned.

**Net:** the headline "27 stubs" overstates the product gap. Flagship path (QuantMail + QuantChat + QuantAI + agentic + real ONNX runtime + real embedding/CSAM services) is materially real. Next real work is product depth, not stub-swapping.
