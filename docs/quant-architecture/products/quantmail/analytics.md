# QuantMail Analytics — Inbox

Analytics must measure product behavior without becoming part of the transactional path.

## Events

- inbox_opened
- inbox_mode_selected
- thread_opened
- thread_read
- thread_starred
- thread_archived
- bulk_action_completed
- search_started
- search_result_opened
- quanty_suggestion_shown
- quanty_suggestion_accepted
- quanty_suggestion_rejected

## Properties

Allowed:
- product
- surface
- mode
- action
- latency bucket
- result count bucket
- client platform
- app version

Avoid:
- raw message body
- full subject
- recipient addresses unless explicitly approved for a product measurement
- authentication secrets

## SLO-oriented metrics

Operational:
- inbox list latency
- mutation latency
- error rate
- projection lag
- event publication lag

Product:
- time to first useful thread
- read-to-action conversion
- archive completion rate
- search success rate
- Quanty suggestion acceptance rate

Analytics outage must not block mail operations.
