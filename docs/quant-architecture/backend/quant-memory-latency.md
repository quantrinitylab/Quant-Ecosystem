# Quant Memory Serving & Latency

Request classes: interactive recall, feed personalization, background consolidation, reindex, deletion propagation.

Interactive path: authorization → bounded retrieval → rerank → compact context. Primary product screens must not block on optional long-term memory.

Use progressive context and authorization-aware short-lived caches. If vector retrieval fails, fall back to structured/lexical/graph paths. If Memory is unavailable, products continue with reduced personalization rather than fabricated context.