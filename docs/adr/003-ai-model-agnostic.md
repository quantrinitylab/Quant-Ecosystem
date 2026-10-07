# ADR-003: AI Model-Agnostic Orchestration (No Model Lock-in)

## Status

ACCEPTED

## Date

2026-07-07

## Context

CEO Rule: "Hum kisi AI model ke fan nahi honge. Har model ek replaceable
component hai. Quant ka moat kabhi model nahi hoga."

The AI engine must route across providers without coupling to any single model.
Models are commoditizing rapidly. Today's best model is tomorrow's fallback.

## Options Considered

### Option A — Single-provider (OpenAI only)
**Pros:** Simple, well-documented, one SDK
**Cons:** Single point of failure, no cost optimization, vendor lock-in

### Option B — Multi-provider with Vercel AI SDK
**Pros:** Unified interface, streaming, provider abstraction
**Cons:** SDK version churn, some providers need native SDK anyway

### Option C — Custom abstraction over native SDKs
**Pros:** Full control, no middleware
**Cons:** Maintenance burden, reimplementing streaming/retry/types

## Decision

Option B + C hybrid. Use Vercel AI SDK (`ai` package) for providers it supports
well (OpenAI, Anthropic, Google), and native AWS SDK for Bedrock (Converse API)
where the AI SDK integration is unstable.

Model selection is capability + cost + availability scored, never hardcoded.
`AI_DEFAULT_MODEL` env var lets ops override without code change.

## Consequences

- 25+ models registered in ModelRouter, scored by 5 factors
- Circuit breaker per provider (failure isolates one provider, not all)
- Adding a new provider = implement one adapter, register models
- No prompt should reference a model by name (use capability request)
- Cost tracking must be model-aware (different token prices)

## Future Impact

- 1yr: Local models (Ollama) become viable fallbacks for low-latency
- 3yr: Quant hosts fine-tuned models; orchestrator routes by task complexity
- 5yr: Model training becomes in-house; orchestrator becomes the moat

## Complexity Assessment

REDUCES complexity: apps never know which model served them.
One interface (`engine.infer(request)`) regardless of provider behind it.

---

*Signed by: Kiro (Principal Systems Engineer) | Reviewed by: CEO*
