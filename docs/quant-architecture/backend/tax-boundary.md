# Tax Boundary

Tax is a policy/compliance boundary, not a UI calculation.

## Flow
Checkout/invoice inputs → tax provider or approved tax engine → validated tax result → persisted tax transaction → invoice.

Persist:
- jurisdiction
- tax category
- taxable base
- rate/result
- provider/reference
- calculation timestamp
- policy/version

Tax changes never rewrite historical invoices.

The system must distinguish estimated tax from finalized tax. If required tax evidence is unavailable, checkout follows configured fail/hold behavior rather than inventing a rate.
