# Quant Memory Event Architecture

Products publish typed source events; Memory consumes them through an idempotent pipeline.

Events include source created/updated/deleted, permission changed, memory corrected, expired, suppressed, and activated.

Extraction is versioned. Reprocessing respects current deletion, retention, privacy, and authorization state. Derived indexes and graph projections are rebuildable from canonical memory plus eligible events. Assume at-least-once delivery and use stable IDs for idempotency.