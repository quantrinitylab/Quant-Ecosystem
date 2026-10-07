# Payment Provider Abstraction

## Adapter contract
Every provider adapter implements:
- createCustomer
- createCheckoutSession
- authorizePayment
- capturePayment
- voidPayment
- createRefund
- retrievePayment
- retrieveSubscription
- cancelSubscription
- createPortalSession

Adapters return normalized Economy objects plus provider references and raw-response hashes where useful for evidence.

## Isolation
Product code never imports a provider SDK. Economy invokes a provider adapter selected by policy.

## Provider selection
Selection may consider country, currency, payment method, risk, cost, availability, and residency constraints. The selected provider is persisted for the transaction so retries do not unexpectedly switch processors.

## Secrets
Provider credentials are injected through workload identity/secrets management. They are never stored in application configuration tables or returned through APIs.
