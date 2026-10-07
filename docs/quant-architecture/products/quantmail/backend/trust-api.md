# M14 Backend — Trust API

## User APIs

mail.security.get_message_assessment
mail.security.get_sender_assessment
mail.security.report
mail.security.release_quarantine
mail.security.mark_not_spam

## Admin APIs

admin.mail.security.policy.get
admin.mail.security.policy.update
admin.mail.security.quarantine.list
admin.mail.security.quarantine.release
admin.mail.security.reports.list

## Response

Expose:
- decision
- severity
- concise reason
- safe evidence categories
- recommended action

Do not expose raw classifier internals, private reputation features or attacker-sensitive thresholds.
