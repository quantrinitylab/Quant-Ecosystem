# M17 — Realtime Fanout

WebSocket gateways own connection lifecycle and fanout; product services own event truth.

## Rules
- Persist durable state before publishing its event.
- Authorize every subscription.
- Coalesce replaceable noisy updates such as unread counts.
- Bound per-connection send buffers.
- Large tenants use partitioned channels and isolated fanout.
- Reconnect must recover from authoritative APIs or replayable state.

Realtime is presentation delivery, not the source of truth. Dropped intermediate events must never imply dropped durable state.
