# Quant Knowledge Graph Schema

## Nodes

User, Person, Organization, Project, Goal, Decision, File, Folder, Message, Thread, Event, Repository, Issue, PullRequest, Creator, Topic, Interest, Product, Activity, Memory.

## Edges

OWNS, MEMBER_OF, KNOWS, CONTACTED, EMAILED, ATTENDED, CREATED, AUTHORED, STORED_IN, SHARED_WITH, WORKED_ON, DISCUSSED, RELATED_TO, DEPENDS_ON, FOLLOWS, SAVED, LIKED, VIEWED, REPLIED_TO, HAS_GOAL, MADE_DECISION, REMINDS_OF.

## Edge envelope

edgeId, fromNode, toNode, relation, sourceRefs, confidence, explicitness, observedAt, validFrom, validUntil, status, policyVersion.

## Graph construction

Explicit user actions create high-authority edges. Product events create attributable edges. Model inference creates lower-authority edges that require confidence and policy constraints.

## No graph hallucination

Similarity alone cannot create a durable sensitive relationship. Every inferred edge must be attributable and reversible.
