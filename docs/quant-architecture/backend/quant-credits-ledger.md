# Quant Credits Ledger

Quant Credits are a platform-wide internal credit unit.

## Rules
- One immutable ledger per credit account.
- Grant, purchase, spend, reserve, release, expire, and adjustment are distinct entry types.
- Available balance = ledger-derived balance minus active reservations.
- Reservation prevents concurrent spending races.
- Spend commits only after the consuming operation reaches its defined acceptance point.
- Failed/cancelled operations release reservations.
- Expiration is an explicit ledger event; never mutate an old entry.
- Transfers, if introduced, require two linked ledger entries and anti-fraud policy.

## Atomicity
A spend operation locks the account/version, validates available credits, writes reservation/ledger state, and emits an outbox event in one transaction.

## Reconciliation
Daily and on-demand reconciliation compares derived balances, ledger totals, product usage, and invoice effects. Any mismatch becomes an investigation record; it is never silently patched.
