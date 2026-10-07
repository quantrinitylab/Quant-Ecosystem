# M12 Backend — Search Ranking

## Ranking stages
1. authorization filter
2. hard filters
3. candidate retrieval
4. lexical/semantic scoring
5. business relevance
6. freshness
7. user context
8. diversity/deduplication
9. final ranking

Possible signals include exact phrase, subject, sender, field match, recency, interaction context, thread importance and semantic similarity.

Ranking signals never bypass access control.

Expose concise ranking reasons such as "Exact subject match + recent thread". Never expose hidden model reasoning or sensitive ranking features.
