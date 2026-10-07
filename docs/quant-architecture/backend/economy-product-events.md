# Economy Product Events

Canonical events include:
- economy.product.usage_recorded.v1
- economy.product.credit_reserved.v1
- economy.product.credit_spent.v1
- economy.product.credit_released.v1
- economy.product.entitlement_checked.v1
- economy.product.entitlement_changed.v1
- economy.product.overage_started.v1

Events carry account/org scope, product ID, contract version, correlation ID, occurredAt, and idempotency identity.

Events contain minimum necessary data; raw content is not embedded.
