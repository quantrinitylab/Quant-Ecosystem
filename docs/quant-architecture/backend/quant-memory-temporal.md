# Quant Memory Temporal Model

## Why time matters

A memory can be true historically but false now. The system therefore separates observedAt, validFrom, validUntil, lastValidatedAt, and expiresAt.

## Examples

A current favorite app can change. A project can end. A meeting can be rescheduled. A relationship can change. Old preferences should not permanently outrank current behavior.

## Temporal retrieval

Tasks asking “currently,” “latest,” or “what is planned” should prefer live source queries and current events over stale memory.

## Historical retrieval

Tasks asking “what did we decide,” “when did this happen,” or “what was the plan” may intentionally retrieve episodic historical memory.
