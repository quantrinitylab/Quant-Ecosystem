# Quant Knowledge Graph

## Purpose

Represent relationships among people, content, events, projects, files, repositories, conversations, interests, and activities.

## Entity examples

Person, Organization, Project, File, Folder, Message, Thread, Event, Repository, Issue, PullRequest, Creator, Topic, Interest, Product, Goal, Decision.

## Edge examples

OWNS, CREATED, AUTHORED, ATTENDED, MENTIONED, RELATED_TO, PART_OF, STORED_IN, SHARED_WITH, WORKED_ON, DISCUSSED_IN, INTERESTED_IN, PARTICIPATED_IN, FOLLOWS, REPLIED_TO, DEPENDS_ON.

## Edge provenance

Every meaningful derived edge records source references, confidence, timestamps, and whether it is explicit or inferred.

## Graph rules

Never infer sensitive relationships solely from weak co-occurrence. Do not expose hidden graph edges simply because two objects are semantically similar.

## Graph + source ownership

The graph points to canonical IDs. It does not duplicate full source objects as its own authority.
