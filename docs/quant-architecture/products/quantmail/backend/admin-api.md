# M11 Backend — Admin API

## Domains

admin.mail.domains.list
admin.mail.domains.create
admin.mail.domains.update
admin.mail.domains.verify

admin.mail.mailboxes.list
admin.mail.mailboxes.suspend
admin.mail.mailboxes.restore

admin.mail.aliases.list
admin.mail.aliases.create
admin.mail.aliases.update
admin.mail.aliases.delete

admin.mail.groups.list
admin.mail.groups.create
admin.mail.groups.update
admin.mail.groups.delete

admin.mail.policies.get
admin.mail.policies.update

admin.mail.retention.get
admin.mail.retention.update

admin.mail.quotas.get
admin.mail.quotas.update

admin.mail.audit.list

## Mutation requirements

Broad mutations require:
- authorized role
- organization scope
- expectedVersion
- idempotency key
- audit reason when policy requires

API responses never leak data outside the admin's authorized scope.
