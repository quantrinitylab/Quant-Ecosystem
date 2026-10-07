# 33 — Quanty App Capability and Tool Registry

## Purpose
The registry is the machine-readable map of what every Quant product allows Quanty to read, draft, mutate, navigate and verify.

## Product registration
Each app declares:
product_id, manifest_version, supported_platforms, routes, resource_types, commands, queries, events, quanty_tools, navigation_targets, handoff_actions, background_capabilities, confirmation_policy and compatibility_range.

## Tool examples
QuantMail: mail.search, mail.open_thread, mail.create_draft, mail.send, mail.archive, calendar.create_event, meet.create.
QuantChat: chat.search, chat.open_conversation, chat.create_draft, chat.send, chat.start_call, chat.start_meeting.
QuantMax: max.search_game, max.open_game, max.create_party, max.start_game, max.join_game, max.read_result.
QuantCooks: cooks.search_effect, cooks.preview_effect, cooks.apply_effect, cooks.publish_effect.
QuantGit: git.search_repo, git.open_repo, git.create_branch, git.run_ci, git.open_logs, git.request_release.
QuantGram/QuantWave/QuanTube/QuantAds expose their own typed product-owned capabilities.

## Capability levels
read, draft, mutate, navigate, verify, background. A tool may combine levels but must declare each one.

## Grant lifecycle
requested → evaluated → granted → used → expired/revoked. Grants are scoped by user, session/task, product, resource and expiry.

## Tool discovery
The orchestrator discovers tools from the registry after intent classification. It does not expose every tool to every agent prompt.

## Tool execution
Tool call → authorization → idempotency → product command → event/state verification → redacted audit. A successful tool response without verification is not completion.

## Registry safety
Registry changes require owner approval, schema validation, compatibility tests, capability review and audit. A malicious tool manifest cannot grant itself higher privilege.

## Quanty UI
The user can see the high-level capability requested when a confirmation is required. Internal tool names are not exposed as confusing implementation details.
