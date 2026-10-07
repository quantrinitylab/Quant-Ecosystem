# Quant Memory Retention & Forgetting

Memory classes include temporary context, episodes, semantic memory, confirmed memory, sensitive memory, graph edges, and index artifacts.

Each has independent retention/deletion policy. Forget request → policy check → suppress/delete → propagate through graph/index/cache → verify retrieval absence.

Temporary signals expire automatically. Stale inferred preferences can decay or require revalidation. Holds can block deletion where applicable.