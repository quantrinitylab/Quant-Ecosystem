# Phase 83.0 Honest-Labeling Inventory

This document tracks all `@simulated` annotated implementations in the Quant Ecosystem.
Each file listed below contains a stub, fake, or naive implementation that is not
production-ready. Annotations were added in Phase 83.0 to ensure honest labeling of
all simulated code paths.

---

## Moderation (3 files)

| File Path                                           | Classification | Reason                                                        | Production Path                                 |
| --------------------------------------------------- | -------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| packages/moderation/src/services/csam-matcher.ts    | FAKE           | Returns hardcoded {matched:false} with no real CSAM detection | Integrate PhotoDNA or Thorn Safer API           |
| packages/moderation/src/services/perceptual-hash.ts | NAIVE          | Pure JS DCT-based pHash, not a production library             | Use sharp + blockhash or phash-image library    |
| packages/moderation/src/services/bot-detection.ts   | NAIVE          | Heuristic scoring with fixed thresholds, no ML                | Train ML classifier, integrate feature pipeline |

## QuantMeet (3 files)

| File Path                                            | Classification | Reason                                    | Production Path                                 |
| ---------------------------------------------------- | -------------- | ----------------------------------------- | ----------------------------------------------- |
| apps/quantmeet/backend/services/sfu.service.ts       | NAIVE          | Random ICE candidates, no real WebRTC SFU | Integrate mediasoup or LiveKit SFU              |
| apps/quantmeet/backend/services/recording.service.ts | NAIVE          | In-memory state, no real media capture    | Use LiveKit Egress or FFmpeg pipeline           |
| apps/quantmeet/backend/services/breakout.service.ts  | NAIVE          | In-memory room management                 | Persist in DB, fully integrate LiveKit room API |

## Recommendations (3 files)

| File Path                                           | Classification | Reason                                      | Production Path                                 |
| --------------------------------------------------- | -------------- | ------------------------------------------- | ----------------------------------------------- |
| packages/recommendations/src/core/neural-cf.ts      | NAIVE          | Pure JS NCF fallback with random weights    | Deploy trained model on Triton Inference Server |
| packages/recommendations/src/retrieval/two-tower.ts | NAIVE          | Pure JS forward pass, random initialization | Train in PyTorch, serve via ONNX/Triton         |
| packages/recommendations/src/ranking/mmoe.ts        | NAIVE          | Pure JS MoE, untrained expert functions     | Train MMoE model, serve via ML framework        |

## ML Pipeline (14 files)

| File Path                                               | Classification | Reason                               | Production Path                            |
| ------------------------------------------------------- | -------------- | ------------------------------------ | ------------------------------------------ |
| packages/ml-pipeline/src/core/anomaly-detector.ts       | NAIVE          | Pure JS isolation forest/z-score     | Python ML pipeline or ONNX model           |
| packages/ml-pipeline/src/core/automl-pipeline.ts        | NAIVE          | Simulated AutoML in JS               | SageMaker AutoPilot or similar             |
| packages/ml-pipeline/src/core/embedding-store.ts        | NAIVE          | In-memory vector storage             | Pinecone, Qdrant, or pgvector              |
| packages/ml-pipeline/src/core/feature-store.ts          | NAIVE          | In-memory feature cache              | Feast or Tecton feature store              |
| packages/ml-pipeline/src/core/image-features.ts         | NAIVE          | Basic pixel stats, no CNN            | CLIP or ResNet via ONNX                    |
| packages/ml-pipeline/src/core/inference-engine.ts       | NAIVE          | JS inference without real runtime    | ONNX Runtime or TensorRT                   |
| packages/ml-pipeline/src/core/model-monitor.ts          | NAIVE          | Basic drift stats in JS              | Evidently AI or SageMaker Model Monitor    |
| packages/ml-pipeline/src/core/model-registry.ts         | NAIVE          | In-memory model versioning           | MLflow or SageMaker Model Registry         |
| packages/ml-pipeline/src/core/ner-engine.ts             | NAIVE          | Regex/dictionary-based NER           | spaCy, HuggingFace NER, or ONNX            |
| packages/ml-pipeline/src/core/sentiment-analyzer.ts     | NAIVE          | Lexicon-based scoring                | Transformer model via ONNX                 |
| packages/ml-pipeline/src/core/spam-classifier.ts        | NAIVE          | Naive Bayes in pure JS               | Trained ML model via inference service     |
| packages/ml-pipeline/src/core/text-embeddings.ts        | NAIVE          | TF-IDF or random projections         | sentence-transformers or OpenAI embeddings |
| packages/ml-pipeline/src/core/time-series-forecaster.ts | NAIVE          | Moving average/exponential smoothing | Prophet, ARIMA, or neural forecasting      |
| packages/ml-pipeline/src/core/training-pipeline.ts      | NAIVE          | Simulated training loop in JS        | PyTorch/TensorFlow training infrastructure |

