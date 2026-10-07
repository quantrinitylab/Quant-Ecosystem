# QuantMail Web — M13 Delivery

## Send status

After send, show compact state:
Queued -> Sending -> Delivered / Deferred / Failed.

Delivery detail can show recipient-level status.

## Failure

A failed send keeps the draft available for recovery.

Temporary failures offer retry when safe.
Permanent failures offer correction rather than blind retry.

## Domain health

Admins can inspect authentication and delivery health without exposing secrets.
