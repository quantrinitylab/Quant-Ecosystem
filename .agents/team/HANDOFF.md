# End-of-increment handoff

Use a concise task checkpoint and link it from the relevant PR discussion. Commit only approved public project information. Do not paste private chats, personal/account data, secrets or hidden reasoning.

- Task ID / role / public worker-instance label:
- Current claim ID / generation / expiry (coordination metadata, not credentials):
- Exact feature branch / inspected and resulting commit / PR:
- Goal and explicit allowed paths:
- OBSERVED facts and evidence links:
- REPORTED results not personally verified:
- HYPOTHESES / alternatives still open:
- Changes completed and whether actually committed:
- Commands actually run, runtime/dependency versions, exit/result and evidence:
- Checks NOT run, unavailable tools and acceptance still held:
- Uncommitted work: describe existence/location without promising it is durable; commit approved safe work if possible before stopping:
- Blocker category and next concrete action:
- Suggested replacement scope, if owner-authorized:
- Any owner decisions still required:

## Resume acceptance

The replacement reads the record, refreshes the remote task SHA and feature-branch head, inspects the actual diff, reconciles any commits after the checkpoint, and confirms scope/capability before acquiring a new claim. Do not blindly replay prior commands or a failed side effect. An ambiguous write requires readback, not a duplicate retry.

A hard termination can happen before a handoff. Recovery then relies on previously committed checkpoints and actual repository state; unsaved private context is not guaranteed recoverable.