## ML Runtime (1 file)

| File Path                               | Classification | Reason                                           | Production Path                       |
| --------------------------------------- | -------------- | ------------------------------------------------ | ------------------------------------- |
| packages/ml-runtime/src/model-loader.ts | NAIVE          | ONNX loading interfaces, no real native bindings | Bind to onnxruntime-node native addon |

## Search (1 file)

| File Path                                  | Classification | Reason                           | Production Path                          |
| ------------------------------------------ | -------------- | -------------------------------- | ---------------------------------------- |
| packages/search/src/core/inverted-index.ts | NAIVE          | In-memory BM25 with JS tokenizer | Meilisearch, Elasticsearch, or Typesense |

## Agent Runtime (12 files)

| File Path                                           | Classification | Reason             | Production Path                     |
| --------------------------------------------------- | -------------- | ------------------ | ----------------------------------- |
| packages/agent-runtime/src/agents/code-pilot.ts     | NAIVE          | Rule-based, no LLM | Integrate OpenAI/Anthropic API      |
| packages/agent-runtime/src/agents/content-pilot.ts  | NAIVE          | Rule-based, no LLM | Integrate LLM API                   |
| packages/agent-runtime/src/agents/email-pilot.ts    | NAIVE          | Rule-based, no LLM | Integrate LLM API                   |
| packages/agent-runtime/src/agents/finance-pilot.ts  | NAIVE          | Rule-based, no LLM | Integrate LLM + financial data APIs |
| packages/agent-runtime/src/agents/health-pilot.ts   | NAIVE          | Rule-based, no LLM | Integrate LLM + health APIs         |
| packages/agent-runtime/src/agents/learning-pilot.ts | NAIVE          | Rule-based, no LLM | Integrate LLM + education APIs      |
| packages/agent-runtime/src/agents/meeting-pilot.ts  | NAIVE          | Rule-based, no LLM | Integrate LLM + calendar APIs       |
| packages/agent-runtime/src/agents/research-pilot.ts | NAIVE          | Rule-based, no LLM | Integrate LLM + search/RAG pipeline |
| packages/agent-runtime/src/agents/schedule-pilot.ts | NAIVE          | Rule-based, no LLM | Integrate LLM + calendar APIs       |
| packages/agent-runtime/src/agents/shopping-pilot.ts | NAIVE          | Rule-based, no LLM | Integrate LLM + e-commerce APIs     |
| packages/agent-runtime/src/agents/social-pilot.ts   | NAIVE          | Rule-based, no LLM | Integrate LLM + social graph APIs   |
| packages/agent-runtime/src/agents/travel-pilot.ts   | NAIVE          | Rule-based, no LLM | Integrate LLM + travel APIs         |

## Federation (2 files)

| File Path                                     | Classification | Reason                              | Production Path                            |
| --------------------------------------------- | -------------- | ----------------------------------- | ------------------------------------------ |
| packages/federation/src/matrix/bridge-bot.ts  | NAIVE          | In-memory forwarding, no Matrix SDK | Use matrix-js-sdk or matrix-bot-sdk        |
| packages/federation/src/matrix/room-mapper.ts | NAIVE          | In-memory Maps, no persistence      | Persist in DB, sync with Matrix homeserver |

---

## Summary

| Metric                | Count            |
| --------------------- | ---------------- |
| Total annotated files | 39               |
| FAKE                  | 1 (csam-matcher) |
| NAIVE                 | 38               |
