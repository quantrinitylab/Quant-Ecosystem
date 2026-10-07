# 11 — API, Event and Tool Contracts

Three core contract types:
1. Query — read state.
2. Command — request state transition.
3. Event — announce completed transition.

Quanty tools are a governed presentation of commands/queries.

Every public contract has owner, version, schema, auth requirement, error model, idempotency rule, timeout, rate limit, observability fields and compatibility policy.

Example QuantMail commands: searchThreads, getThread, draftReply, sendMessage, archiveThread.

Example events: mail.message.sent.v1, chat.message.created.v1, gram.post.published.v1, tube.video.published.v1, cooks.render.completed.v1.

Breaking changes require a new version, migration period, consumer inventory, deprecation date and telemetry proving old consumers are gone.