# QuantDrive Memory Architecture — Deep Foundation

## 1. Vision

QuantDrive is not merely cloud storage. It is the governed personal information and memory substrate of the Quant ecosystem.

It has two distinct responsibilities:

1. Store and protect canonical user-owned information.
2. Provide a governed memory/context substrate that Quanty and authorized products can query without turning the entire user's life into unrestricted model context.

The memory system is cross-product, but source ownership remains with each product.

## 2. Core law

**Source truth stays where it was created. Memory is a derived, governed representation.**

Mail owns mail. Calendar owns events. Contacts owns people. QuantGit owns Git objects. Drive owns files. QuantDrive Memory may reference all of them but must never silently become their source of truth.

## 3. Memory layers

### Layer A — Source objects
Canonical objects from Mail, Calendar, Drive, Contacts, Git and other authorized products.

### Layer B — Facts
Explicit, attributable facts extracted from source objects. Example: preferred programming language mentioned by the user.

### Layer C — Episodic memory
Important past interactions/events: decisions, projects, conversations, milestones, completed tasks, meaningful experiences.

### Layer D — Semantic memory
Generalized durable knowledge about the user, preferences, recurring workflows, projects, interests, and stable relationships.

### Layer E — Relationship/knowledge graph
Entities and typed relationships connecting people, projects, files, events, messages, interests, products, and activities.

### Layer F — Context state
Short-lived state for current task/session/recent activity. Context can expire without becoming long-term memory.

### Layer G — Inference signals
Probabilistic interpretations such as likely current interest or possible mood. These are never equivalent to facts.

## 4. Memory lifecycle

OBSERVED → CANDIDATE → VALIDATED/CONFIRMED → ACTIVE → REVISED → EXPIRED/DEPRECATED → DELETED.

A model-generated candidate does not automatically become durable memory. Promotion requires policy based on confidence, provenance, sensitivity, usefulness, and user controls.

## 5. Provenance

Every durable memory should retain provenance sufficient to answer: where did this come from, when was it observed, which product owns the source, what transformation created it, what confidence exists, and what policy permitted retention?

## 6. Retrieval contract

Quanty requests memory through a governed retrieval API. Retrieval should return compact memory records with provenance, confidence, freshness, sensitivity classification, source references, and why the memory matched.

Raw private source content is not automatically returned merely because a related memory exists.

## 7. Memory is not chat history

Conversation history is a source/episode. Durable memory is a curated derivative. The system must prevent accidental permanent memory creation from every conversation.

## 8. Memory is not a vector database

Embeddings are one retrieval index. They are not the memory model. Structured facts, graph edges, provenance, lifecycle, authorization, recency, and policy remain first-class.

## 9. Personalization boundary

Products consume approved context through contracts. A feed may use relevant interests and recent context without receiving unrelated private email bodies. A calendar assistant may use scheduling preferences without receiving unrelated media history.

## 10. User control

The user must be able to understand, correct, suppress, expire, export, and delete durable memory subject to legitimate retention/legal constraints. The UI must distinguish canonical source data from derived memory and probabilistic inference.
