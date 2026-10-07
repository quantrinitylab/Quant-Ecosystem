# QuantChat — Capability Architecture

This is the product-owned capability contract that feeds the ecosystem capability registry. It does not replace authorization. Registry describes capability; QuantChat policy and runtime authorization decide whether the capability may execute.

## Capability groups

### Conversations
- `quantchat.conversation.create`
- `quantchat.conversation.read`
- `quantchat.conversation.update`
- `quantchat.conversation.archive`
- `quantchat.conversation.delete`
- `quantchat.member.invite`
- `quantchat.member.remove`
- `quantchat.member.update_role`

### Messages
- `quantchat.message.list`
- `quantchat.message.read`
- `quantchat.message.search`
- `quantchat.message.prepare`
- `quantchat.message.send`
- `quantchat.message.edit`
- `quantchat.message.delete`
- `quantchat.message.react`
- `quantchat.message.save`
- `quantchat.thread.create`
- `quantchat.thread.reply`

### Channels and communities
- `quantchat.channel.create`
- `quantchat.channel.read`
- `quantchat.channel.update`
- `quantchat.channel.delete`
- `quantchat.community.create`
- `quantchat.community.read`
- `quantchat.community.update`
- `quantchat.community.moderate`
- `quantchat.community.member_manage`

### Calls
- `quantchat.call.prepare`
- `quantchat.call.start`
- `quantchat.call.join`
- `quantchat.call.end`
- `quantchat.call.mute`
- `quantchat.call.screen_share`
- `quantchat.call.record`

### Resources
- `quantchat.resource.attach`
- `quantchat.resource.resolve`
- `quantchat.resource.open`

### Quanty
- `quantchat.quanty.search_context`
- `quantchat.quanty.summarize`
- `quantchat.quanty.prepare_reply`
- `quantchat.quanty.prepare_announcement`
- `quantchat.quanty.send_message`
- `quantchat.quanty.schedule_call`
- `quantchat.quanty.moderate`

### Safety
- `quantchat.safety.report`
- `quantchat.safety.block`
- `quantchat.safety.mute`
- `quantchat.safety.review`
- `quantchat.safety.action`
- `quantchat.safety.appeal`

## Risk classification

| Capability | Default risk |
|---|---|
| read/search/list | 0 |
| summarize/prepare/draft | 1 |
| react/save/mute/block | 2 |
| send/invite/create/start-call | 3 |
| delete/remove-member/moderation/admin/recording | 4 |

Actual risk is policy/context dependent.

## Required capability metadata

Every capability implementation MUST declare:

- stable name
- semantic version
- input schema
- output schema
- caller types
- tenant scope
- resource scope
- required permissions
- risk tier
- approval requirement
- idempotency behavior
- timeout
- cost/credit behavior if metered
- audit event
- verification event
- degraded behavior
- rollback/undo behavior where possible

## Quanty restriction

Quanty receives a policy-filtered projection of these capabilities. It must never receive direct Prisma/database access as a substitute for capability execution.

## Cross-app rule

A capability may accept `QuantResourceRef` values from another product, but the owning product remains authoritative and authorization is re-evaluated when the resource is resolved.
