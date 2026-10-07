# 16 — Repository Target Tree

This is the target repository shape. It is a migration target, not permission to mass-move existing code immediately.

```text
docs/quant-architecture/
  company/ strategy.md operating-model.md org-functions.md governance.md risk-register.md
  platform/ identity/ authorization/ api/ events/ realtime/ search/ storage/ notifications/ experimentation/ feature-flags/ audit/
  intelligence/ quanty/ models/ memory/ knowledge-graph/ algorithms/ trust-safety/
  economy/ ledger/ pricing/ billing/ payouts/ reconciliation/
  clients/ web/ flutter/ desktop/ platform-capabilities.md
  products/ quantmail/ quantchat/ quantai/ quantgram/ quantwave/ quantube/ quantmax/ quantcooks/ quantads/
  operations/ sre/ observability/ disaster-recovery/ release-engineering/
  execution/ roadmap.md dependency-graph.md milestones/ work-orders/
```

Each product eventually gets product-charter, domain-model, journeys, information-architecture, navigation, screens/, backend/, admin/, mobile/, web/, desktop/, algorithms, quanty-tools, analytics, security, testing and rollout specs.

Do not create empty directories merely for appearance. A directory becomes real when its owner, contracts and first implementation task are defined.