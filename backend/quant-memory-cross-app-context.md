# M41 — Cross-App Context Graph

Canonical cross-app relationships include:
Mail ↔ Person, Mail ↔ Event, Mail ↔ File, Mail ↔ Project, Mail ↔ Git work item.
Calendar ↔ Person, Calendar ↔ File, Calendar ↔ Project, Calendar ↔ Mail thread.
Drive ↔ Person, Drive ↔ Project, Drive ↔ Meeting, Drive ↔ Git repository.
Contacts ↔ Mail interaction, Contacts ↔ Meeting, Contacts ↔ Project.
Git ↔ Project, Git ↔ Person, Git ↔ Meeting, Git ↔ File, Git ↔ Mail thread.

Every edge has provenance, confidence, explicitness, validity interval and policy scope. Inferred edges remain visibly inferred.
