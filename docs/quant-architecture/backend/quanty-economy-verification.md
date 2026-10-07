# Quanty Economy Verification

Verification must query authoritative Economy state after side effects.

Examples:
- checkout → subscription/payment/entitlement
- credit spend → ledger/reservation
- refund → refund/payment/ledger
- plan change → subscription/entitlement
- usage action → usage event/charge state

A successful tool call is not proof of financial success.
