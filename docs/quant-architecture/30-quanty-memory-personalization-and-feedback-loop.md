# 30 — Quanty Memory, Personalization and Feedback Loop

## Memory law
QuantDrive is the governed personal memory layer. Product databases remain source of truth for mail, chat, games, media, billing and other domains. Quanty receives minimum useful context for the current purpose.

## Memory classes
Explicit memory: user directly asks Quanty to remember something.
Preference: repeated behavior or explicit preference with confidence and decay.
Episodic: bounded past interaction/task context.
Semantic: durable structured understanding derived from permitted sources.
Temporary: current turn/session/task context with short retention.
Derived signal: probabilistic affinity or ranking feature, never presented as an unquestionable fact.

## Memory candidate pipeline
Interaction → event/signal → candidate extraction → provenance → sensitivity/policy check → confidence → dedupe/update/decay → durable memory or discard.

## Feedback
Explicit feedback includes correction, like/dislike, “remember this”, “don't remember this” and preference changes. Implicit feedback includes acceptance, rejection, edits, undo, repeated behavior, abandonment and task outcomes. Feedback is weighted by context and confidence; one accidental action must not permanently redefine a preference.

## Personalization
Quanty can personalize wording, recommendations, defaults, workflow ordering and suggestions. It must not infer or expose sensitive attributes merely because behavior correlates with them. Sensitive memory requires stricter policy and user controls.

## E2EE boundary
Server-side Quanty must not receive private E2EE plaintext merely because a user has Quanty enabled. Local Quanty or an explicit, narrow plaintext handoff can operate within the owning product's boundary.

## Memory controls
Users can inspect important remembered preferences, correct them, request that a memory not be used, export permitted personal data and request deletion according to retention policy. Quanty must explain why a remembered preference affected a recommendation when policy allows.

## Learning boundary
User personalization is primarily retrieval/context and governed adaptation. Foundation-model weights are not silently updated per individual user from private interactions. Aggregate model improvement, when permitted, is a separate governed process.

## Implementation
MEM-01 memory schema; MEM-02 provenance; MEM-03 candidate extractor; MEM-04 confidence/decay; MEM-05 retrieval gateway; MEM-06 policy/sensitivity; MEM-07 feedback signals; MEM-08 user controls; MEM-09 E2EE boundary; MEM-10 evaluation against personalization drift.
