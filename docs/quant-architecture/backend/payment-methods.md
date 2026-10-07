# Payment Methods

Payment methods are tokenized/provider references.

## Rules
- No raw PAN, CVV, or bank credential storage.
- Default-method changes require authenticated account scope.
- Organization billing and personal billing have separate ownership boundaries.
- Removing a method is blocked when policy requires a replacement.
- Provider availability and supported methods are dynamic; clients consume capability responses.

Sensitive payment-method operations may require step-up authentication.
