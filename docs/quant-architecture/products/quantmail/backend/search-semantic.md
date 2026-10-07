# M12 Backend — Semantic Search

## Pipeline
query -> query embedding -> authorized candidate space -> vector retrieval -> lexical hybrid -> reranking -> canonical authorization check

Qdrant is an index, not an authorization system or source of truth.

Vector documents carry opaque source references and version metadata.

Embeddings inherit source access boundaries. Deleting or restricting source data triggers vector deletion/rebuild.
