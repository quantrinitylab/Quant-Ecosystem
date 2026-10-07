# M41 — Memory-Aware UI State

The UI may surface temporary context such as “related meeting”, “project context”, “recently used file”, or “Quanty remembers your preference”.

UI state must distinguish:
- source fact
- remembered preference
- inferred context
- agent suggestion
- executed action.

Never style inference as canonical truth. Every memory card can expose source, confidence/freshness where useful, and correction/forget controls.
