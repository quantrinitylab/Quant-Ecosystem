# M38 — QuantCalendar UI/UX Acceptance Tests

## Critical flows
1. Open Week → open event → return → exact date/view/scroll restored.
2. Quick create → expand editor → save → authoritative event appears.
3. Edit recurring event → choose instance/series → save → correct occurrence state verified.
4. RSVP from event → pending → authoritative response state.
5. Find availability → inspect candidate → approve booking → verify event.
6. Open invitation from Mail → Calendar event → return to Mail origin.
7. Conflict detected → inspect conflict → choose explicit resolution.
8. Timezone change/DST boundary → event remains semantically correct.

## Responsive
Test desktop, tablet, mobile, narrow mobile, landscape, large text, reduced motion, keyboard-visible mobile.

## Safety
No suggested slot is labeled booked before confirmation. No Quanty mutation occurs without required approval. Event colors never encode the only conflict/RSVP meaning.
