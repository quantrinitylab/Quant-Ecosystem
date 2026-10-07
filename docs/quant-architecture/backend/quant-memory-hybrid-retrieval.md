# Quant Memory Hybrid Retrieval

Structured filters + lexical search + vector similarity + graph traversal + temporal retrieval → authorization → rerank → context compression.

Structured retrieval handles IDs/dates/preferences; lexical handles exact terms; vectors handle semantic similarity; graph handles relationships; temporal retrieval handles current/historical validity.

Indexes never enforce authorization. Authorization occurs before final context delivery. Candidate fusion uses stable IDs and ranking by authority, relevance, freshness, confidence, provenance, sensitivity, and task fit.